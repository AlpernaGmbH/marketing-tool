import { describe, expect, it } from "vitest";
import type { IcpInput, IcpOutput, Kriterium } from "./generator";
import {
  ABSCHNITTE,
  BEWERTUNG,
  BEWERTUNG_HINWEIS,
  EMPTY_FORM,
  EMPTY_STATE,
  PUNKTEKARTE_TITEL,
  bewerten,
  eingabeText,
  einordnung,
  einzugsgebietVorschlag,
  formFrom,
  formProblem,
  groesseLabel,
  kantonName,
  maxPunkte,
  parseState,
  profilePatch,
  punkteText,
  reportMarkdown,
  toDocument,
  toInput,
  type FormFields,
} from "./logic";

const profile = { firma: "Malerei Keller", branche: "Malerei", ort: "Gossau", kanton: "SG", groesse: "1-9" };

const form: FormFields = {
  angebot: "Fassaden, Innenräume und Farbberatung für Wohnhäuser. Wir arbeiten mit zwei Lehrlingen und einem festen Team.",
  besteKunden: "Eigentümer älterer Einfamilienhäuser, die uns aus dem Dorf kennen und Wert auf saubere Arbeit legen.",
  einzugsgebiet: "",
  auftrag: "Fassade eines Einfamilienhauses, CHF 15'000.- bis 40'000.-",
  nichtPassend: "Grossaufträge mit Generalunternehmer, Anfragen nur über den Preis.",
};

const kriterium = (kriterium: string, punkte: number, warum = "Begründung des Gewichts in einem Satz."): Kriterium => ({ kriterium, punkte, warum });

/** Die Punktekarte aus dem Beispiel in content/tools/icp-builder.md (16 Punkte). */
const beispielKarte: Kriterium[] = [
  kriterium("Einfamilienhaus in Gossau und Umgebung", 3, "Kurze Wege, bekannte Bauart, Empfehlungen im Dorf."),
  kriterium("Fassade oder ganze Wohnung, nicht nur ein Zimmer", 3, "Bei diesen Aufträgen zeigt der Betrieb seine Stärke."),
  kriterium("Anfrage auf Empfehlung oder aus dem Dorf", 2, "Solche Kunden entscheiden nach dem Gespräch, nicht nach dem Preis."),
  kriterium("Eigentümer entscheiden selbst, kein Generalunternehmer", 2, "Direkte Absprachen ohne Zwischenstufe."),
  kriterium("Zeitfenster passt in die Saison", 2, "Fassaden brauchen trockene Wochen."),
  kriterium("Besichtigung vor Ort ist erwünscht", 2, "Zeigt, dass Qualität zählt."),
  kriterium("Haus wurde lange nicht erneuert", 1, "Grösserer Auftrag, dankbarere Kundschaft."),
  kriterium("Fragt nach Farbberatung", 1, "Zusatzleistung, die der Betrieb gern macht."),
];

const output: IcpOutput = {
  segmentName: "Eigentümer älterer Einfamilienhäuser in Gossau und Umgebung",
  beschreibung:
    "Paare und Familien, die ihr Haus seit Jahren besitzen, es gut halten wollen und einen Betrieb aus der Nähe bevorzugen. Sie fragen auf Empfehlung an und entscheiden nach dem Gespräch vor Ort, nicht nach dem tiefsten Preis.",
  merkmale: ["Haus zwischen Gossau und Flawil", "Eigentümer seit vielen Jahren", "Fassade oder Innenräume lange nicht erneuert", "Kennen den Betrieb vom Dorf oder vom Nachbarn"],
  ausloeser: ["Im Frühling vor der Fassadensaison", "Nach einem Hauskauf oder einer Erbschaft", "Wenn der Nachbar frisch gestrichen hat"],
  einwaende: ["Angst vor Mehrkosten während der Arbeit", "Unsicherheit bei der Farbwahl"],
  signale: ["Fragen nach einer Besichtigung vor Ort", "Nennen den Nachbarn als Empfehlung", "Wollen einen Termin in der Saison"],
  nichtIdeal: ["Generalunternehmer mit Ausschreibung", "Anfragen, bei denen nur der Preis zählt"],
  punktekarte: beispielKarte,
};

const input: IcpInput = toInput(profile, form);

