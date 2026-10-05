import { describe, expect, it } from "vitest";
import { toMarkdown } from "@/lib/export/model";
import {
  CSV_BOM,
  CSV_HEADER,
  DATA,
  DEFAULT_KANAELE,
  EMPTY_FORM,
  EMPTY_STATE,
  HINWEISE,
  KANAELE,
  KANAL_KEYS,
  LIMITS,
  MONATE,
  START_ANTEIL,
  anteile,
  anteilVorschlag,
  budget,
  clampAnteil,
  csvFilename,
  effectiveAnteil,
  effectiveKanaele,
  eigenleistungText,
  eingabeText,
  formFromInput,
  formProblem,
  kanaeleAusProfil,
  kanaeleVorschlag,
  monatsplan,
  parseNumber,
  parseState,
  profilePatch,
  rahmen,
  rahmenText,
  reportMarkdown,
  toCsv,
  toDocument,
  toInput,
  vergleichText,
  zwoelfMonate,
  type BudgetData,
  type BudgetInput,
  type FormFields,
} from "./logic";

/** Testdaten mit Spannen (nur für die Rechnung der Vorschläge; keine Aussage über echte Werte). */
const MIT_DATEN: BudgetData = {
  meta: { source: "Testquelle", url: "https://example.org", asOf: "2026-01-01" },
  phasen: { start: { min: 10, max: 15 }, wachstum: { min: 7, max: 10 }, etabliert: { min: 3, max: 7 } },
};
const OHNE_DATEN: BudgetData = { meta: { source: "Testquelle", url: null, asOf: "2026-01-01" }, phasen: {} };

const profile = { firma: "Malerei Keller", organisationstyp: "kmu" as const };

/** Das Beispiel aus content/tools/budget-planer.md. */
const beispielForm: FormFields = {
  umsatz: "900000",
  phase: "etabliert",
  ziel: "leicht",
  anteil: "3",
  kanaele: ["website", "gbp", "instagram", "print", "empfehlungen"],
  stunden: "20",
  stundensatz: "80",
};
const beispiel: BudgetInput = toInput(beispielForm, profile, OHNE_DATEN)!;

