import { describe, expect, it } from "vitest";
import type { PositionierungInput, PositionierungOutput } from "./generator";
import {
  EMPTY_STATE,
  GEWICHTE,
  GRUPPEN,
  KI_HINWEIS,
  RICHTWERTE,
  RICHTWERT_HINWEIS,
  checkPositionierung,
  eingabeText,
  entwurfBodyBlocks,
  fundeKurz,
  hostOf,
  inputProblem,
  kantonName,
  looksLikeWebsite,
  parseState,
  perspektiveOf,
  profilePatch,
  prozent,
  reportMarkdown,
  sentencesOf,
  stripText,
  stufe,
  toDocument,
  toInput,
  type Fund,
  type PositionierungCheck,
} from "./logic";

const context = { ort: "Gossau", kanton: "SG", firma: "Malerei Keller" };

/** Die Startseite der Beispielfirma aus content/tools/positionierung.md; die Zahlen dort stammen aus diesem Lauf. */
const BEISPIEL_TEXT =
  "Malerei Keller Gossau. Fassaden und Innenräume für Hausbesitzer in Gossau und im Fürstenland. Seit 1985 streichen wir Fassaden, Treppenhäuser und Wohnungen. Wir sind Ihr kompetenter Ansprechpartner für alle Malerarbeiten. Wir bieten qualitativ hochwertige Arbeit. Unser Team besteht aus 12 Mitarbeitenden und 3 Lernenden. Sie erhalten eine Offerte innert einer Woche. Wir freuen uns auf Ihre Anfrage. Malerei Keller AG, Bahnhofstrasse 4, 9200 Gossau SG.";

const page = { host: "malerei-keller.ch", title: "Malerei Keller Gossau", headings: ["Fassaden", "Innenräume", "Über uns"], text: BEISPIEL_TEXT };

const output: PositionierungOutput = {
  kernsatz: "Für Hausbesitzer in Gossau und im Fürstenland: Fassaden, die zwanzig Jahre halten, in zwei Wochen fertig.",
  fuerWen: "Eigentümer von Einfamilienhäusern in Gossau und Umgebung, deren Fassade lange nicht erneuert wurde.",
  wasAnders: "Die Malerei Keller macht nur Fassaden, keine Innenräume. Das Team ist in zwei Wochen fertig und gibt 5 Jahre Garantie.",
  beweise: ["Seit 1985 in Gossau.", "12 Mitarbeitende und 3 Lernende.", "[Name einer Referenz]"],
  varianten: [
    { stil: "kurz", satz: "Fassaden in Gossau, in zwei Wochen fertig." },
    { stil: "konkret", satz: "Seit 1985 streichen wir Fassaden in Gossau, mit 5 Jahren Garantie." },
    { stil: "persoenlich", satz: "Ich streiche Fassaden im Fürstenland, seit 1985 und nur Fassaden." },
  ],
  streichen: ["Wir sind Ihr kompetenter Ansprechpartner", "Wir bieten qualitativ hochwertige Arbeit"],
  naechsterSchritt: "Ersetze den ersten Satz der Startseite durch den Kernsatz und nenne die Garantie direkt darunter.",
};

const fundOf = (check: PositionierungCheck, gruppe: Fund["gruppe"]): Fund => check.funde.find((f) => f.gruppe === gruppe) as Fund;

describe("positionierung: Gewichte und Richtwerte", () => {
  it("summiert die Gewichte auf 100 und kennt sechs Gruppen in fester Reihenfolge", () => {
    expect(Object.values(GEWICHTE).reduce((a, b) => a + b, 0)).toBe(100);
    expect(GRUPPEN).toEqual(["zielgruppe", "unterscheidung", "beweise", "kunde", "region", "floskeln"]);
    expect(RICHTWERTE).toEqual({ kundenAnteilGut: 0.5, kundenAnteilTeil: 0.3, beweiseGut: 2, floskelnTeil: 2, satzMinWoerter: 3 });
    expect(RICHTWERT_HINWEIS).toMatch(/Richtwerte dieses Werkzeugs, keine Statistik/);
    expect(checkPositionierung("x").funde.map((f) => f.gruppe)).toEqual([...GRUPPEN]);
  });
});