describe("icp-builder: Punktekarte", () => {
  it("maxPunkte summiert die Gewichte", () => {
    expect(maxPunkte(output)).toBe(16);
    expect(maxPunkte({ punktekarte: [] })).toBe(0);
    expect(punkteText(1)).toBe("1 Punkt");
    expect(punkteText(3)).toBe("3 Punkte");
  });
  it("ordnet an den Grenzen 50 % und 80 % ein, mit ganzen Zahlen gerechnet", () => {
    expect(BEWERTUNG).toEqual({ passt: 50, sehrGut: 80 });
    expect(einordnung(0, 10)).toBe("nein");
    expect(einordnung(4, 10)).toBe("nein");
    expect(einordnung(5, 10)).toBe("passt");
    expect(einordnung(7, 10)).toBe("passt");
    expect(einordnung(8, 10)).toBe("sehr");
    expect(einordnung(10, 10)).toBe("sehr");
    // 79,9 % bleibt «passt», auch wenn die Anzeige auf 80 % rundet.
    expect(einordnung(799, 1000)).toBe("passt");
    expect(einordnung(0, 0)).toBe("nein");
    expect(einordnung(3, 0)).toBe("nein");
  });
  it("bewerten zählt nur angekreuzte Kriterien und liefert Summe, Prozent und Text", () => {
    expect(bewerten(output, [])).toEqual({ punkte: 0, max: 16, prozent: 0, stufe: "nein", text: "passt eher nicht" });
    expect(bewerten(output, output.punktekarte.map(() => true))).toEqual({ punkte: 16, max: 16, prozent: 100, stufe: "sehr", text: "passt sehr gut" });
    expect(bewerten(output, [true, true, true, false, false, false, false, false])).toMatchObject({ punkte: 8, prozent: 50, stufe: "passt" });
    expect(bewerten(output, [true, true, false, false, false, false, true, false])).toMatchObject({ punkte: 7, prozent: 44, stufe: "nein" });
    // Kreuze über die Karte hinaus zählen nicht.
    expect(bewerten(output, [...output.punktekarte.map(() => false), true, true]).punkte).toBe(0);
    expect(bewerten({ punktekarte: [] }, [true])).toMatchObject({ punkte: 0, max: 0, prozent: 0, stufe: "nein" });
  });
  it("rechnet die zwei Bewertungen aus dem Beispiel im Seitentext", () => {
    // Treppenhaus in einem Mehrfamilienhaus in Wil, über ein Vergleichsportal: Kriterien 4 und 5 treffen zu.
    expect(bewerten(output, [false, false, false, true, true, false, false, false])).toMatchObject({ punkte: 4, max: 16, prozent: 25, text: "passt eher nicht" });
    // Fassade eines Einfamilienhauses in Andwil, Empfehlung des Nachbarn, Besichtigung erwünscht: Kriterien 1 bis 6.
    expect(bewerten(output, [true, true, true, true, true, true, false, false])).toMatchObject({ punkte: 14, max: 16, prozent: 88, text: "passt sehr gut" });
  });
});

describe("icp-builder: Eingabeprüfung", () => {
  it("meldet fehlenden Betrieb, zu kurze oder zu lange Pflichtfelder und zu lange freiwillige Felder", () => {
    expect(formProblem(form, {})).toBe("Gib den Namen deines Betriebs an.");
    expect(formProblem(form, { firma: "   " })).toBe("Gib den Namen deines Betriebs an.");
    expect(formProblem({ ...form, angebot: "" }, profile)).toMatch(/Angebot mit mindestens 20 Zeichen/);
    expect(formProblem({ ...form, angebot: "                         " }, profile)).toMatch(/Angebot mit mindestens 20 Zeichen/);
    expect(formProblem({ ...form, angebot: "x".repeat(801) }, profile)).toMatch(/höchstens 800 Zeichen/);
    expect(formProblem({ ...form, besteKunden: "zu kurz" }, profile)).toMatch(/besten Kunden mit mindestens 20 Zeichen/);
    expect(formProblem({ ...form, besteKunden: "x".repeat(801) }, profile)).toMatch(/höchstens 800 Zeichen/);
    expect(formProblem({ ...form, einzugsgebiet: "x".repeat(121) }, profile)).toMatch(/Einzugsgebiet ist zu lang/);
    expect(formProblem({ ...form, auftrag: "x".repeat(201) }, profile)).toMatch(/typische Auftrag ist zu lang/);
    expect(formProblem({ ...form, nichtPassend: "x".repeat(601) }, profile)).toMatch(/höchstens 600 Zeichen/);
    expect(formProblem(form, profile)).toBeNull();
    expect(formProblem({ ...form, einzugsgebiet: "", auftrag: "", nichtPassend: "" }, { firma: "Malerei Keller" })).toBeNull();
  });
});