describe("budget-planer: Daten", () => {
  it("die Datei im Repo trägt Quelle und Vergleich, aber keine Spannen: rahmen ist null, der Vergleich ein Satz mit Quelle", () => {
    expect(DATA.meta.source).toMatch(/CMO Survey/);
    expect(DATA.meta.url).toMatch(/^https:\/\//);
    expect(DATA.phasen).toEqual({});
    expect(rahmen("start")).toBeNull();
    expect(rahmen("wachstum")).toBeNull();
    expect(rahmen("etabliert")).toBeNull();
    expect(vergleichText()).toMatch(/9 %/);
    expect(vergleichText()).toMatch(/16,3 %/);
    expect(vergleichText()).toMatch(/Quelle: The CMO Survey 2026/);
    expect(vergleichText(OHNE_DATEN)).toBe("");
  });
  it("rahmen liefert die Spanne mit Quelle und verwirft unbrauchbare Werte", () => {
    expect(rahmen("start", MIT_DATEN)).toEqual({ min: 10, max: 15, source: "Testquelle" });
    expect(rahmen("etabliert", MIT_DATEN)).toEqual({ min: 3, max: 7, source: "Testquelle" });
    expect(rahmen("start", OHNE_DATEN)).toBeNull();
    expect(rahmen("start", { ...MIT_DATEN, phasen: { start: { min: 8, max: 5 } } })).toBeNull();
    expect(rahmen("start", { ...MIT_DATEN, phasen: { start: { min: 0, max: 5 } } })).toBeNull();
    expect(rahmen("start", { ...MIT_DATEN, phasen: { start: { min: 5, max: 120 } } })).toBeNull();
    expect(rahmen("start", { ...MIT_DATEN, phasen: { start: { min: Number.NaN, max: 5 } } })).toBeNull();
    expect(rahmen("start", { ...MIT_DATEN, meta: { ...MIT_DATEN.meta, source: " " } })).toBeNull();
  });
  it("anteilVorschlag liegt je Ziel im unteren Drittel, in der Mitte oder im oberen Drittel der Spanne, auf 0,5 gerundet", () => {
    expect(anteilVorschlag("etabliert", "halten", MIT_DATEN)).toBe(3.5);
    expect(anteilVorschlag("etabliert", "leicht", MIT_DATEN)).toBe(5);
    expect(anteilVorschlag("etabliert", "stark", MIT_DATEN)).toBe(6.5);
    expect(anteilVorschlag("start", "halten", MIT_DATEN)).toBe(11);
    expect(anteilVorschlag("start", "leicht", MIT_DATEN)).toBe(12.5);
    expect(anteilVorschlag("start", "stark", MIT_DATEN)).toBe(14);
    for (const ziel of ["halten", "leicht", "stark"] as const) {
      const v = anteilVorschlag("wachstum", ziel, MIT_DATEN);
      expect(v).toBeGreaterThanOrEqual(7);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
  it("anteilVorschlag ohne Daten ist der Startwert 3, für jedes Ziel", () => {
    expect(START_ANTEIL).toBe(3);
    expect(anteilVorschlag("start", "stark", OHNE_DATEN)).toBe(3);
    expect(anteilVorschlag("etabliert", "halten", OHNE_DATEN)).toBe(3);
    expect(anteilVorschlag("wachstum", "leicht")).toBe(3);
  });
  it("clampAnteil rundet auf 0,5 und hält die Grenzen", () => {
    expect(clampAnteil(3.24)).toBe(3);
    expect(clampAnteil(3.26)).toBe(3.5);
    expect(clampAnteil(0)).toBe(0.5);
    expect(clampAnteil(99)).toBe(30);
    expect(clampAnteil(Number.NaN)).toBe(3);
  });
});

describe("budget-planer: Kanäle und Profil", () => {
  it("kennt zehn Kanäle mit Rolle, Gewicht und Werbeanteil", () => {
    expect(KANAELE.map((k) => k.key)).toEqual([...KANAL_KEYS]);
    expect(KANAELE.find((k) => k.key === "website")).toMatchObject({ rolle: "fundament", gewicht: 3, werbeanteil: 0 });
    expect(KANAELE.find((k) => k.key === "instagram")).toMatchObject({ rolle: "reichweite", gewicht: 2, werbeanteil: 0.5 });
    expect(KANAELE.find((k) => k.key === "print")).toMatchObject({ rolle: "reichweite", gewicht: 2, werbeanteil: 1 });
    expect(KANAELE.find((k) => k.key === "googleads")).toMatchObject({ rolle: "reichweite", gewicht: 2, werbeanteil: 1 });
    expect(KANAELE.find((k) => k.key === "newsletter")).toMatchObject({ rolle: "pflege", gewicht: 1, werbeanteil: 0 });
    expect(KANAELE.find((k) => k.key === "anlaesse")).toMatchObject({ rolle: "anlass", gewicht: 2, werbeanteil: 0 });
  });
  it("liest Kanäle aus dem Profil über Wörter in name oder kanal und hält Google Ads vom Unternehmensprofil getrennt", () => {
    expect(kanaeleAusProfil({ kanaele: [{ name: "Instagram", url: "instagram.com/x" }, { kanal: "Google Business Profil" }, { name: "Dorfanzeiger" }] })).toEqual([
      "gbp",
      "instagram",
      "print",
    ]);
    expect(kanaeleAusProfil({ kanaele: [{ name: "Google Ads" }] })).toEqual(["googleads"]);
    expect(kanaeleAusProfil({ kanaele: [{ name: "TikTok" }, { foo: "bar" }, "x" as unknown as Record<string, unknown>] })).toEqual([]);
    expect(kanaeleAusProfil({})).toEqual([]);
    expect(kanaeleVorschlag({})).toEqual(DEFAULT_KANAELE);
    expect(kanaeleVorschlag({ kanaele: [{ name: "LinkedIn" }] })).toEqual(["linkedin"]);
    expect(effectiveKanaele({ kanaele: null }, { kanaele: [{ name: "Facebook" }] })).toEqual(["facebook"]);
    expect(effectiveKanaele({ kanaele: ["newsletter"] }, { kanaele: [{ name: "Facebook" }] })).toEqual(["newsletter"]);
  });
  it("profilePatch schreibt budgetJahr nur in ein leeres Feld", () => {
    expect(profilePatch({}, { jahr: 27000 })).toEqual({ budgetJahr: 27000 });
    expect(profilePatch({ budgetJahr: 5000 }, { jahr: 27000 })).toEqual({});
    expect(profilePatch({ budgetJahr: 0 }, { jahr: 27000 })).toEqual({});
  });
});

describe("budget-planer: Eingabe", () => {
  it("parseNumber liest Apostrophe, Leerzeichen und Komma und meldet Unsinn als NaN", () => {
    expect(parseNumber("900'000")).toBe(900000);
    expect(parseNumber("1 200 000")).toBe(1200000);
    expect(parseNumber("2,5")).toBe(2.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNaN();
    expect(parseNumber("1e5")).toBeNaN();
  });
  it("formProblem meldet in der Reihenfolge des Formulars: Firma, Umsatz, Phase, Ziel, Anteil, Kanäle, Stunden, Stundensatz", () => {
    expect(formProblem(beispielForm, {})).toBe("Gib den Namen deines Betriebs an.");
    expect(formProblem(beispielForm, { firma: "FC Trogen", organisationstyp: "verein" })).toBeNull();
    expect(formProblem(beispielForm, { organisationstyp: "verein" })).toBe("Gib den Namen deines Vereins an.");
    expect(formProblem({ ...beispielForm, umsatz: "" }, profile)).toMatch(/Jahresumsatz in Franken/);
    expect(formProblem({ ...beispielForm, umsatz: "" }, { ...profile, organisationstyp: "verein" })).toMatch(/Jahresbudget in Franken/);
    expect(formProblem({ ...beispielForm, umsatz: "abc" }, profile)).toMatch(/Jahresumsatz in Franken/);
    expect(formProblem({ ...beispielForm, umsatz: "999" }, profile)).toMatch(/zwischen CHF 1'000\.- und CHF 100'000'000\.-/);
    expect(formProblem({ ...beispielForm, umsatz: "100000001" }, profile)).toMatch(/zwischen CHF 1'000\.-/);
    expect(formProblem({ ...beispielForm, umsatz: "1000" }, profile)).toBeNull();
    expect(formProblem({ ...beispielForm, phase: "" }, profile)).toBe("Wähle die Phase deines Betriebs.");
    expect(formProblem({ ...beispielForm, ziel: "" }, profile)).toBe("Wähle das Ziel für dieses Jahr.");
    expect(formProblem({ ...beispielForm, anteil: "0" }, profile)).toMatch(/zwischen 0,5 % und 30 %/);
    expect(formProblem({ ...beispielForm, anteil: "31" }, profile)).toMatch(/zwischen 0,5 % und 30 %/);
    expect(formProblem({ ...beispielForm, anteil: "x" }, profile)).toMatch(/zwischen 0,5 % und 30 %/);
    expect(formProblem({ ...beispielForm, anteil: "0.5" }, profile)).toBeNull();
    expect(formProblem({ ...beispielForm, anteil: "30" }, profile)).toBeNull();
    expect(formProblem({ ...beispielForm, kanaele: [] }, profile)).toBe("Wähle mindestens einen Kanal.");
    expect(formProblem({ ...beispielForm, stunden: "401" }, profile)).toMatch(/Stunden pro Monat/);
    expect(formProblem({ ...beispielForm, stunden: "-1" }, profile)).toMatch(/Stunden pro Monat/);
    expect(formProblem({ ...beispielForm, stundensatz: "501" }, profile)).toMatch(/Stundensatz/);
    expect(formProblem({ ...beispielForm, stunden: "", stundensatz: "" }, profile)).toBeNull();
    expect(formProblem({ ...beispielForm, anteil: null }, profile)).toBeNull();
  });
  it("effectiveAnteil nimmt den getippten Wert, sonst den Vorschlag", () => {
    expect(effectiveAnteil({ anteil: "4", phase: "start", ziel: "stark" }, MIT_DATEN)).toBe(4);
    expect(effectiveAnteil({ anteil: null, phase: "start", ziel: "stark" }, MIT_DATEN)).toBe(14);
    expect(effectiveAnteil({ anteil: null, phase: "", ziel: "" }, OHNE_DATEN)).toBe(3);
    expect(effectiveAnteil({ anteil: "", phase: "start", ziel: "stark" }, MIT_DATEN)).toBeNaN();
  });
  it("toInput rundet, ordnet die Kanäle, nimmt den Vorschlag für den Anteil und gibt null bei Unsinn", () => {
    expect(beispiel).toEqual({
      firma: "Malerei Keller",
      organisationstyp: "kmu",
      umsatz: 900000,
      phase: "etabliert",
      ziel: "leicht",
      anteil: 3,
      kanaele: ["website", "gbp", "instagram", "print", "empfehlungen"],
      stunden: 20,
      stundensatz: 80,
    });
    const i = toInput({ ...beispielForm, umsatz: "900'000.6", anteil: null, kanaele: ["print", "website", "website"], stunden: "", stundensatz: "" }, { firma: "  Malerei   Keller " }, OHNE_DATEN);
    expect(i).toMatchObject({ firma: "Malerei Keller", umsatz: 900001, anteil: 3, kanaele: ["website", "print"], stunden: 0, stundensatz: null });
    expect(toInput({ ...beispielForm, umsatz: "x" }, profile)).toBeNull();
    expect(toInput({ ...beispielForm, phase: "" }, profile)).toBeNull();
    expect(toInput({ ...beispielForm, kanaele: [] }, profile)).toBeNull();
    expect(toInput({ ...beispielForm, umsatz: "500" }, profile)).toBeNull();
    expect(toInput({ ...beispielForm, kanaele: null }, { firma: "X", kanaele: [{ name: "Newsletter" }] })?.kanaele).toEqual(["newsletter"]);
  });
  it("formFromInput ist der Rundlauf zur Eingabe", () => {
    expect(formFromInput(beispiel)).toEqual(beispielForm);
    expect(toInput(formFromInput(beispiel), profile)).toEqual(beispiel);
    expect(formFromInput({ ...beispiel, stunden: 0, stundensatz: null })).toMatchObject({ stunden: "", stundensatz: "" });
    expect(EMPTY_FORM.kanaele).toBeNull();
    expect(EMPTY_FORM.anteil).toBeNull();
  });
});

describe("budget-planer: Rechnung", () => {
  it("zwoelfMonate: elf gleiche Beträge, der Dezember trägt den Rest, Summe stimmt", () => {
    expect(zwoelfMonate(27000)).toEqual([...Array<number>(11).fill(2250), 2250]);
    expect(zwoelfMonate(1000)).toEqual([...Array<number>(11).fill(83), 87]);
    expect(zwoelfMonate(1006)).toEqual([...Array<number>(11).fill(84), 82]);
    expect(zwoelfMonate(5)).toEqual([...Array<number>(11).fill(0), 5]);
    for (const total of [0, 5, 999, 1000, 123457, 30_000_000]) expect(zwoelfMonate(total).reduce((a, b) => a + b, 0)).toBe(total);
  });
  it("anteile: ganze Prozent, Summe 100, Rundungsrest zum grössten Kanal; ein, drei und alle Kanäle", () => {
    expect(anteile(["newsletter"])).toEqual([{ key: "newsletter", anteil: 100 }]);
    // 3, 3, 2 von 8: 37,5 / 37,5 / 25 → gerundet 38 / 38 / 25 = 101, der Rest geht zum ersten grössten Kanal.
    expect(anteile(DEFAULT_KANAELE)).toEqual([
      { key: "website", anteil: 37 },
      { key: "gbp", anteil: 38 },
      { key: "instagram", anteil: 25 },
    ]);
    const alle = anteile(KANAL_KEYS);
    expect(alle.map((a) => a.anteil)).toEqual([15, 15, 10, 10, 10, 5, 10, 10, 10, 5]);
    expect(alle.reduce((s, a) => s + a.anteil, 0)).toBe(100);
    expect(anteile([])).toEqual([]);
    // Reihenfolge der Auswahl spielt keine Rolle, Doppel fallen weg.
    expect(anteile(["instagram", "website", "instagram"]).map((a) => a.key)).toEqual(["website", "instagram"]);
  });
  it("rechnet das Beispiel aus dem Seitentext: Malerei Keller, CHF 900'000.-, 3 %, fünf Kanäle", () => {
    const r = budget(beispiel, OHNE_DATEN);
    expect(r.jahr).toBe(27000);
    expect(r.monat).toBe(2250);
    expect(r.kanaele.map((k) => [k.key, k.anteil, k.jahr, k.monat, k.monate[11], k.fremd, k.werbe])).toEqual([
      ["website", 28, 7560, 630, 630, 7560, 0],
      ["gbp", 27, 7290, 608, 602, 7290, 0],
      ["instagram", 18, 4860, 405, 405, 2430, 2430],
      ["print", 18, 4860, 405, 405, 0, 4860],
      ["empfehlungen", 9, 2430, 203, 197, 2430, 0],
    ]);
    expect(r.summe).toEqual({ anteil: 100, jahr: 27000, monat: 2251, fremd: 19710, werbe: 7290 });
    expect(r.eigenleistung).toEqual({ stunden: 20, satz: 80, monat: 1600, jahr: 19200 });
    expect(r.rahmen).toBeNull();
    const plan = monatsplan(r);
    expect(plan.map((z) => z.monat)).toEqual([...MONATE]);
    expect(plan[0]).toEqual({ monat: "Januar", betrag: 2251, kumuliert: 2251 });
    expect(plan[11]).toEqual({ monat: "Dezember", betrag: 2239, kumuliert: 27000 });
  });
  it("Summe der Kanäle ist das Jahresbudget, Summe der Monate je Kanal ist der Kanalbetrag, Anteile ergeben 100", () => {
    const faelle: BudgetInput[] = [
      beispiel,
      { ...beispiel, umsatz: 123457, anteil: 2.5, kanaele: [...KANAL_KEYS] },
      { ...beispiel, umsatz: 1000, anteil: 0.5, kanaele: ["website"] },
      { ...beispiel, umsatz: 100_000_000, anteil: 30, kanaele: ["website", "googleads", "newsletter"] },
      { ...beispiel, umsatz: 77777, anteil: 7.5, kanaele: ["facebook", "linkedin", "anlaesse"] },
    ];
    for (const input of faelle) {
      const r = budget(input, OHNE_DATEN);
      expect(r.jahr).toBe(Math.round((input.umsatz * input.anteil) / 100));
      expect(r.kanaele.reduce((s, k) => s + k.jahr, 0)).toBe(r.jahr);
      expect(r.kanaele.reduce((s, k) => s + k.anteil, 0)).toBe(100);
      expect(r.monate.reduce((s, m) => s + m, 0)).toBe(r.jahr);
      for (const k of r.kanaele) {
        expect(k.monate).toHaveLength(12);
        expect(k.monate.reduce((s, m) => s + m, 0)).toBe(k.jahr);
        expect(k.fremd + k.werbe).toBe(k.jahr);
      }
      expect(r.summe.fremd + r.summe.werbe).toBe(r.jahr);
      expect(monatsplan(r).reduce((s, z) => s + z.betrag, 0)).toBe(r.jahr);
      expect(monatsplan(r)[11].kumuliert).toBe(r.jahr);
    }
  });
  it("trennt Fremdkosten und Werbebudget je Kanal: Google Ads und Print ganz Werbung, soziale Kanäle halb, der Rest Fremdkosten", () => {
    const r = budget({ ...beispiel, umsatz: 100000, anteil: 10, kanaele: [...KANAL_KEYS] }, OHNE_DATEN);
    const byKey = Object.fromEntries(r.kanaele.map((k) => [k.key, k]));
    expect(byKey.googleads.werbe).toBe(byKey.googleads.jahr);
    expect(byKey.print.werbe).toBe(byKey.print.jahr);
    expect(byKey.instagram.werbe).toBe(byKey.instagram.jahr / 2);
    expect(byKey.facebook.werbe).toBe(byKey.facebook.jahr / 2);
    expect(byKey.linkedin.werbe).toBe(byKey.linkedin.jahr / 2);
    for (const key of ["website", "gbp", "newsletter", "anlaesse", "empfehlungen"] as const) {
      expect(byKey[key].werbe).toBe(0);
      expect(byKey[key].fremd).toBe(byKey[key].jahr);
    }
  });
  it("Grenzen: kleinster und grösster Umsatz mit 0,5 % und 30 %", () => {
    const klein = budget({ ...beispiel, umsatz: 1000, anteil: 0.5, kanaele: ["website"] }, OHNE_DATEN);
    expect(klein.jahr).toBe(5);
    expect(klein.monat).toBe(0);
    expect(klein.monate[11]).toBe(5);
    expect(klein.kanaele[0]).toMatchObject({ anteil: 100, jahr: 5, monat: 0, fremd: 5, werbe: 0 });
    const gross = budget({ ...beispiel, umsatz: 100_000_000, anteil: 30 }, OHNE_DATEN);
    expect(gross.jahr).toBe(30_000_000);
    expect(gross.monat).toBe(2_500_000);
  });
  it("Eigenleistung: ohne Stunden, mit Stunden ohne Satz, mit Satz", () => {
    expect(budget({ ...beispiel, stunden: 0, stundensatz: null }, OHNE_DATEN).eigenleistung).toEqual({ stunden: 0, satz: null, monat: null, jahr: null });
    expect(budget({ ...beispiel, stunden: 12.5, stundensatz: null }, OHNE_DATEN).eigenleistung).toEqual({ stunden: 12.5, satz: null, monat: null, jahr: null });
    expect(budget({ ...beispiel, stunden: 12.5, stundensatz: 90 }, OHNE_DATEN).eigenleistung).toEqual({ stunden: 12.5, satz: 90, monat: 1125, jahr: 13500 });
    expect(budget({ ...beispiel, stunden: 10, stundensatz: 0 }, OHNE_DATEN).eigenleistung).toEqual({ stunden: 10, satz: 0, monat: 0, jahr: 0 });
    expect(eigenleistungText({ stunden: 0, satz: null, monat: null, jahr: null })).toMatch(/^Keine Eigenleistung angegeben/);
    expect(eigenleistungText({ stunden: 20, satz: null, monat: null, jahr: null })).toMatch(/^20 Stunden pro Monat, das sind 240 Stunden im Jahr\. Ohne internen Stundensatz/);
    expect(eigenleistungText({ stunden: 1, satz: 80, monat: 80, jahr: 960 })).toMatch(/^1 Stunde pro Monat zu CHF 80\.-: CHF 80\.- pro Monat, CHF 960\.- im Jahr\./);
  });
  it("mit Daten trägt das Ergebnis den Rahmen der Phase, und der Rahmen-Text nennt Spanne und Quelle", () => {
    const r = budget({ ...beispiel, phase: "start", anteil: 12 }, MIT_DATEN);
    expect(r.rahmen).toEqual({ min: 10, max: 15, source: "Testquelle" });
    const text = rahmenText(r, "start", MIT_DATEN);
    expect(text).toMatch(/^Für die Phase «Start: unter zwei Jahren» liegt die Spanne bei 10 % bis 15 % vom Umsatz \(Quelle: Testquelle\)\./);
    expect(text).toMatch(/Dein Anteil: 12 % von CHF 900'000\.-, also CHF 108'000\.- im Jahr\./);
    const ohne = rahmenText(budget(beispiel, OHNE_DATEN), "etabliert", OHNE_DATEN);
    expect(ohne).toMatch(/^Ohne Richtwert, eigener Anteil: Für Schweizer KMU gibt es keine belastbare Zahl/);
    expect(ohne).toMatch(/Dein Anteil: 3 % von CHF 900'000\.-, also CHF 27'000\.- im Jahr\.$/);
    expect(rahmenText(budget(beispiel), "etabliert")).toMatch(/Zum Vergleich.*Quelle: The CMO Survey/);
  });
});

describe("budget-planer: Dokument, CSV und CRM", () => {
  const result = budget(beispiel, OHNE_DATEN);
  const doc = toDocument(result, beispiel, OHNE_DATEN);

  it("toDocument hat Facts, Rahmen, Kanaltabelle mit Summe, Eigenleistung, Monatsübersicht und drei Hinweise", () => {
    expect(doc.title).toBe("Marketing-Budget für zwölf Monate");
    expect(doc.subtitle).toBe("CHF 27'000.- im Jahr, 3 % vom Umsatz");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("marketing-budget-malerei-keller");
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["Rahmen", "Aufteilung auf Kanäle", "Eigenleistung", "Monatsübersicht", "Drei Hinweise"]);
    const facts = doc.blocks[0];
    expect(facts.type).toBe("facts");
    if (facts.type === "facts") {
      expect(facts.items.map((f) => f.label)).toEqual(["Betrieb", "Jahresumsatz (ungefähr)", "Phase", "Ziel für dieses Jahr", "Anteil vom Umsatz", "Geldbudget pro Jahr", "Geldbudget pro Monat"]);
      expect(facts.items[5].value).toBe("CHF 27'000.-");
    }
    const tables = doc.blocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(2);
    const kanal = tables[0];
    if (kanal.type === "table") {
      expect(kanal.header).toEqual(["Kanal", "Anteil", "pro Monat", "pro Jahr", "Fremdkosten", "Werbebudget"]);
      expect(kanal.rows).toHaveLength(6);
      expect(kanal.rows[0]).toEqual(["Website", "28 %", "CHF 630.-", "CHF 7'560.-", "CHF 7'560.-", "CHF 0.-"]);
      expect(kanal.rows[5]).toEqual(["Summe", "100 %", "CHF 2'251.-", "CHF 27'000.-", "CHF 19'710.-", "CHF 7'290.-"]);
    }
    const monate = tables[1];
    if (monate.type === "table") {
      expect(monate.header).toEqual(["Monat", "Geldbudget", "Kumuliert"]);
      expect(monate.rows).toHaveLength(12);
      expect(monate.rows[0]).toEqual(["Januar", "CHF 2'251.-", "CHF 2'251.-"]);
      expect(monate.rows[11]).toEqual(["Dezember", "CHF 2'239.-", "CHF 27'000.-"]);
    }
    const list = doc.blocks.at(-1);
    expect(list).toEqual({ type: "list", ordered: true, items: HINWEISE });
    expect(HINWEISE).toHaveLength(3);
    expect(toMarkdown(doc)).toMatch(/Richtwert von Alperna, keine Statistik/);
  });
  it("für Vereine heissen die Felder Verein und Jahresbudget", () => {
    const v = toDocument(result, { ...beispiel, organisationstyp: "verein", firma: "FC Trogen" }, OHNE_DATEN);
    const facts = v.blocks[0];
    if (facts.type === "facts") expect(facts.items.slice(0, 2).map((f) => f.label)).toEqual(["Verein", "Jahresbudget des Vereins"]);
    expect(v.subtitle).toBe("CHF 27'000.- im Jahr, 3 % vom Jahresbudget");
    expect(v.filename).toBe("marketing-budget-fc-trogen");
  });
  it("toCsv: BOM, Semikolon, CRLF, Kopfzeile, eine Zeile je Kanal und Monat plus Summen, Zahlen ohne Apostroph", () => {
    const csv = toCsv(result);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines.at(-1)).toBe("");
    const rows = lines.slice(0, -1);
    expect(rows[0]).toBe(CSV_HEADER.join(";"));
    expect(rows).toHaveLength(1 + 5 * 12 + 12);
    expect(rows[1]).toBe("Website;Fundament;Januar;630;630;0");
    expect(rows[12]).toBe("Website;Fundament;Dezember;630;630;0");
    // Instagram halb und halb: 405 → 203 Werbebudget (gerundet), 202 Fremdkosten.
    expect(rows[25]).toBe("Instagram;Reichweite;Januar;405;202;203");
    expect(rows[37]).toBe("Print und Anzeiger;Reichweite;Januar;405;0;405");
    expect(rows.at(-12)).toBe("Summe;;Januar;2251;1643;608");
    expect(rows.at(-1)).toBe("Summe;;Dezember;2239;1631;608");
    expect(csv).not.toMatch(/\d'\d/);
    expect(csv).not.toContain("\n\n");
    expect(csvFilename(beispiel)).toBe("marketing-budget-malerei-keller.csv");
    expect(csvFilename({ firma: "" })).toBe("marketing-budget-betrieb.csv");
  });
  it("Summenzeilen der CSV ergeben das Jahresbudget", () => {
    const rows = toCsv(result).slice(1).trim().split("\r\n").filter((r) => r.startsWith("Summe;"));
    expect(rows).toHaveLength(12);
    expect(rows.reduce((s, r) => s + Number(r.split(";")[3]), 0)).toBe(27000);
  });
  it("eingabeText nennt jede Angabe auf einer Zeile", () => {
    expect(eingabeText(beispiel)).toBe(
      [
        "Betrieb: Malerei Keller",
        "Jahresumsatz: CHF 900'000.-",
        "Phase: Etabliert: Auslastung halten",
        "Ziel: Leicht wachsen",
        "Anteil vom Umsatz: 3 %",
        "Kanäle: Website, Google-Unternehmensprofil, Instagram, Print und Anzeiger, Empfehlungen und Bewertungen",
        "Eigenleistung: 20 Stunden pro Monat, Stundensatz CHF 80.-",
      ].join("\n"),
    );
    expect(eingabeText({ ...beispiel, organisationstyp: "verein", firma: "FC Trogen", stunden: 0, stundensatz: null })).toMatch(/^Verein: FC Trogen\nJahresbudget: CHF 900'000\.-/);
    expect(eingabeText({ ...beispiel, stunden: 0 })).toMatch(/Eigenleistung: keine Angabe$/);
    expect(eingabeText({ ...beispiel, stundensatz: null })).toMatch(/Eigenleistung: 20 Stunden pro Monat, ohne Stundensatz$/);
  });
  it("reportMarkdown beginnt mit dem Titel und enthält die Tabellen", () => {
    const md = reportMarkdown(result, beispiel, OHNE_DATEN);
    expect(md.startsWith("# Marketing-Budget für zwölf Monate\n")).toBe(true);
    expect(md).toMatch(/\| Kanal \| Anteil \| pro Monat \| pro Jahr \| Fremdkosten \| Werbebudget \|/);
    expect(md).toMatch(/\| Dezember \| CHF 2'239\.- \| CHF 27'000\.- \|/);
    expect(md).toMatch(/Ohne Richtwert, eigener Anteil/);
  });
});

describe("budget-planer: gespeicherter Stand", () => {
  it("parseState liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "x", 1, [], {}, { v: 2, input: beispiel, output: {} }, { v: 1 }, { v: 1, input: { ...beispiel, anteil: 40 } }, { v: 1, input: { ...beispiel, kanaele: [] } }]) {
      expect(parseState(raw)).toEqual(EMPTY_STATE);
    }
  });
  it("parseState rechnet das Ergebnis aus der Eingabe neu und lässt ein fehlendes Ergebnis weg", () => {
    const r = budget(beispiel, OHNE_DATEN);
    expect(parseState({ v: 1, input: beispiel, output: r }, OHNE_DATEN)).toEqual({ v: 1, input: beispiel, output: r });
    // Veränderte Zahlen im Speicher zählen nicht; die Eingabe entscheidet.
    expect(parseState({ v: 1, input: beispiel, output: { ...r, jahr: 1 } }, OHNE_DATEN).output?.jahr).toBe(27000);
    expect(parseState({ v: 1, input: beispiel, output: null }, OHNE_DATEN)).toEqual({ v: 1, input: beispiel, output: null });
    expect(parseState({ v: 1, input: beispiel }, OHNE_DATEN).output).toBeNull();
    expect(parseState({ v: 1, input: beispiel, output: "x" }, OHNE_DATEN).output).toBeNull();
    // Unbekannte Felder in der Eingabe fallen weg (zod), zu viele Kanäle oder fremde Schlüssel machen den Stand leer.
    expect(parseState({ v: 1, input: { ...beispiel, extra: 1 }, output: r }, OHNE_DATEN).input).toEqual(beispiel);
    expect(parseState({ v: 1, input: { ...beispiel, kanaele: ["tiktok"] }, output: r })).toEqual(EMPTY_STATE);
  });
  it("die Grenzen der Eingabe stehen in LIMITS", () => {
    expect(LIMITS.umsatz).toEqual({ min: 1000, max: 100_000_000 });
    expect(LIMITS.anteil).toEqual({ min: 0.5, max: 30, step: 0.5 });
    expect(LIMITS.stunden).toEqual({ min: 0, max: 400 });
    expect(LIMITS.stundensatz).toEqual({ min: 0, max: 500 });
  });
});