describe("positionierung: Für wen", () => {
  it("erkennt eine konkrete Zielgruppe, auch mit Wörtern dazwischen und über «richtet sich an»", () => {
    expect(fundOf(checkPositionierung("Fassaden für Hausbesitzer im Appenzellerland."), "zielgruppe")).toMatchObject({ id: "zielgruppe-ok", status: "gut", punkte: 20, max: 20 });
    expect(fundOf(checkPositionierung("Treuhand für kleine und mittlere KMU."), "zielgruppe").status).toBe("gut");
    expect(fundOf(checkPositionierung("Unser Angebot richtet sich an Verwaltungen."), "zielgruppe").status).toBe("gut");
    expect(fundOf(checkPositionierung("Fassaden für Hausbesitzer im Appenzellerland."), "zielgruppe").beispiele[0]).toContain("für Hausbesitzer");
  });
  it("gibt für «für alle» nur einen Viertel der Punkte und ohne Zielgruppe keine", () => {
    expect(fundOf(checkPositionierung("Wir sind da für alle, die eine Fassade haben."), "zielgruppe")).toMatchObject({ id: "zielgruppe-breit", status: "teil", punkte: 5 });
    expect(fundOf(checkPositionierung("Für jedes Budget das passende Angebot."), "zielgruppe").status).toBe("teil");
    expect(fundOf(checkPositionierung("Wir streichen Fassaden und Innenräume."), "zielgruppe")).toMatchObject({ id: "zielgruppe-fehlt", status: "fehlt", punkte: 0, beispiele: [] });
    // Eine konkrete Gruppe zählt mehr als ein «für alle» daneben.
    expect(fundOf(checkPositionierung("Für alle Hausbesitzer in Gossau."), "zielgruppe").status).toBe("gut");
  });
});

describe("positionierung: Unterscheidung", () => {
  it("erkennt Sätze, die einen Unterschied nennen", () => {
    for (const t of ["Anders als andere Betriebe arbeiten wir nur an Fassaden.", "Wir sind spezialisiert auf Altbauten.", "Spezialist für Treppenhäuser.", "Nur bei uns gibt es Garantie.", "Im Unterschied zu grossen Firmen kennst du den Maler."]) {
      expect(fundOf(checkPositionierung(t), "unterscheidung")).toMatchObject({ id: "unterscheidung-ok", status: "gut", punkte: 20 });
    }
  });
  it("gibt ohne solche Sätze keine Punkte", () => {
    expect(fundOf(checkPositionierung("Wir streichen Fassaden und Innenräume in Gossau."), "unterscheidung")).toMatchObject({ id: "unterscheidung-fehlt", status: "fehlt", punkte: 0 });
  });
});

describe("positionierung: Beweise", () => {
  it("zählt Jahreszahlen, «seit … Jahren», Zahlen mit Einheit, Referenzen, Zertifikate, Meisterbetrieb und Mitgliedschaften", () => {
    const texte = ["Seit 1985 in Gossau.", "Seit über 30 Jahren im Geschäft.", "Wir sind 12 Mitarbeitende.", "Unsere Referenzen sprechen für sich.", "Nach ISO 9001 geprüft.", "Zertifizierte Fachleute.", "Meisterbetrieb seit Generationen.", "Mitglied bei Suissetec.", "In dritter Generation."];
    for (const t of texte) expect(checkPositionierung(t).kennzahlen.beweise, t).toBe(1);
    expect(checkPositionierung("ISO 9001 zertifiziert.").kennzahlen.beweise).toBe(2);
    expect(fundOf(checkPositionierung("Seit 1985 in Gossau."), "beweise")).toMatchObject({ id: "beweise-einer", status: "teil", punkte: 10 });
    expect(fundOf(checkPositionierung("Seit 1985 in Gossau, mit 12 Mitarbeitenden."), "beweise")).toMatchObject({ id: "beweise-ok", status: "gut", punkte: 20 });
    expect(fundOf(checkPositionierung("Wir streichen Fassaden."), "beweise")).toMatchObject({ id: "beweise-fehlt", status: "fehlt", punkte: 0 });
  });
  it("zählt überlappende Stellen einmal und lässt Jahre ohne Einheit weg", () => {
    expect(checkPositionierung("Gegründet 1985, seit 1985 in Gossau.").kennzahlen.beweise).toBe(2);
    expect(checkPositionierung("Im Jahr 1985 war alles anders.").kennzahlen.beweise).toBe(0);
  });
});

