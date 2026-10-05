import { describe, expect, it } from "vitest";
import { toMarkdown } from "@/lib/export/model";
import { brandHits } from "@/lib/brand-rules";
import { BEISPIEL_FORM, BEISPIEL_KI } from "./beispiel";
import {
  AMPEL_NOTE,
  DEFAULT_FARBE,
  EMPTY_FORM,
  EMPTY_STATE,
  FARBE_FORM_MELDUNG,
  FARBE_HELL_MELDUNG,
  HAKEN,
  KEIN,
  LEISTUNGEN,
  SCHRITTE,
  aktivePakete,
  ampel,
  ampelRegel,
  bewertePakete,
  dossierMarkdown,
  eingabeText,
  einschaetzungText,
  farbProblem,
  inputProblem,
  kiAusgabeText,
  kiBereit,
  kiEingabeText,
  kiSignatur,
  leistungenListe,
  normFarbe,
  ortLabel,
  paketAktiv,
  paketPunkte,
  paketTabelle,
  parseForm,
  parseGanzzahl,
  parseState,
  preisrahmen,
  reichweitenFaktor,
  reportMarkdown,
  textOn,
  toDocument,
  toKiInput,
  viewBlocks,
  zahlenZeilen,
  type Form,
} from "./logic";

const form = (over: Partial<Form> = {}): Form => ({ ...structuredClone(BEISPIEL_FORM), ...over });
const mitPaket = (i: number, patch: Partial<Form["pakete"][number]>): Form => {
  const f = form();
  f.pakete[i] = { ...f.pakete[i], ...patch };
  return f;
};
const nurPaket1 = (patch: Partial<Form["pakete"][number]>): Form => {
  const f = form();
  f.pakete = [{ ...f.pakete[0], ...patch }, { name: "Silber", preis: "", haken: [], social: "", tickets: "", weitere: "" }, { name: "Gold", preis: "", haken: [], social: "", tickets: "", weitere: "" }];
  return f;
};

describe("sponsoring-dossier: Zahlen lesen", () => {
  it("liest ganze Zahlen mit Apostroph, Leerzeichen und Franken-Zusatz, leer ist null, alles andere NaN", () => {
    expect(parseGanzzahl("1500")).toBe(1500);
    expect(parseGanzzahl(" 1'500 ")).toBe(1500);
    expect(parseGanzzahl("1’500.-")).toBe(1500);
    expect(parseGanzzahl("")).toBeNull();
    expect(parseGanzzahl("   ")).toBeNull();
    for (const bad of ["12,5", "12.5", "abc", "-3", "1e3", "99999999999999999999"]) expect(parseGanzzahl(bad), bad).toBeNaN();
  });
});

describe("sponsoring-dossier: Punkte", () => {
  const p = (over: Partial<Parameters<typeof paketPunkte>[0]> = {}) => ({ haken: [], social: 0, tickets: 0, weitere: "", ...over });

  it("zählt die Punkte je Gegenleistung wie im Auftrag", () => {
    const punkte = Object.fromEntries(LEISTUNGEN.map((l) => [l.key, l.punkte]));
    expect(punkte).toEqual({ trikot: 5, bande: 3, website: 1, newsletter: 1, anlaesse: 2, stand: 3, medien: 2 });
    expect(paketPunkte(p({ haken: ["trikot"] }))).toBe(5);
    expect(paketPunkte(p({ haken: ["website", "newsletter", "anlaesse"] }))).toBe(4);
    expect(paketPunkte(p({ haken: ["trikot", "bande", "website", "newsletter", "anlaesse", "stand", "medien"] }))).toBe(17);
    expect(paketPunkte(p())).toBe(0);
  });

  it("zählt Social Media mit 0,5 je Beitrag und höchstens 5 Punkten", () => {
    expect(paketPunkte(p({ social: 1 }))).toBe(0.5);
    expect(paketPunkte(p({ social: 9 }))).toBe(4.5);
    expect(paketPunkte(p({ social: 10 }))).toBe(5);
    expect(paketPunkte(p({ social: 52 }))).toBe(5);
  });

  it("zählt Tickets mit 0,25 je Stück und höchstens 3 Punkten", () => {
    expect(paketPunkte(p({ tickets: 1 }))).toBe(0.25);
    expect(paketPunkte(p({ tickets: 4 }))).toBe(1);
    expect(paketPunkte(p({ tickets: 12 }))).toBe(3);
    expect(paketPunkte(p({ tickets: 500 }))).toBe(3);
  });

  it("zählt die weitere Gegenleistung einmal mit 1 Punkt, Leerraum allein zählt nicht, doppelte Haken zählen einmal", () => {
    expect(paketPunkte(p({ weitere: "Stand am Dorffest" }))).toBe(1);
    expect(paketPunkte(p({ weitere: "   " }))).toBe(0);
    expect(paketPunkte(p({ haken: ["bande", "bande"] }))).toBe(3);
  });

  it("rechnet negative Anzahlen nicht ab", () => {
    expect(paketPunkte(p({ social: -4, tickets: -8 }))).toBe(0);
  });
});