describe("icp-builder: Eingabe für die KI", () => {
  it("übernimmt Profil und Formular, nimmt Kantonsname und Label der Grösse und schlägt das Einzugsgebiet vor", () => {
    expect(input).toEqual({
      betrieb: "Malerei Keller",
      branche: "Malerei",
      ort: "Gossau",
      kanton: "St. Gallen",
      groesse: "1 bis 9 Mitarbeitende",
      angebot: form.angebot,
      besteKunden: form.besteKunden,
      einzugsgebiet: "Gossau und Umgebung, Kanton St. Gallen",
      auftrag: form.auftrag,
      nichtPassend: form.nichtPassend,
    });
    expect(toInput(profile, { ...form, einzugsgebiet: "  Ostschweiz  " }).einzugsgebiet).toBe("Ostschweiz");
  });
  it("kommt mit leerem Profil aus, bereinigt Leerraum und kürzt auf die Grenzen", () => {
    const i = toInput({ firma: " Malerei   Keller " }, { ...form, angebot: `  ${"x".repeat(900)}  `, nichtPassend: "a\n\n\n\nb" });
    expect(i.betrieb).toBe("Malerei Keller");
    expect(i.branche).toBe("");
    expect(i.kanton).toBe("");
    expect(i.groesse).toBe("");
    expect(i.einzugsgebiet).toBe("");
    expect(i.angebot).toHaveLength(800);
    expect(i.nichtPassend).toBe("a\n\nb");
  });
  it("kantonName, groesseLabel und einzugsgebietVorschlag kennen die Werte des Profils und lassen Unbekanntes stehen", () => {
    expect(kantonName("AR")).toBe("Appenzell Ausserrhoden");
    expect(kantonName("XX")).toBe("XX");
    expect(kantonName("")).toBe("");
    expect(groesseLabel("10-49")).toBe("10 bis 49 Mitarbeitende");
    expect(groesseLabel("51-200", "verein")).toBe("51 bis 200 Mitglieder");
    expect(groesseLabel("51-200")).toBe("51 bis 200 Mitglieder");
    expect(groesseLabel("gross")).toBe("gross");
    expect(groesseLabel(undefined)).toBe("");
    expect(einzugsgebietVorschlag("Gossau", "SG")).toBe("Gossau und Umgebung, Kanton St. Gallen");
    expect(einzugsgebietVorschlag("Herisau", "")).toBe("Herisau und Umgebung");
    expect(einzugsgebietVorschlag("", "TG")).toBe("Kanton Thurgau");
    expect(einzugsgebietVorschlag()).toBe("");
  });
  it("eingabeText nennt die Angaben je Zeile, lässt Leeres weg und bricht keine Zeilen um", () => {
    const text = eingabeText({ ...input, branche: "", nichtPassend: "Preis\nzählt" });
    expect(text.split("\n")).toEqual([
      "Betrieb: Malerei Keller",
      "Ort: Gossau",
      "Kanton: St. Gallen",
      "Grösse: 1 bis 9 Mitarbeitende",
      "Einzugsgebiet: Gossau und Umgebung, Kanton St. Gallen",
      `Typischer Auftrag: ${form.auftrag}`,
      `Angebot: ${form.angebot}`,
      `Beste Kunden: ${form.besteKunden}`,
      "Nicht passende Anfragen: Preis zählt",
    ]);
  });
  it("formFrom liefert die fünf Felder aus der Eingabe, ohne Eingabe das leere Formular", () => {
    expect(formFrom(input)).toEqual({ ...form, einzugsgebiet: "Gossau und Umgebung, Kanton St. Gallen" });
    expect(formFrom(null)).toBe(EMPTY_FORM);
  });
});