describe("positionierung: Kundenperspektive", () => {
  it("ordnet Sätze der Kundschaft oder dem Betrieb zu", () => {
    expect(perspektiveOf("Du bekommst eine Offerte innert einer Woche.")).toBe("kunde");
    expect(perspektiveOf("Sie erhalten eine Offerte innert einer Woche.")).toBe("kunde");
    expect(perspektiveOf("Wir sind für Sie da.")).toBe("wir");
    expect(perspektiveOf("Unser Team freut sich.")).toBe("wir");
    expect(perspektiveOf("Die Farben, die sie wählen, halten lange.")).toBeNull();
    expect(perspektiveOf("Malerei Keller Gossau.")).toBeNull();
    expect(sentencesOf("Über uns. Kontakt. Du bekommst eine Offerte innert einer Woche.\nWir streichen Fassaden")).toEqual(["Du bekommst eine Offerte innert einer Woche.", "Wir streichen Fassaden"]);
  });
  it("gibt ab der Hälfte Kundensätze volle Punkte, ab 30 % die Hälfte, darunter keine", () => {
    const gut = checkPositionierung("Du willst eine Fassade, die hält. Du bekommst eine Offerte innert einer Woche. Wir streichen sie in zwei Wochen.");
    expect(fundOf(gut, "kunde")).toMatchObject({ id: "kunde-ok", status: "gut", punkte: 15 });
    expect(gut.kennzahlen).toMatchObject({ wirSaetze: 1, kundeSaetze: 2 });
    const teil = checkPositionierung("Du bekommst eine Offerte innert einer Woche. Wir streichen Fassaden. Wir streichen Treppenhäuser.");
    expect(fundOf(teil, "kunde")).toMatchObject({ id: "kunde-teil", status: "teil", punkte: 8 });
    expect(teil.kennzahlen.kundenAnteil).toBeCloseTo(1 / 3);
    const wir = checkPositionierung("Wir streichen Fassaden. Wir streichen Treppenhäuser. Wir sind für Sie da. Unser Team freut sich.");
    expect(fundOf(wir, "kunde")).toMatchObject({ id: "kunde-wir", status: "fehlt", punkte: 0 });
    expect(wir.kennzahlen.kundenAnteil).toBe(0);
    const keine = checkPositionierung("Fassaden und Innenräume in Gossau. Treppenhäuser und Wohnungen.");
    expect(fundOf(keine, "kunde")).toMatchObject({ id: "kunde-keine", status: "fehlt", punkte: 0 });
    expect(keine.kennzahlen.kundenAnteil).toBeNull();
  });
});