describe("sponsoring-dossier: Rahmen und Faktor", () => {
  it("wählt den Faktor nach Mitgliedern: unter 100 → 1, bis 300 → 1,5, darüber → 2", () => {
    expect(reichweitenFaktor(1)).toBe(1);
    expect(reichweitenFaktor(99)).toBe(1);
    expect(reichweitenFaktor(100)).toBe(1.5);
    expect(reichweitenFaktor(300)).toBe(1.5);
    expect(reichweitenFaktor(301)).toBe(2);
    expect(reichweitenFaktor(5000)).toBe(2);
    expect(reichweitenFaktor(Number.NaN)).toBe(1);
  });

  it("rechnet Punkte mal Faktor mal 100 Franken", () => {
    expect(preisrahmen(4, 50)).toBe(400);
    expect(preisrahmen(4, 280)).toBe(600);
    expect(preisrahmen(4, 500)).toBe(800);
    expect(preisrahmen(0.25, 280)).toBe(37.5);
    expect(preisrahmen(0, 280)).toBe(0);
  });
});

describe("sponsoring-dossier: Ampel", () => {
  it("ist grün von 60 bis 140 % des Rahmens, einschliesslich der Grenzen", () => {
    expect(ampel(600, 1000)?.stufe).toBe("gruen");
    expect(ampel(1000, 1000)?.text).toBe("passt");
    expect(ampel(1400, 1000)?.stufe).toBe("gruen");
  });

  it("ist gelb «eher günstig» unter 60 %", () => {
    const a = ampel(599, 1000);
    expect(a).toMatchObject({ stufe: "gelb", text: "eher günstig" });
    expect(a?.prozent).toBe(59);
    expect(ampel(0, 1000)).toMatchObject({ stufe: "gelb", text: "eher günstig", prozent: 0 });
  });

  it("ist gelb «eher hoch» über 140 % bis einschliesslich 250 %", () => {
    expect(ampel(1401, 1000)).toMatchObject({ stufe: "gelb", text: "eher hoch", prozent: 141 });
    expect(ampel(2500, 1000)).toMatchObject({ stufe: "gelb", text: "eher hoch" });
  });

  it("ist rot über 250 % und sagt, dass der Preis nicht zur Gegenleistung passt", () => {
    expect(ampel(2501, 1000)).toMatchObject({ stufe: "rot", text: "passt nicht zur Gegenleistung" });
    expect(ampel(100000, 1000)?.stufe).toBe("rot");
  });

  it("rechnet mit Rahmen aus Viertelpunkten ohne Rundungsfehler", () => {
    const rahmen = preisrahmen(0.25, 280); // 37,5
    expect(ampel(22.5, rahmen)?.stufe).toBe("gruen"); // genau 60 %
    expect(ampel(52.5, rahmen)?.stufe).toBe("gruen"); // genau 140 %
    expect(ampel(53, rahmen)?.stufe).toBe("gelb");
  });

  it("liefert ohne Rahmen oder mit unbrauchbaren Werten keine Einschätzung", () => {
    expect(ampel(500, 0)).toBeNull();
    expect(ampel(500, -10)).toBeNull();
    expect(ampel(Number.NaN, 1000)).toBeNull();
    expect(ampel(-1, 1000)).toBeNull();
    expect(ampel(500, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("bewertet die Pakete des Beispiels: Bronze und Silber passen, Gold ist eher hoch", () => {
    const b = bewertePakete(BEISPIEL_FORM);
    expect(b.map((x) => [x.name, x.punkte, x.rahmen, x.ampel.text, x.ampel.prozent])).toEqual([
      ["Bronze", 4, 600, "passt", 83],
      ["Silber", 11, 1650, "passt", 91],
      ["Gold", 24, 3600, "eher hoch", 167],
    ]);
    expect(b.every((x) => x.faktor === 1.5)).toBe(true);
  });

  it("lässt die Pakete, wie sie eingegeben wurden, und nennt die Einschätzung im Satz fürs CRM", () => {
    const f = form();
    const vorher = JSON.stringify(f.pakete);
    expect(einschaetzungText(f)).toBe(
      `${AMPEL_NOTE}: Bronze CHF 500.- passt (Rahmen CHF 600.-); Silber CHF 1'500.- passt (Rahmen CHF 1'650.-); Gold CHF 6'000.- eher hoch (Rahmen CHF 3'600.-).`,
    );
    expect(JSON.stringify(f.pakete)).toBe(vorher);
    expect(einschaetzungText(EMPTY_FORM)).toBe("");
  });

  it("beschreibt die Regel aus denselben Konstanten", () => {
    const regel = ampelRegel();
    expect(regel).toContain("Logo auf Trikot 5");
    expect(regel).toContain("Logo auf Website 1");
    expect(regel).toContain("0,5 je Beitrag bis höchstens 5");
    expect(regel).toContain("0,25 je Stück bis höchstens 3");
    expect(regel).toContain("zwischen 60 und 140 % des Rahmens");
    expect(regel).toContain("bis 250 %");
  });
});

describe("sponsoring-dossier: Pakete lesen", () => {
  it("zählt ein Paket erst als angefangen, wenn Preis, Gegenleistung oder Freitext da ist; der Name allein zählt nicht", () => {
    const leer = { name: "Bronze", preis: "", haken: [], social: "", tickets: "", weitere: "" };
    expect(paketAktiv(leer)).toBe(false);
    expect(paketAktiv({ ...leer, social: "0", tickets: "0" })).toBe(false);
    expect(paketAktiv({ ...leer, preis: "500" })).toBe(true);
    expect(paketAktiv({ ...leer, haken: ["bande"] })).toBe(true);
    expect(paketAktiv({ ...leer, social: "3" })).toBe(true);
    expect(paketAktiv({ ...leer, weitere: "Stand" })).toBe(true);
  });

  it("nimmt den Vorschlag als Namen, wenn der Name leer ist, und lässt leere Pakete weg", () => {
    const f = nurPaket1({ name: "  ", preis: "500", haken: ["website"] });
    expect(aktivePakete(f).map((p) => [p.index, p.name, p.preis])).toEqual([[0, "Bronze", 500]]);
  });

  it("beschreibt die Gegenleistungen eines Pakets als Liste", () => {
    const silber = aktivePakete(BEISPIEL_FORM)[1];
    expect(leistungenListe(silber)).toEqual([
      "Logo auf Bande",
      "Logo auf Website",
      "Logo im Newsletter",
      "Nennung bei Anlässen",
      "Beitrag auf Social Media (6 pro Jahr)",
      "Tickets oder Einladungen (4 pro Jahr)",
    ]);
  });
});

describe("sponsoring-dossier: inputProblem", () => {
  it("lässt das Beispiel durch", () => {
    expect(inputProblem(BEISPIEL_FORM)).toBeNull();
  });

  it("verlangt den Namen des Vereins und die Mitglieder", () => {
    expect(inputProblem(form({ verein: "  " }))).toBe("Gib den Namen deines Vereins an.");
    const f = form();
    f.zahlen.mitglieder = "";
    expect(inputProblem(f)).toBe("Gib die Zahl der Mitglieder an.");
    f.zahlen.mitglieder = "0";
    expect(inputProblem(f)).toContain("Mitglieder: Gib eine ganze Zahl zwischen 1 und 1'000'000 an.");
    f.zahlen.mitglieder = "12,5";
    expect(inputProblem(f)).toContain("Mitglieder: Gib eine ganze Zahl");
  });

  it("meldet unbrauchbare freiwillige Zahlen, lässt leere zu und meldet mehr Aktive als Mitglieder", () => {
    const f = form();
    f.zahlen.instagram = "";
    f.zahlen.medien = "";
    expect(inputProblem(f)).toBeNull();
    f.zahlen.anlaesse = "1001";
    expect(inputProblem(f)).toBe("Anlässe pro Jahr: Gib eine ganze Zahl zwischen 0 und 1'000 an.");
    f.zahlen.anlaesse = "14";
    f.zahlen.aktive = "281";
    expect(inputProblem(f)).toBe("Die Aktiven können nicht mehr sein als die Mitglieder.");
    f.zahlen.aktive = "280";
    expect(inputProblem(f)).toBeNull();
  });

  it("verlangt die Zielgruppe mit mindestens 10 und höchstens 300 Zeichen", () => {
    expect(inputProblem(form({ zielgruppe: "" }))).toContain("welche Betriebe zu euch passen");
    expect(inputProblem(form({ zielgruppe: "Betriebe." }))).toContain("mindestens 10 Zeichen");
    expect(inputProblem(form({ zielgruppe: "x".repeat(301) }))).toBe("Die Zielgruppe darf höchstens 300 Zeichen haben.");
    expect(inputProblem(form({ zielgruppe: "Betriebe aus der Region" }))).toBeNull();
  });

  it("verlangt mindestens ein Paket mit Preis und einer Gegenleistung", () => {
    const keins = form({ pakete: structuredClone(EMPTY_FORM.pakete) });
    expect(inputProblem(keins)).toBe("Gib mindestens ein Paket mit Preis und einer Gegenleistung an.");
    expect(inputProblem(nurPaket1({ preis: "500", haken: [] }))).toBe("Paket 1: Wähle mindestens eine Gegenleistung.");
    expect(inputProblem(nurPaket1({ preis: "", haken: ["website"] }))).toBe("Paket 1: Gib den Preis in CHF an.");
    expect(inputProblem(nurPaket1({ preis: "500", haken: [], weitere: "Stand am Dorffest" }))).toBeNull();
  });

  it("prüft den Preis zwischen CHF 50.- und CHF 100'000.-", () => {
    const grenze = "Paket 1: Der Preis muss zwischen CHF 50.- und CHF 100'000.- liegen.";
    expect(inputProblem(nurPaket1({ preis: "49", haken: ["bande"] }))).toBe(grenze);
    expect(inputProblem(nurPaket1({ preis: "100001", haken: ["bande"] }))).toBe(grenze);
    expect(inputProblem(nurPaket1({ preis: "abc", haken: ["bande"] }))).toBe(grenze);
    expect(inputProblem(nurPaket1({ preis: "50", haken: ["bande"] }))).toBeNull();
    expect(inputProblem(nurPaket1({ preis: "100000", haken: ["bande"] }))).toBeNull();
  });

  it("prüft Beiträge (0 bis 52), Tickets, den Freitext und doppelte Namen", () => {
    expect(inputProblem(mitPaket(1, { social: "53" }))).toBe("Paket 2: Beiträge auf Social Media pro Jahr: eine ganze Zahl von 0 bis 52.");
    expect(inputProblem(mitPaket(1, { social: "52" }))).toBeNull();
    expect(inputProblem(mitPaket(1, { tickets: "1001" }))).toContain("Paket 2: Tickets oder Einladungen");
    expect(inputProblem(mitPaket(2, { weitere: "x".repeat(121) }))).toBe("Paket 3: Die weitere Gegenleistung darf höchstens 120 Zeichen haben.");
    expect(inputProblem(mitPaket(1, { name: "bronze" }))).toBe("Paket 2: Der Name «bronze» kommt schon vor. Jedes Paket braucht einen eigenen Namen.");
    expect(inputProblem(mitPaket(0, { name: "x".repeat(41) }))).toBe("Paket 1: Der Name darf höchstens 40 Zeichen haben.");
  });

  it("verlangt den Namen der Ansprechperson und eine brauchbare E-Mail-Adresse, wenn eine da ist", () => {
    expect(inputProblem(form({ kontakt: { ...BEISPIEL_FORM.kontakt, name: "" } }))).toBe("Gib eine Ansprechperson für Rückfragen an.");
    expect(inputProblem(form({ kontakt: { name: "Lea Frei", funktion: "", telefon: "", email: "" } }))).toBeNull();
    expect(inputProblem(form({ kontakt: { name: "Lea Frei", funktion: "", telefon: "", email: "lea@" } }))).toBe("Prüfe die E-Mail-Adresse der Ansprechperson.");
  });

  it("begrenzt Referenzen und Stichworte", () => {
    expect(inputProblem(form({ referenzen: "x".repeat(301) }))).toBe("Die Referenzen dürfen höchstens 300 Zeichen haben.");
    expect(inputProblem(form({ stichworte: "x".repeat(601) }))).toBe("Die Stichworte dürfen höchstens 600 Zeichen haben.");
    expect(inputProblem(form({ referenzen: "", stichworte: "" }))).toBeNull();
  });

  it("meldet die erste Unstimmigkeit in der Reihenfolge des Formulars", () => {
    const f = form({ verein: "", zielgruppe: "", pakete: structuredClone(EMPTY_FORM.pakete) });
    expect(inputProblem(f)).toBe("Gib den Namen deines Vereins an.");
    f.verein = "FC Trogen";
    expect(inputProblem(f)).toContain("welche Betriebe zu euch passen");
  });
});

describe("sponsoring-dossier: Farbe und Kontrast", () => {
  it("nimmt dunkle Farben an und weist zu helle ab", () => {
    expect(farbProblem("#111A28")).toBeNull();
    expect(farbProblem("#1B3A6B")).toBeNull();
    expect(farbProblem("#fff")).toBe(FARBE_HELL_MELDUNG);
    expect(farbProblem("#FFD700")).toBe(FARBE_HELL_MELDUNG);
    expect(farbProblem("#E9E6DF")).toBe(FARBE_HELL_MELDUNG);
  });

  it("weist ungültige Werte ab", () => {
    for (const bad of ["", "blau", "#12", "#GGGGGG", "#1234567"]) expect(farbProblem(bad), bad).toBe(FARBE_FORM_MELDUNG);
  });

  it("meldet eine zu helle Farbe auch als Problem des Formulars", () => {
    expect(inputProblem(form({ farbe: "#FFD700" }))).toBe(FARBE_HELL_MELDUNG);
    expect(inputProblem(form({ farbe: "gelb" }))).toBe(FARBE_FORM_MELDUNG);
  });

  it("wählt auf der Vereinsfarbe Weiss oder Tinte, je nachdem, was mehr Kontrast gibt", () => {
    expect(textOn("#111A28")).toBe("#FFFFFF");
    expect(textOn("#1B3A6B")).toBe("#FFFFFF");
    expect(textOn("#FFD700")).toBe("#0F0F0E");
    expect(textOn("#9AA0A6")).toBe("#0F0F0E");
  });

  it("macht aus einem Hex-Wert Grossbuchstaben und fällt bei Unsinn auf die Standardfarbe zurück", () => {
    expect(normFarbe("#1b3a6b")).toBe("#1B3A6B");
    expect(normFarbe("fff")).toBe("#FFFFFF");
    expect(normFarbe("blau")).toBe(DEFAULT_FARBE);
  });
});

describe("sponsoring-dossier: Dokument", () => {
  const doc = toDocument(BEISPIEL_FORM, null, { datum: "05.10.2026" });
  const heads = (d = doc) => d.blocks.flatMap((b) => (b.type === "heading" ? [b.text] : []));

  it("setzt Deckblatt, Abschnitte in fester Reihenfolge und den Dateinamen", () => {
    expect(doc.title).toBe("Sponsoring FC Trogen");
    expect(doc.subtitle).toBe("Saison 2026/27, Trogen AR");
    expect(doc.firma).toBe("FC Trogen");
    expect(doc.datum).toBe("05.10.2026");
    expect(doc.filename).toBe("sponsoring-dossier-fc-trogen");
    expect(heads()).toEqual([
      "Der Verein in Zahlen",
      "Zielgruppe: Welche Betriebe zu uns passen",
      "Pakete im Vergleich",
      "Bisherige Sponsoren und Partner",
      "Nächste Schritte",
      "Kontakt",
    ]);
  });

  it("zeigt in der Tabelle der Zahlen nur angegebene Werte, als Angaben des Vereins", () => {
    const f = form();
    f.zahlen = { ...f.zahlen, aktive: "", instagram: "0", facebook: "", besuche: "1400", medien: "12" };
    const d = toDocument(f, null);
    const t = d.blocks.find((b) => b.type === "table");
    expect(t).toMatchObject({ type: "table", header: ["Kennzahl", "Angabe des Vereins"] });
    expect(t?.type === "table" && t.rows).toEqual([
      ["Mitglieder", "280"],
      ["Zuschauer pro Anlass", "180"],
      ["Anlässe pro Jahr", "14"],
      ["Website-Besuche pro Monat", "1'400"],
      ["Medienberichte pro Jahr", "12"],
    ]);
    expect(d.blocks).toContainEqual({ type: "paragraph", text: "Alle Zahlen sind Angaben des Vereins." });
  });

  it("zeigt mit nur den Mitgliedern eine Tabelle mit einer Zeile", () => {
    const f = form();
    f.zahlen = { ...EMPTY_FORM.zahlen, mitglieder: "45" };
    const t = toDocument(f, null).blocks.find((b) => b.type === "table");
    expect(t?.type === "table" && t.rows).toEqual([["Mitglieder", "45"]]);
  });

  it("baut die Vergleichstabelle mit Häkchen und Preiszeile und lässt ungenutzte Zeilen weg", () => {
    const t = paketTabelle(aktivePakete(BEISPIEL_FORM));
    expect(t).toMatchObject({ type: "table", header: ["Gegenleistung", "Bronze", "Silber", "Gold"] });
    if (t.type !== "table") throw new Error("Tabelle erwartet");
    expect(t.rows[0]).toEqual(["Logo auf Trikot", KEIN, KEIN, HAKEN]);
    expect(t.rows.find((r) => r[0] === "Logo auf Bande")).toEqual(["Logo auf Bande", KEIN, HAKEN, HAKEN]);
    expect(t.rows.find((r) => r[0] === "Beiträge auf Social Media pro Jahr")).toEqual(["Beiträge auf Social Media pro Jahr", KEIN, "6", "12"]);
    expect(t.rows.find((r) => r[0] === "Tickets oder Einladungen pro Jahr")).toEqual(["Tickets oder Einladungen pro Jahr", KEIN, "4", "8"]);
    expect(t.rows.some((r) => r[0] === "Weitere Gegenleistung")).toBe(false);
    expect(t.rows[t.rows.length - 1]).toEqual(["Preis", "CHF 500.-", "CHF 1'500.-", "CHF 6'000.-"]);
  });

  it("zeigt mit nur einem Paket eine Spalte und die weitere Gegenleistung als Text", () => {
    const f = nurPaket1({ name: "Partner", preis: "800", haken: ["bande"], weitere: "Stand am Dorffest" });
    const t = paketTabelle(aktivePakete(f));
    if (t.type !== "table") throw new Error("Tabelle erwartet");
    expect(t.header).toEqual(["Gegenleistung", "Partner"]);
    expect(t.rows).toEqual([["Logo auf Bande", HAKEN], ["Weitere Gegenleistung", "Stand am Dorffest"], ["Preis", "CHF 800.-"]]);
  });

  it("ohne KI gibt es kein Porträt und kein «Warum», mit KI beides, und der Dank steht bei den nächsten Schritten", () => {
    expect(heads()).not.toContain("Porträt des Vereins");
    expect(heads()).not.toContain("Warum Sponsoring hier wirkt");
    const mit = toDocument(BEISPIEL_FORM, BEISPIEL_KI);
    expect(heads(mit)).toEqual([
      "Porträt des Vereins",
      "Der Verein in Zahlen",
      "Zielgruppe: Welche Betriebe zu uns passen",
      "Warum Sponsoring hier wirkt",
      "Pakete im Vergleich",
      "Bisherige Sponsoren und Partner",
      "Nächste Schritte",
      "Kontakt",
    ]);
    expect(mit.blocks).toContainEqual({ type: "paragraph", text: BEISPIEL_KI.portraet });
    expect(mit.blocks).toContainEqual({ type: "paragraph", text: BEISPIEL_KI.warum });
    const i = mit.blocks.findIndex((b) => b.type === "heading" && b.text === "Nächste Schritte");
    expect(mit.blocks[i + 1]).toEqual({ type: "paragraph", text: BEISPIEL_KI.dank });
  });

  it("nennt drei feste Schritte: Gespräch, Vertrag auf Papier, Dank und Bericht", () => {
    expect(SCHRITTE).toHaveLength(3);
    expect(SCHRITTE.map((s) => s.split(":")[0])).toEqual(["Gespräch", "Vertrag auf Papier", "Dank und Bericht"]);
    const i = doc.blocks.findIndex((b) => b.type === "heading" && b.text === "Nächste Schritte");
    expect(doc.blocks[i + 1]).toEqual({ type: "list", ordered: true, items: [...SCHRITTE] });
  });

  it("macht aus mehreren Zeilen der Referenzen eine Liste, aus einer einen Absatz, und lässt leere weg", () => {
    expect(doc.blocks).toContainEqual({ type: "list", items: ["Schreinerei Eugster", "Gartenbau Zuberbühler"] });
    expect(toDocument(form({ referenzen: "Schreinerei Eugster" }), null).blocks).toContainEqual({ type: "paragraph", text: "Schreinerei Eugster" });
    expect(heads(toDocument(form({ referenzen: "  \n " }), null))).not.toContain("Bisherige Sponsoren und Partner");
  });

  it("zeigt den Kontakt mit den ausgefüllten Zeilen, Funktion bei der Person und Website, wenn eine da ist", () => {
    const k = doc.blocks.find((b) => b.type === "facts");
    expect(k).toEqual({
      type: "facts",
      items: [
        { label: "Ansprechperson", value: "Lea Frei, Präsidentin" },
        { label: "Telefon", value: "071 000 00 00" },
        { label: "E-Mail", value: "sponsoring@fc-trogen.example" },
      ],
    });
    const nurName = toDocument(form({ kontakt: { name: "Lea Frei", funktion: "", telefon: "", email: "" }, website: "fc-trogen.example" }), null);
    expect(nurName.blocks.find((b) => b.type === "facts")).toEqual({
      type: "facts",
      items: [
        { label: "Ansprechperson", value: "Lea Frei" },
        { label: "Website", value: "fc-trogen.example" },
      ],
    });
  });

  it("enthält nirgends die Ampel: Sie ist eine Einschätzung für den Verein, nicht für Sponsoren", () => {
    const md = dossierMarkdown(BEISPIEL_FORM, BEISPIEL_KI);
    expect(md).not.toMatch(/eher hoch|eher günstig|passt nicht|Einschätzung von Alperna|Marktdaten/);
  });

  it("spricht Sponsoren nie mit Du an und verstösst nicht gegen die Sperrliste", () => {
    const md = dossierMarkdown(BEISPIEL_FORM, BEISPIEL_KI);
    expect(md).not.toMatch(/(?<![\p{L}])(?:du|dich|dir|dein\p{L}*)(?![\p{L}])/iu);
    expect(brandHits(md).filter((h) => h.level === "hart")).toEqual([]);
    expect(md).not.toMatch(/!|—/);
  });

  it("kommt mit fast leeren Angaben ohne Fehler aus", () => {
    const d = toDocument(EMPTY_FORM, null);
    expect(d.title).toBe("Sponsoring-Dossier");
    expect(d.subtitle).toBeUndefined();
    expect(d.blocks.some((b) => b.type === "table")).toBe(false);
    expect(toMarkdown(d).startsWith("# Sponsoring-Dossier")).toBe(true);
  });

  it("zeigt im Titel den Ort mit Kanton und fällt ohne Ort auf den Kanton zurück", () => {
    expect(ortLabel({ ort: "Trogen", kanton: "AR" })).toBe("Trogen AR");
    expect(ortLabel({ ort: "Trogen", kanton: "" })).toBe("Trogen");
    expect(ortLabel({ ort: "", kanton: "AR" })).toBe("Kanton Appenzell Ausserrhoden");
    expect(ortLabel({ ort: " Gossau  SG ", kanton: "xx" })).toBe("Gossau SG");
    expect(ortLabel({ ort: "", kanton: "" })).toBe("");
  });

  it("gibt dem Bildschirm Titel und Untertitel vorne und die Abschnitte eine Stufe tiefer", () => {
    const v = viewBlocks(doc);
    expect(v[0]).toEqual({ type: "heading", level: 1, text: "Sponsoring FC Trogen" });
    expect(v[1]).toEqual({ type: "paragraph", text: "Saison 2026/27, Trogen AR" });
    expect(v[2]).toMatchObject({ type: "heading", level: 2, text: "Der Verein in Zahlen" });
  });
});

describe("sponsoring-dossier: CRM", () => {
  it("schreibt die Eingabe je Zeile, ohne Kontaktdaten, ohne Namen der Referenzen und ohne Stichworte", () => {
    const text = eingabeText(BEISPIEL_FORM);
    const lines = text.split("\n");
    expect(lines.slice(0, 4)).toEqual(["Verein: FC Trogen", "Ort: Trogen AR", "Anlass oder Saison: Saison 2026/27", "Mitglieder: 280"]);
    expect(text).toContain("Zielgruppe der Sponsoren: Betriebe aus Trogen, Speicher und Teufen");
    expect(text).toContain("Bronze: CHF 500.-; Logo auf Website, Logo im Newsletter, Nennung bei Anlässen");
    expect(text).toContain("Gold: CHF 6'000.-; Logo auf Trikot");
    expect(text).toContain("Referenzen: angegeben (die Namen bleiben im Browser)");
    for (const geheim of ["Lea Frei", "071 000 00 00", "fc-trogen.example", "Eugster", "Zuberbühler", "Gegründet 1948"]) expect(text).not.toContain(geheim);
  });

  it("schreibt die Ausgabe als Markdown mit der Einschätzung vorne und ohne Kontakt und Referenzen", () => {
    const md = reportMarkdown(BEISPIEL_FORM, null);
    expect(md.startsWith(`${AMPEL_NOTE}: Bronze CHF 500.- passt`)).toBe(true);
    expect(md).toContain("# Sponsoring FC Trogen");
    expect(md).toContain("| Gegenleistung | Bronze | Silber | Gold |");
    for (const geheim of ["Lea Frei", "071 000 00 00", "fc-trogen.example", "Eugster", "Bisherige Sponsoren", "## Kontakt"]) expect(md).not.toContain(geheim);
  });

  it("schreibt die KI-Absätze lesbar fürs CRM und die Eingabe an die KI ohne Kontakt und Referenzen", () => {
    const input = toKiInput(BEISPIEL_FORM)!;
    const eingabe = kiEingabeText(input);
    expect(eingabe).toContain("Stichworte: Gegründet 1948");
    expect(eingabe).toContain("Mitglieder: 280");
    for (const geheim of ["Lea Frei", "071 000 00 00", "fc-trogen.example", "Eugster"]) expect(eingabe).not.toContain(geheim);
    const ausgabe = kiAusgabeText(BEISPIEL_KI);
    expect(ausgabe.startsWith("Porträt des Vereins\nDer FC Trogen wurde 1948")).toBe(true);
    expect(ausgabe).toContain("Dank und nächste Schritte\nWir danken");
  });
});

describe("sponsoring-dossier: Eingabe an die KI", () => {
  it("braucht Stichworte von mindestens 10 Zeichen", () => {
    expect(kiBereit({ stichworte: "" })).toBe(false);
    expect(kiBereit({ stichworte: "  kurz  " })).toBe(false);
    expect(kiBereit({ stichworte: "Juniorenarbeit" })).toBe(true);
    expect(toKiInput(form({ stichworte: "" }))).toBeNull();
  });

  it("nimmt Verein, Ort, Stichworte, Zielgruppe, Zahlen und Pakete, aber nie Kontakt, Referenzen oder Website", () => {
    const input = toKiInput(form({ website: "fc-trogen.example" }))!;
    expect(Object.keys(input).sort()).toEqual(["ort", "pakete", "stichworte", "verein", "zahlen", "zielgruppe"]);
    expect(input.verein).toBe("FC Trogen");
    expect(input.ort).toBe("Trogen AR");
    expect(input.zahlen[0]).toEqual({ label: "Mitglieder", wert: 280 });
    expect(input.zahlen).toHaveLength(8);
    expect(input.pakete.map((p) => [p.name, p.preis, p.leistungen.length])).toEqual([["Bronze", 500, 3], ["Silber", 1500, 6], ["Gold", 6000, 9]]);
    const json = JSON.stringify(input);
    for (const geheim of ["Lea Frei", "071 000 00 00", "sponsoring@", "Eugster", "fc-trogen.example"]) expect(json).not.toContain(geheim);
  });

  it("liefert null, wenn die Angaben für die Eingabe nicht reichen", () => {
    expect(toKiInput(form({ verein: "" }))).toBeNull();
    expect(toKiInput(form({ zielgruppe: "kurz" }))).toBeNull();
    expect(toKiInput(form({ pakete: structuredClone(EMPTY_FORM.pakete) }))).toBeNull();
  });

  it("ändert die Signatur, wenn sich Preis, Zielgruppe oder Stichworte ändern, nicht aber bei Kontakt, Referenzen und Farbe", () => {
    const basis = kiSignatur(BEISPIEL_FORM);
    expect(basis).not.toBe("");
    expect(kiSignatur(mitPaket(0, { preis: "600" }))).not.toBe(basis);
    expect(kiSignatur(form({ zielgruppe: "Betriebe aus der Region Trogen" }))).not.toBe(basis);
    expect(kiSignatur(form({ stichworte: "Etwas ganz anderes über den Verein" }))).not.toBe(basis);
    expect(kiSignatur(form({ referenzen: "Andere", farbe: "#000000", kontakt: { name: "Hans", funktion: "", telefon: "", email: "" } }))).toBe(basis);
    expect(kiSignatur(form({ stichworte: "" }))).toBe("");
  });
});

describe("sponsoring-dossier: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten und falscher Version den leeren Stand", () => {
    for (const raw of [null, undefined, 42, "text", [], {}, { v: 2 }, { v: 1, form: 5 }]) {
      const s = parseState(raw);
      expect(s.phase, JSON.stringify(raw)).toBe("edit");
      expect(s.ki).toBeNull();
    }
    expect(parseState(null)).toEqual(EMPTY_STATE);
    expect(parseState({ v: 2, phase: "result", form: BEISPIEL_FORM })).toEqual(EMPTY_STATE);
  });

  it("behält ein gültiges Ergebnis samt Formular und KI-Texten", () => {
    const s = parseState({ v: 1, phase: "result", form: BEISPIEL_FORM, ki: BEISPIEL_KI, kiSig: "abc" });
    expect(s.phase).toBe("result");
    expect(s.form).toEqual(BEISPIEL_FORM);
    expect(s.ki).toEqual(BEISPIEL_KI);
    expect(s.kiSig).toBe("abc");
  });

  it("macht aus «result» mit unbrauchbarem Formular ein «edit», damit der Pfad nie ein falsches Ergebnis meldet", () => {
    const kaputt = { ...BEISPIEL_FORM, pakete: [] };
    expect(parseState({ v: 1, phase: "result", form: kaputt }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "result", form: { ...BEISPIEL_FORM, zielgruppe: "" } }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "result" }).phase).toBe("edit");
  });

  it("lässt kaputte KI-Texte allein fallen und behält das Formular", () => {
    const s = parseState({ v: 1, phase: "result", form: BEISPIEL_FORM, ki: { portraet: "zu kurz", warum: 3 }, kiSig: "abc" });
    expect(s.ki).toBeNull();
    expect(s.kiSig).toBe("");
    expect(s.phase).toBe("result");
    expect(s.form.verein).toBe("FC Trogen");
  });

  it("ersetzt unbrauchbare Felder einzeln durch Standardwerte", () => {
    const f = parseForm({
      verein: 7,
      zahlen: { mitglieder: 280, aktive: "85", unbekannt: "9" },
      pakete: [{ name: 5, preis: "500", haken: ["bande", "unsinn", "bande"], social: null }, "kaputt"],
      kontakt: [],
      farbe: "blau",
    });
    expect(f.verein).toBe("");
    expect(f.zahlen.mitglieder).toBe("");
    expect(f.zahlen.aktive).toBe("85");
    expect(Object.keys(f.zahlen)).toHaveLength(8);
    expect(f.pakete).toHaveLength(3);
    expect(f.pakete[0]).toEqual({ name: "Bronze", preis: "500", haken: ["bande"], social: "", tickets: "", weitere: "" });
    expect(f.pakete[1].name).toBe("Silber");
    expect(f.pakete[2].name).toBe("Gold");
    expect(f.kontakt).toEqual({ name: "", funktion: "", telefon: "", email: "" });
    expect(f.farbe).toBe(DEFAULT_FARBE);
  });

  it("lässt getippten Text unverändert, auch mit Leerzeichen am Ende, damit das Tippen nicht springt", () => {
    const s = parseState({ v: 1, phase: "edit", form: { ...EMPTY_FORM, zielgruppe: "Betriebe aus Trogen ", verein: " FC " } });
    expect(s.form.zielgruppe).toBe("Betriebe aus Trogen ");
    expect(s.form.verein).toBe(" FC ");
  });

  it("zählt den Stand als Ergebnis nur mit phase «result» (Pfad-Fortschritt)", () => {
    const edit = parseState({ v: 1, phase: "edit", form: BEISPIEL_FORM });
    expect(edit.phase).toBe("edit");
    expect(zahlenZeilen(edit.form)).toHaveLength(8);
  });
});