describe("icp-builder: Dokument", () => {
  it("enthält Facts, KI-Hinweis, alle Abschnitte, die Punktekarte als Tabelle und den Hinweis zur Bewertung", () => {
    const doc = toDocument(output, input);
    expect(doc.title).toBe("Idealkundenprofil");
    expect(doc.subtitle).toBe(output.segmentName);
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("icp-malerei-keller");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller" },
        { label: "Branche", value: "Malerei" },
        { label: "Einzugsgebiet", value: "Gossau und Umgebung, Kanton St. Gallen" },
      ],
    });
    const text = JSON.stringify(doc.blocks);
    expect(text).toContain("Von einer KI formuliert");
    expect(text).toContain(output.beschreibung);
    for (const a of ABSCHNITTE) {
      expect(text).toContain(a.titel);
      for (const item of output[a.key]) expect(text).toContain(item);
    }
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    if (table?.type === "table") {
      expect(table.header).toEqual(["Kriterium", "Punkte", "Warum"]);
      expect(table.rows).toHaveLength(8);
      expect(table.rows[0]).toEqual(["Einfamilienhaus in Gossau und Umgebung", "3", "Kurze Wege, bekannte Bauart, Empfehlungen im Dorf."]);
    }
    expect(text).toContain(PUNKTEKARTE_TITEL);
    expect(text).toContain("Höchstens 16 Punkte.");
    expect(text).toContain(BEWERTUNG_HINWEIS);
    expect(BEWERTUNG_HINWEIS).toContain("Richtwert dieses Werkzeugs, keine Statistik");
  });
  it("kommt ohne Branche und Einzugsgebiet aus", () => {
    const doc = toDocument(output, { betrieb: "", branche: "", einzugsgebiet: "" });
    expect(doc.blocks[0]).toEqual({ type: "facts", items: [{ label: "Betrieb", value: "keine Angabe" }] });
    expect(doc.firma).toBeUndefined();
    expect(doc.filename).toBe("icp-betrieb");
  });
  it("reportMarkdown beginnt mit dem Titel und enthält die Tabelle", () => {
    const md = reportMarkdown(output, input);
    expect(md.startsWith("# Idealkundenprofil\n")).toBe(true);
    expect(md).toContain(`_${output.segmentName}_`);
    expect(md).toContain("- **Betrieb:** Malerei Keller");
    expect(md).toContain("### Wer sie sind");
    expect(md).toContain("| Kriterium | Punkte | Warum |");
    expect(md).toContain("| Fragt nach Farbberatung | 1 | Zusatzleistung, die der Betrieb gern macht. |");
  });
});

describe("icp-builder: Profil", () => {
  it("schreibt Segment und Beschreibung nur in leere Felder", () => {
    expect(profilePatch({}, output)).toEqual({
      zielgruppen: [{ name: output.segmentName, beschreibung: output.beschreibung }],
      primaersegment: output.segmentName,
    });
    expect(profilePatch({ zielgruppen: [{ name: "Bestehend" }] }, output)).toEqual({ primaersegment: output.segmentName });
    expect(profilePatch({ primaersegment: "Bestehend" }, output)).toEqual({ zielgruppen: [{ name: output.segmentName, beschreibung: output.beschreibung }] });
    expect(profilePatch({ zielgruppen: [{ name: "Bestehend" }], primaersegment: "Bestehend" }, output)).toEqual({});
    expect(profilePatch({ zielgruppen: [], primaersegment: "   " }, output)).toEqual({
      zielgruppen: [{ name: output.segmentName, beschreibung: output.beschreibung }],
      primaersegment: output.segmentName,
    });
  });
});

describe("icp-builder: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten, falscher Version oder kaputter Eingabe den leeren Stand", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, input, output })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1 })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1, input: { ...input, angebot: "kurz" }, output })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1, input: null, output })).toBe(EMPTY_STATE);
  });
  it("lässt einen kaputten Entwurf allein wegfallen und behält die Eingabe", () => {
    expect(parseState({ v: 1, input, output: { segmentName: "x" } })).toEqual({ v: 1, input, output: null });
    expect(parseState({ v: 1, input, output: null })).toEqual({ v: 1, input, output: null });
  });
  it("gibt einen gültigen Stand unverändert zurück", () => {
    const state = { v: 1 as const, input, output };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