describe("positionierung: Ort und Region", () => {
  it("erkennt den Ort aus dem Profil, den Kantonsnamen, Regionen und die Postleitzahl mit Ort als Ganzes", () => {
    expect(fundOf(checkPositionierung("Wir streichen in Gossau.", context), "region")).toMatchObject({ id: "region-ok", status: "gut", punkte: 15 });
    expect(fundOf(checkPositionierung("Ein Betrieb im Kanton St. Gallen.", context), "region").status).toBe("gut");
    expect(fundOf(checkPositionierung("Ein Betrieb im Kanton St.Gallen."), "region").status).toBe("gut");
    expect(fundOf(checkPositionierung("Maler in der Ostschweiz."), "region").status).toBe("gut");
    expect(fundOf(checkPositionierung("Maler in Appenzell Ausserrhoden."), "region").status).toBe("gut");
    const plz = fundOf(checkPositionierung("Malerei Keller AG, Bahnhofstrasse 4, 9200 Gossau SG."), "region");
    expect(plz.status).toBe("gut");
    expect(plz.beispiele).toHaveLength(1);
    expect(plz.beispiele[0]).toContain("9200 Gossau");
    expect(fundOf(checkPositionierung("Postadresse CH-8000 Zürich."), "region").status).toBe("gut");
    expect(kantonName("SG")).toBe("St. Gallen");
    expect(kantonName("ar")).toBe("Appenzell Ausserrhoden");
    expect(kantonName("XX")).toBe("");
    expect(kantonName(undefined)).toBe("");
  });
  it("gibt für «Schweiz» allein einen Drittel der Punkte, sonst keine, und hält Jahreszahlen nicht für Postleitzahlen", () => {
    expect(fundOf(checkPositionierung("Wir sind ein Betrieb in der Schweiz."), "region")).toMatchObject({ id: "region-schweiz", status: "teil", punkte: 5 });
    expect(fundOf(checkPositionierung("Schweizer Qualität."), "region").status).toBe("teil");
    expect(fundOf(checkPositionierung("Seit 1985 Malerei mit Herz."), "region")).toMatchObject({ id: "region-fehlt", status: "fehlt", punkte: 0 });
    expect(fundOf(checkPositionierung("Wir streichen Fassaden."), "region").status).toBe("fehlt");
  });
});

describe("positionierung: Floskeln", () => {
  it("gibt ohne Floskeln volle Punkte, bei ein bis zwei die Hälfte, ab drei keine und ohne Text keine", () => {
    expect(fundOf(checkPositionierung("Du bekommst eine Offerte innert einer Woche."), "floskeln")).toMatchObject({ id: "floskeln-ok", status: "gut", punkte: 10 });
    const wenige = checkPositionierung("Wir sind Ihr kompetenter Ansprechpartner.");
    expect(fundOf(wenige, "floskeln")).toMatchObject({ id: "floskeln-wenige", status: "teil", punkte: 5 });
    expect(wenige.kennzahlen.floskeln).toBe(2);
    expect(fundOf(wenige, "floskeln").beispiele[0]).toMatch(/kompetent/);
    const viele = checkPositionierung("Wir sind Ihr kompetenter Ansprechpartner. Wir bieten qualitativ hochwertige Arbeit. Wir freuen uns auf Ihre Anfrage.");
    expect(fundOf(viele, "floskeln")).toMatchObject({ id: "floskeln-viele", status: "fehlt", punkte: 0 });
    expect(viele.kennzahlen.floskeln).toBe(4);
    expect(fundOf(checkPositionierung(""), "floskeln")).toMatchObject({ id: "floskeln-kein-text", status: "fehlt", punkte: 0 });
  });
});

describe("positionierung: Punktzahl", () => {
  it("liegt zwischen 0 und 100: leerer Text 0, Text mit allem 100, Stufen aus lib/score", () => {
    const leer = checkPositionierung("");
    expect(leer.score).toBe(0);
    expect(leer.kennzahlen).toEqual({ woerter: 0, saetze: 0, wirSaetze: 0, kundeSaetze: 0, kundenAnteil: null, beweise: 0, floskeln: 0, lesbarkeit: null });
    const voll = checkPositionierung("Fassaden für Hausbesitzer in Gossau. Anders als andere Betriebe streichen wir nur Fassaden. Seit 1985 mit 12 Mitarbeitenden. Du bekommst eine Offerte innert einer Woche. Du weisst vorher, was es kostet.", context);
    expect(voll.score).toBe(100);
    expect(voll.funde.every((f) => f.status === "gut" && f.punkte === f.max)).toBe(true);
    expect(stufe(100)).toBe("stark");
    expect(stufe(55)).toBe("ausbaufähig");
    expect(stufe(10)).toBe("Handlungsbedarf");
    expect(prozent(1 / 6)).toBe("17 %");
  });
  it("rechnet das Beispiel aus dem Seitentext: Malerei Keller mit 55 von 100", () => {
    const check = checkPositionierung(BEISPIEL_TEXT, context);
    expect(check.score).toBe(55);
    expect(check.funde.map((f) => [f.id, f.punkte])).toEqual([
      ["zielgruppe-ok", 20],
      ["unterscheidung-fehlt", 0],
      ["beweise-ok", 20],
      ["kunde-wir", 0],
      ["region-ok", 15],
      ["floskeln-viele", 0],
    ]);
    expect(check.kennzahlen).toMatchObject({ woerter: 59, wirSaetze: 5, kundeSaetze: 1, beweise: 2, floskeln: 4 });
    expect(prozent(check.kennzahlen.kundenAnteil ?? 0)).toBe("17 %");
    expect(stufe(check.score)).toBe("ausbaufähig");
  });
  it("prüft 20'000 Zeichen Müll in unter 1,5 Sekunden und schneidet längeren Text ab", () => {
    const texte = ["x".repeat(20_000), "a. ".repeat(7_000), "Wir sind für Sie da 9200 Gossau seit 1985. ".repeat(600), "!!!!...???".repeat(3_000), "für für für ".repeat(2_000)];
    for (const t of texte) {
      const t0 = performance.now();
      const check = checkPositionierung(t, context);
      expect(performance.now() - t0, t.slice(0, 20)).toBeLessThan(1_500);
      expect(check.score).toBeGreaterThanOrEqual(0);
      expect(check.score).toBeLessThanOrEqual(100);
    }
    expect(checkPositionierung("Wort ".repeat(10_000)).kennzahlen.woerter).toBeLessThanOrEqual(4_000);
  });
});

describe("positionierung: Funde für die KI", () => {
  it("fundeKurz nennt nur Lücken, kürzt auf 160 Zeichen und höchstens zwölf Zeilen", () => {
    const check = checkPositionierung(BEISPIEL_TEXT, context);
    const kurz = fundeKurz(check);
    expect(kurz).toHaveLength(3);
    expect(kurz[0]).toMatch(/^Unterscheidung \(0 von 20\): /);
    expect(kurz[1]).toMatch(/^Kundenperspektive \(0 von 15\): /);
    expect(kurz[2]).toMatch(/^Floskeln \(0 von 10\): /);
    expect(kurz.every((z) => z.length <= 160)).toBe(true);
    expect(fundeKurz({ ...check, funde: check.funde.map((f) => ({ ...f, status: "gut" })) })).toEqual([]);
    const lang = { ...check, funde: Array.from({ length: 20 }, () => ({ ...check.funde[1], hinweis: "x".repeat(300) })) };
    expect(fundeKurz(lang)).toHaveLength(12);
    expect(fundeKurz(lang)[0]).toHaveLength(160);
  });
});

describe("positionierung: Eingabe", () => {
  it("inputProblem verlangt eine Website, die wie eine Adresse aussieht", () => {
    expect(inputProblem("")).toMatch(/Ohne Website gibt es keinen Check/);
    expect(inputProblem("   ")).toMatch(/Ohne Website/);
    expect(inputProblem("malerei keller")).toMatch(/nicht nach einer Website-Adresse/);
    expect(inputProblem("gossau")).toMatch(/nicht nach einer Website-Adresse/);
    expect(inputProblem("malerei-keller.ch")).toBeNull();
    expect(inputProblem("https://www.malerei-keller.ch/start")).toBeNull();
    expect(looksLikeWebsite("x".repeat(301) + ".ch")).toBe(false);
    expect(hostOf("https://www.malerei-keller.ch/start")).toBe("malerei-keller.ch");
    expect(hostOf("malerei-keller.ch")).toBe("malerei-keller.ch");
    expect(hostOf("://kaputt")).toBe("://kaputt");
  });
  it("toInput nimmt Profil, Formular, Seite und Funde, kürzt und nimmt ohne Firma den Host", () => {
    const check = checkPositionierung(BEISPIEL_TEXT, context);
    const i = toInput({ firma: " Malerei   Keller ", branche: "Malerei", ort: "Gossau", kanton: "SG" }, { unterscheidung: "  nur Fassaden  ", beweise: "" }, page, check);
    expect(i).toMatchObject({ betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", kanton: "St. Gallen", host: "malerei-keller.ch", title: "Malerei Keller Gossau", headings: page.headings, text: BEISPIEL_TEXT, unterscheidung: "nur Fassaden", beweise: "" });
    expect(i.funde).toEqual(fundeKurz(check));
    const ohne = toInput({}, { unterscheidung: "", beweise: "x".repeat(700) }, { ...page, title: "", headings: Array.from({ length: 30 }, (_, n) => (n % 2 ? "" : "h")), text: "y".repeat(9_000) }, check);
    expect(ohne.betrieb).toBe("malerei-keller.ch");
    expect(ohne.kanton).toBe("");
    expect(ohne.headings).toHaveLength(15);
    expect(ohne.text).toHaveLength(6_000);
    expect(ohne.beweise).toHaveLength(600);
    expect(toInput({ kanton: "XX" }, { unterscheidung: "", beweise: "" }, page, check).kanton).toBe("");
  });
  it("stripText lässt den Seitentext weg, und eingabeText nennt die Angaben je Zeile ohne den Text", () => {
    const check = checkPositionierung(BEISPIEL_TEXT, context);
    const i = toInput(context, { unterscheidung: "nur Fassaden", beweise: "5 Jahre Garantie" }, page, check);
    const stored = stripText(i);
    expect("text" in stored).toBe(false);
    expect(stored.host).toBe("malerei-keller.ch");
    const zeilen = eingabeText(stored).split("\n");
    expect(zeilen).toEqual([
      "Website: malerei-keller.ch",
      "Betrieb: Malerei Keller",
      "Ort: Gossau",
      "Kanton: St. Gallen",
      "Titel der Startseite: Malerei Keller Gossau",
      "Überschriften: Fassaden · Innenräume · Über uns",
      "Was dich unterscheidet: nur Fassaden",
      "Beweise: 5 Jahre Garantie",
    ]);
    expect(eingabeText(stored)).not.toContain(BEISPIEL_TEXT.slice(0, 40));
    const leer = eingabeText({ ...stored, branche: "", ort: "", kanton: "", title: "", headings: [], unterscheidung: "", beweise: "" });
    expect(leer).toBe("Website: malerei-keller.ch\nBetrieb: Malerei Keller");
  });
});

describe("positionierung: Dokument", () => {
  const check = checkPositionierung(BEISPIEL_TEXT, context);
  const angaben = { betrieb: "Malerei Keller", host: "malerei-keller.ch", title: "Malerei Keller Gossau", ort: "Gossau", branche: "Malerei", kanton: "St. Gallen" };

  it("enthält ohne Entwurf Facts, Punktzahl, Funde und Kennzahlen, aber keinen Entwurf", () => {
    const doc = toDocument(check, null, angaben);
    const text = JSON.stringify(doc.blocks);
    expect(doc.title).toBe("Positionierungs-Check");
    expect(doc.subtitle).toBe("Startseite von malerei-keller.ch");
    expect(doc.filename).toBe("positionierung-malerei-keller-ch");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Website", value: "malerei-keller.ch" },
        { label: "Betrieb", value: "Malerei Keller" },
        { label: "Branche", value: "Malerei" },
        { label: "Ort", value: "Gossau, St. Gallen" },
      ],
    });
    expect(text).toContain("Positionierung auf der Startseite: 55 von 100 (ausbaufähig)");
    expect(text).toContain(RICHTWERT_HINWEIS);
    for (const f of check.funde) expect(text).toContain(`${f.titel}: ${f.punkte} von ${f.max}`);
    expect(text).toContain('"label":"Sätze an die Kundschaft","value":"1 von 6 (17 %)"');
    expect(text).not.toContain("Dein Entwurf");
    expect(text).not.toContain(KI_HINWEIS);
  });
  it("hängt mit Entwurf alle Abschnitte in fester Reihenfolge an, mit KI-Hinweis", () => {
    const doc = toDocument(check, output, angaben);
    const text = JSON.stringify(doc.blocks);
    expect(text).toContain(KI_HINWEIS);
    const titel = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(titel.slice(titel.indexOf("Dein Entwurf"))).toEqual(["Dein Entwurf", "Kernsatz", "Für wen", "Was anders ist", "Beweise", "Drei Varianten", "Streichen", "Nächster Schritt"]);
    expect(text).toContain("Kurz: Fassaden in Gossau, in zwei Wochen fertig.");
    expect(text).toContain("Persönlich: Ich streiche");
    expect(text).toContain("[Name einer Referenz]");
    expect(entwurfBodyBlocks(output)[0]).toEqual({ type: "heading", level: 2, text: "Kernsatz" });
    expect(JSON.stringify(entwurfBodyBlocks(output))).not.toContain(KI_HINWEIS);
  });
  it("kommt ohne Branche, Ort und Titel aus, und reportMarkdown beginnt mit Titel und Punktzahl", () => {
    const doc = toDocument(check, null, { betrieb: "", host: "", title: "", ort: "", branche: "", kanton: "" });
    expect(doc.subtitle).toBeUndefined();
    expect(doc.filename).toBe("positionierung-website");
    expect(doc.blocks[0]).toEqual({ type: "facts", items: [{ label: "Website", value: "keine Angabe" }, { label: "Betrieb", value: "keine Angabe" }] });
    const md = reportMarkdown(check, output, angaben);
    expect(md.startsWith("# Positionierungs-Check\n\n_Startseite von malerei-keller.ch_")).toBe(true);
    expect(md).toContain("## Positionierung auf der Startseite: 55 von 100 (ausbaufähig)");
    expect(md).toContain("### Für wen: 20 von 20");
    expect(md).toContain("## Dein Entwurf");
    expect(md).toContain(`### Kernsatz\n\n${output.kernsatz}`);
    expect(md).toContain("- Konkret: Seit 1985");
  });
});

describe("positionierung: Profil", () => {
  it("schreibt den Kernsatz als Positionierung nur, wenn das Feld leer ist", () => {
    expect(profilePatch({}, output)).toEqual({ positionierung: output.kernsatz });
    expect(profilePatch({ positionierung: "  " }, output)).toEqual({ positionierung: output.kernsatz });
    expect(profilePatch({ positionierung: "Der Malerbetrieb in Gossau, der Termine hält." }, output)).toEqual({});
  });
});

describe("positionierung: gespeicherter Stand", () => {
  const check = checkPositionierung(BEISPIEL_TEXT, context);
  const input: PositionierungInput = toInput(context, { unterscheidung: "nur Fassaden", beweise: "" }, page, check);
  const stored = stripText(input);

  it("liefert bei kaputten Daten oder falscher Version den leeren Stand", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState([])).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, input: stored, check, output })).toBe(EMPTY_STATE);
    expect(EMPTY_STATE).toEqual({ v: 1, form: { unterscheidung: "", beweise: "" }, input: null, check: null, output: null });
  });
  it("behält das Formular, lässt aber ohne gültigen Check oder ohne gültige Angaben das Ergebnis weg", () => {
    expect(parseState({ v: 1, form: { unterscheidung: "nur Fassaden", beweise: 7 } })).toEqual({ v: 1, form: { unterscheidung: "nur Fassaden", beweise: "" }, input: null, check: null, output: null });
    expect(parseState({ v: 1, form: { unterscheidung: "x".repeat(700) }, input: stored, check: { score: 500 }, output })).toMatchObject({ input: null, check: null, output: null });
    expect(parseState({ v: 1, form: {}, input: stored, check: { score: 500 }, output }).form.unterscheidung).toBe("");
    expect(parseState({ v: 1, input: { ...stored, betrieb: "" }, check, output })).toMatchObject({ input: null, check: null, output: null });
    expect(parseState({ v: 1, input: { ...stored, text: BEISPIEL_TEXT }, check, output }).input).toEqual(stored);
  });
  it("lässt einen kaputten Entwurf allein wegfallen und gibt einen gültigen Stand als Rundlauf zurück", () => {
    expect(parseState({ v: 1, form: { unterscheidung: "", beweise: "" }, input: stored, check, output: { kernsatz: "x" } })).toEqual({ v: 1, form: { unterscheidung: "", beweise: "" }, input: stored, check, output: null });
    const state = { v: 1 as const, form: { unterscheidung: "nur Fassaden", beweise: "" }, input: stored, check, output };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
