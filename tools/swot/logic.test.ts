import { describe, expect, it } from "vitest";
import type { Answers } from "@/components/tool/questionnaire";
import { sampleResult } from "@/lib/check/fixtures";
import { toMarkdown } from "@/lib/export/model";
import { questions } from "@/tools/reifegrad-check/logic";
import { MAX_FAKTEN, MAX_FAKT_CHARS, MAX_FELD_CHARS, MAX_ZIEL_CHARS, type SwotInput, type SwotOutput } from "./generator";
import {
  CHECK_SCHWACH,
  CHECK_SLUG,
  CHECK_STARK,
  EMPTY_FORM,
  EMPTY_STATE,
  FELDER,
  KI_HINWEIS,
  QUELLE_CHECK,
  QUELLE_REIFEGRAD,
  REIFEGRAD_SLUG,
  SLUG,
  charCount,
  eingabeText,
  faktenAus,
  faktenAusCheck,
  faktenAusReifegrad,
  feldLabel,
  folgerungenTabelle,
  inputProblem,
  parseState,
  punktZeile,
  reportMarkdown,
  toDocument,
  toInput,
  type FormValues,
} from "./logic";

// Spec: specs/swot.md, Abschnitte «Logik», «Edge Cases» und «Tests».

// ---- Stände der beiden Checks, wie sie im Browser liegen ----------------------------------------------

type Cat = { id: string; title: string; weight: number; score: number; items?: unknown[] };

/** Gespeicherter Stand des Marketing-Checks (Form von parseCheckState) mit beliebigen Bereichen. */
function checkState(categories: unknown[], over: Record<string, unknown> = {}) {
  return {
    v: 1,
    phase: "result",
    step: 0,
    answers: {},
    form: { industry: "craft", socials: {} },
    result: {
      v: 1,
      score: 50,
      company: "Malerei Keller",
      url: "https://malerei-keller.ch",
      checkedAt: "2026-10-03T09:00:00.000Z",
      categories,
      facts: {},
      massnahmen: [],
      ...over,
    },
  };
}

const cat = (title: string, score: number, weight = 10): Cat => ({ id: title.toLowerCase(), title, weight, score, items: [] });

/** Alle Fragen des Reifegrad-Checks mit der Antwort an Position `index` (0 = tiefste, 3 = beste Stufe). */
function allAt(index: number): Answers {
  const out: Answers = {};
  for (const q of questions) {
    if (q.type === "single") out[q.id] = q.options[Math.min(index, q.options.length - 1)].value;
    else if (q.type === "multi") out[q.id] = index === 0 ? ["keine"] : q.options.filter((o) => o.value !== "keine").slice(0, index).map((o) => o.value);
  }
  return out;
}

/** Rechenbeispiel aus specs/reifegrad-check.md: Strategie 33, Auftritt 67, Inhalte 67, Kundenkontakt 33, Steuerung 22. */
const KELLER: Answers = {
  ziele: "kopf",
  zielgruppe: "grob",
  verantwortung: "unter2",
  website: "jahr",
  google: "bestaetigt",
  social: "monatlich",
  bewertungen: "manchmal",
  kontakt: "gelegentlich",
  messung: ["anfragen"],
  budget: "keins",
};

const reifegradState = (answers: Answers, phase = "result") => ({ v: 1, phase, step: 10, answers });

// ---- Formular, Eingabe, Entwurf ---------------------------------------------------------------------

const fields = { firma: " Malerei Keller ", branche: "Malerei", ort: "Gossau", groesse: "10-49", positionierung: "Der Malerbetrieb in Gossau,   der Termine hält." };

const form: FormValues = {
  staerken: "Stammkundschaft seit Jahren\n\n\n\nOfferte innert drei Arbeitstagen",
  schwaechen: "Website veraltet",
  chancen: "",
  risiken: "Preisdruck aus St. Gallen",
  ziel: "Mehr Anfragen   von Privaten",
};

const input: SwotInput = {
  betrieb: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  groesse: "10 bis 49 Mitarbeitende",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
  ziel: "Mehr Anfragen von Privaten",
  staerken: "Stammkundschaft seit Jahren\n\nOfferte innert drei Arbeitstagen",
  schwaechen: "Website veraltet",
  chancen: "",
  risiken: "Preisdruck aus St. Gallen",
  fakten: ["Bereich «Website und SEO» ist stark (76 von 100)", "Bereich «Google-Business-Profil» ist schwach (25 von 100)"],
};

const punkt = (p: string, w: string) => ({ punkt: p, warum: w });

const output: SwotOutput = {
  einSatz: "Malerei Keller lebt von Empfehlungen und sauberer Arbeit, bleibt online aber hinter dem zurück, was der Betrieb kann.",
  staerken: [
    punkt("Stammkundschaft, die den Betrieb weiterempfiehlt.", "Empfehlungen sind der günstigste Weg zu neuen Aufträgen."),
    punkt("Offerte innert drei Arbeitstagen.", "Schnelle Antworten gewinnen Aufträge."),
    punkt("Website und SEO sind laut Check stark (76 von 100):", "Die Website trägt schon, sie braucht nur mehr Besucher."),
  ],
  schwaechen: [
    punkt("Google-Business-Profil ist schwach (25 von 100).", "Wer «Maler Gossau» sucht, findet den Betrieb nicht auf der Karte."),
    punkt("Die Website ist veraltet.", "Alte Fotos wirken wie ein Betrieb, der stillsteht."),
    punkt("Niemand hat feste Zeit fürs Marketing.", "Ohne feste Stunde bleibt jede Massnahme liegen."),
  ],
  chancen: [
    punkt("[Bauprojekt in deiner Gemeinde] steht an.", "Baustellen in der Nähe sind Anlässe für Beiträge."),
    punkt("Neue Hausbesitzer in der Region.", "Neue Häuser brauchen in wenigen Jahren den ersten Anstrich."),
    punkt("Ein Mitbewerber hört auf.", "Seine Kundschaft sucht einen neuen Betrieb in der Nähe."),
  ],
  risiken: [
    punkt("Preisdruck aus St. Gallen.", "Wer nur über den Preis spricht, verliert gegen Grössere."),
    punkt("Abhängigkeit von Empfehlungen.", "Bleiben Empfehlungen aus, fehlt ein zweiter Weg zu Anfragen."),
  ],
  folgerungen: [
    { massnahme: "Google-Business-Profil bestätigen und mit Fotos füllen.", nutzt: "Saubere Arbeit", behebt: "Schwaches Google-Profil", aufwand: "klein" },
    { massnahme: "Zufriedene Kundschaft um eine Bewertung bitten.", nutzt: "Stammkundschaft", behebt: "  ", aufwand: "klein" },
    { massnahme: "Beitrag und Flyer für das neue Quartier.", nutzt: "Neue Hausbesitzer", behebt: "Abhängigkeit von Empfehlungen", aufwand: "mittel" },
  ],
};

describe("swot: Konstanten und Labels", () => {
  it("kennt die Slugs der beiden Checks, die vier Felder und die Schwellen", () => {
    expect(SLUG).toBe("swot");
    expect(CHECK_SLUG).toBe("digitaler-auftritt-check");
    expect(REIFEGRAD_SLUG).toBe("reifegrad-check");
    expect(FELDER.map((f) => f.key)).toEqual(["staerken", "schwaechen", "chancen", "risiken"]);
    expect(FELDER.map((f) => `${f.label}: ${f.frage}`)).toEqual([
      "Stärken: Was läuft gut?",
      "Schwächen: Was fehlt oder nervt?",
      "Chancen: Was verändert sich um dich herum?",
      "Risiken: Was könnte dir schaden?",
    ]);
    expect(feldLabel("chancen")).toBe("Chancen");
    expect(CHECK_STARK).toBe(0.75);
    expect(CHECK_SCHWACH).toBe(0.4);
    expect(charCount("Ärger")).toBe(5);
  });
});

describe("swot: Fakten aus dem Marketing-Check", () => {
  it("liest das Beispielergebnis der Engine: starke und schwache Bereiche mit Gewicht, nichts aus der Mitte", async () => {
    const result = await sampleResult();
    const fakten = faktenAusCheck({ v: 1, phase: "result", step: 0, answers: {}, form: { industry: "craft", socials: {} as never }, result });
    expect(fakten.map((f) => f.text)).toEqual([
      "Bereich «Website und SEO» ist stark (76 von 100)",
      "Bereich «Google-Business-Profil» ist schwach (25 von 100)",
      "Bereich «Online-Werbung und Tracking» ist schwach (0 von 100)",
      "Bereich «Newsletter» ist schwach (0 von 100)",
      "Bereich «Online-Buchung» ist schwach (0 von 100)",
    ]);
    expect(fakten.map((f) => f.feld)).toEqual(["staerken", "schwaechen", "schwaechen", "schwaechen", "schwaechen"]);
    expect(fakten.every((f) => f.quelle === QUELLE_CHECK)).toBe(true);
    // «Social Media» liegt mit rund 49 von 100 dazwischen, «Online-Shop» hat Gewicht 0: beide ergeben keinen Fakt.
    expect(JSON.stringify(fakten)).not.toContain("Social Media");
    expect(JSON.stringify(fakten)).not.toContain("Online-Shop");
  });

  it("hält die Schwellen genau ein und lässt Bereiche ohne Gewicht, ohne Titel oder ohne Zahl weg", () => {
    const state = checkState([
      cat("Genau stark", CHECK_STARK),
      cat("Knapp nicht stark", 0.749),
      cat("Genau Grenze", CHECK_SCHWACH),
      cat("Knapp schwach", 0.399),
      cat("Ohne Gewicht", 0, 0),
      cat("Negatives Gewicht", 0, -1),
      cat("Über eins", 1.4),
      { id: "x", title: "", weight: 5, score: 0 },
      { id: "y", title: "Keine Zahl", weight: 5, score: Number.NaN },
      { id: "z", title: "Text statt Zahl", weight: 5, score: "0" },
      null,
      "kaputt",
    ]);
    const { fakten, hatCheck } = faktenAus(state, null);
    expect(hatCheck).toBe(true);
    expect(fakten.map((f) => f.text)).toEqual(["Bereich «Genau stark» ist stark (75 von 100)", "Bereich «Knapp schwach» ist schwach (40 von 100)", "Bereich «Über eins» ist stark (100 von 100)"]);
  });
});

describe("swot: Fakten aus dem Reifegrad-Check", () => {
  it("nennt die stärkste und die schwächste Dimension, ohne Check mit den Selbstangaben", () => {
    const fakten = faktenAusReifegrad(reifegradState(KELLER), null);
    expect(fakten).toEqual([
      { text: "Reifegrad: «Auftritt» ist die stärkste Dimension (67 von 100, Stufe «Routine»)", quelle: QUELLE_REIFEGRAD, feld: "staerken" },
      { text: "Reifegrad: «Steuerung» ist die schwächste Dimension (22 von 100, Stufe «Anfang»)", quelle: QUELLE_REIFEGRAD, feld: "schwaechen" },
    ]);
  });
  it("rechnet den Marketing-Check wie das Werkzeug selbst zur Hälfte in «Auftritt» ein", () => {
    // Auftritt: (67 + 38) ÷ 2 = 52,5 → 53; damit ist «Inhalte» mit 67 die stärkste Dimension.
    const fakten = faktenAusReifegrad(reifegradState(KELLER), { score: 38, checkedAt: "2026-10-03T09:00:00.000Z" });
    expect(fakten[0].text).toBe("Reifegrad: «Inhalte» ist die stärkste Dimension (67 von 100, Stufe «Routine»)");
    expect(fakten[1].text).toBe("Reifegrad: «Steuerung» ist die schwächste Dimension (22 von 100, Stufe «Anfang»)");
  });
  it("gibt bei Gleichstand aller Dimensionen einen Fakt, unten als Schwäche, oben als Stärke", () => {
    expect(faktenAusReifegrad(reifegradState(allAt(0)), null)).toEqual([
      { text: "Reifegrad: alle fünf Dimensionen liegen bei 0 von 100 (Stufe «Anfang»)", quelle: QUELLE_REIFEGRAD, feld: "schwaechen" },
    ]);
    expect(faktenAusReifegrad(reifegradState(allAt(3)), null)).toEqual([
      { text: "Reifegrad: alle fünf Dimensionen liegen bei 100 von 100 (Stufe «Fortgeschritten»)", quelle: QUELLE_REIFEGRAD, feld: "staerken" },
    ]);
  });
  it("liefert nichts, solange der Fragebogen nicht beim Ergebnis ist oder der Stand kaputt ist", () => {
    expect(faktenAusReifegrad(reifegradState(KELLER, "questions"), null)).toEqual([]);
    expect(faktenAusReifegrad(reifegradState(KELLER, "summary"), null)).toEqual([]);
    expect(faktenAusReifegrad(null, null)).toEqual([]);
    expect(faktenAusReifegrad("result", null)).toEqual([]);
    expect(faktenAusReifegrad({ phase: "result", answers: "kaputt" }, null)).toHaveLength(1); // leere Antworten: alles bei 0
  });
});

describe("swot: faktenAus (beide Stände zusammen)", () => {
  it("gibt ohne Stände, bei kaputten Ständen und vor dem Ergebnis keine Fakten", () => {
    const faelle: [unknown, unknown][] = [
      [null, null],
      [undefined, undefined],
      ["x", []],
      [{ phase: "intro" }, { phase: "intro" }],
      [{ v: 1, phase: "result", result: { score: 50 } }, { v: 1, phase: "questions", answers: KELLER }],
      [checkState([]), { v: 1, phase: "summary", answers: KELLER }],
    ];
    for (const [c, r] of faelle) {
      const out = faktenAus(c, r);
      expect(out.fakten).toEqual([]);
      expect(out.hatReifegrad).toBe(false);
    }
    // Ein Ergebnis ohne Bereiche zählt als Check (hatCheck), ergibt aber keinen Fakt; ein kaputtes Ergebnis zählt nicht.
    expect(faktenAus({ v: 1, phase: "result", result: { score: 50 } }, null).hatCheck).toBe(false);
    expect(faktenAus(checkState([]), null).hatCheck).toBe(true);
  });
  it("nimmt nur den Check, nur den Reifegrad oder beide; die Fakten des Checks stehen zuerst", async () => {
    const check = checkState([cat("Website und SEO", 0.8), cat("Google-Business-Profil", 0.2)], { score: 38 });
    const nurCheck = faktenAus(check, null);
    expect(nurCheck.hatCheck).toBe(true);
    expect(nurCheck.hatReifegrad).toBe(false);
    expect(nurCheck.fakten.map((f) => f.quelle)).toEqual([QUELLE_CHECK, QUELLE_CHECK]);

    const nurReifegrad = faktenAus(null, reifegradState(KELLER));
    expect(nurReifegrad.hatCheck).toBe(false);
    expect(nurReifegrad.hatReifegrad).toBe(true);
    expect(nurReifegrad.fakten.map((f) => f.text)).toEqual([
      "Reifegrad: «Auftritt» ist die stärkste Dimension (67 von 100, Stufe «Routine»)",
      "Reifegrad: «Steuerung» ist die schwächste Dimension (22 von 100, Stufe «Anfang»)",
    ]);

    const beide = faktenAus(check, reifegradState(KELLER));
    expect(beide.hatCheck && beide.hatReifegrad).toBe(true);
    expect(beide.fakten.map((f) => f.text)).toEqual([
      "Bereich «Website und SEO» ist stark (80 von 100)",
      "Bereich «Google-Business-Profil» ist schwach (20 von 100)",
      // Mit dem Check (38) fällt «Auftritt» auf 53, «Inhalte» (67) wird die stärkste Dimension.
      "Reifegrad: «Inhalte» ist die stärkste Dimension (67 von 100, Stufe «Routine»)",
      "Reifegrad: «Steuerung» ist die schwächste Dimension (22 von 100, Stufe «Anfang»)",
    ]);

    const echt = faktenAus(checkState((await sampleResult()).categories, { score: 38 }), reifegradState(KELLER));
    expect(echt.fakten).toHaveLength(7);
  });
  it("begrenzt auf zwölf Fakten und kürzt jeden auf 200 Zeichen", () => {
    const viele = checkState(Array.from({ length: 14 }, (_, i) => cat(`Bereich ${i} ${"x".repeat(220)}`, 0.1)));
    const { fakten } = faktenAus(viele, reifegradState(KELLER));
    expect(fakten).toHaveLength(MAX_FAKTEN);
    expect(fakten.every((f) => f.text.length <= MAX_FAKT_CHARS && f.quelle === QUELLE_CHECK)).toBe(true);
  });
});

describe("swot: Eingabeprüfung", () => {
  it("verlangt den Namen und mindestens eines der vier Felder, meldet zu lange Texte, sonst nichts", () => {
    expect(inputProblem({ ...fields, firma: "  " }, form)).toMatch(/Namen deiner Firma oder deines Vereins/);
    expect(inputProblem({}, form)).toMatch(/Namen deiner Firma/);
    expect(inputProblem(fields, EMPTY_FORM)).toMatch(/mindestens eines der vier Felder/);
    expect(inputProblem(fields, { ...EMPTY_FORM, staerken: "   \n  ", ziel: "Ein Ziel allein reicht nicht" })).toMatch(/mindestens eines der vier Felder/);
    expect(inputProblem(fields, { ...EMPTY_FORM, chancen: "Neues Quartier" })).toBeNull();
    expect(inputProblem(fields, { ...form, risiken: "x".repeat(MAX_FELD_CHARS + 1) })).toMatch(/«Risiken» hat mehr als 600 Zeichen/);
    expect(inputProblem(fields, { ...form, ziel: "x".repeat(MAX_ZIEL_CHARS + 1) })).toMatch(/Ziel hat mehr als 200 Zeichen/);
    expect(inputProblem(fields, form)).toBeNull();
    expect(inputProblem({ firma: "FC Trogen" }, form)).toBeNull();
  });
});

describe("swot: toInput und eingabeText", () => {
  it("übernimmt Profil, Formular und Fakten, bereinigt Leerraum, behält Absätze und schreibt die Grösse als Wort", () => {
    const fakten = input.fakten.map((text) => ({ text, quelle: QUELLE_CHECK, feld: "staerken" as const }));
    expect(toInput(fields, form, fakten)).toEqual(input);
    const leer = toInput({ firma: "FC Trogen" }, { ...EMPTY_FORM, staerken: "Trainer" }, []);
    expect(leer).toEqual({ betrieb: "FC Trogen", branche: "", ort: "", groesse: "", positionierung: "", ziel: "", staerken: "Trainer", schwaechen: "", chancen: "", risiken: "", fakten: [] });
    expect(toInput({ ...fields, groesse: "bis-50" }, form, []).groesse).toBe("bis 50 Mitglieder");
    expect(toInput({ ...fields, groesse: "zwölf Leute" }, form, []).groesse).toBe("zwölf Leute");
  });
  it("kürzt zu lange Texte und zu viele oder leere Fakten", () => {
    const lang = toInput({ ...fields, firma: "F".repeat(200), positionierung: "p".repeat(900) }, { ...form, staerken: "s".repeat(900), ziel: "z".repeat(300) }, [
      ...Array.from({ length: 14 }, (_, i) => ({ text: `Fakt ${i} ${"f".repeat(250)}`, quelle: QUELLE_CHECK, feld: "staerken" as const })),
      { text: "   ", quelle: QUELLE_CHECK, feld: "staerken" as const },
    ]);
    expect(lang.betrieb).toHaveLength(120);
    expect(lang.positionierung).toHaveLength(MAX_FELD_CHARS);
    expect(lang.staerken).toHaveLength(MAX_FELD_CHARS);
    expect(lang.ziel).toHaveLength(MAX_ZIEL_CHARS);
    expect(lang.fakten).toHaveLength(MAX_FAKTEN);
    expect(lang.fakten.every((f) => f.length <= MAX_FAKT_CHARS)).toBe(true);
  });
  it("eingabeText nennt die Angaben je Zeile, lässt leere Felder weg und glättet Absätze", () => {
    expect(eingabeText(input).split("\n")).toEqual([
      "Betrieb: Malerei Keller",
      "Branche: Malerei",
      "Ort: Gossau",
      "Grösse: 10 bis 49 Mitarbeitende",
      "Ziel (zwölf Monate): Mehr Anfragen von Privaten",
      "Stärken: Stammkundschaft seit Jahren · Offerte innert drei Arbeitstagen",
      "Schwächen: Website veraltet",
      "Risiken: Preisdruck aus St. Gallen",
      "Positionierung: Der Malerbetrieb in Gossau, der Termine hält.",
      "Fakten aus Checks: Bereich «Website und SEO» ist stark (76 von 100) · Bereich «Google-Business-Profil» ist schwach (25 von 100)",
    ]);
    const knapp = eingabeText({ ...input, branche: "", ort: "", groesse: "", ziel: "", positionierung: "", fakten: [] });
    expect(knapp.split("\n")).toEqual(["Betrieb: Malerei Keller", "Stärken: Stammkundschaft seit Jahren · Offerte innert drei Arbeitstagen", "Schwächen: Website veraltet", "Risiken: Preisdruck aus St. Gallen"]);
  });
});

describe("swot: Dokument", () => {
  it("enthält Facts, KI-Hinweis, den Satz, die vier Abschnitte als Listen «Punkt: Warum», die Tabelle und die Fakten", () => {
    const doc = toDocument(output, input);
    expect(doc.title).toBe("SWOT-Analyse");
    expect(doc.subtitle).toBe("Marketing von Malerei Keller");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("swot-malerei-keller");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller, Gossau" },
        { label: "Branche", value: "Malerei" },
        { label: "Ziel (zwölf Monate)", value: "Mehr Anfragen von Privaten" },
      ],
    });
    expect(doc.blocks[1]).toEqual({ type: "paragraph", text: KI_HINWEIS });
    expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: "Die Lage in einem Satz" });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: output.einSatz });
    for (const f of FELDER) {
      expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: f.label });
      expect(doc.blocks).toContainEqual({ type: "list", items: output[f.key].map(punktZeile) });
    }
    expect(doc.blocks).toContainEqual({ type: "list", items: ["Stammkundschaft, die den Betrieb weiterempfiehlt: Empfehlungen sind der günstigste Weg zu neuen Aufträgen.", "Offerte innert drei Arbeitstagen: Schnelle Antworten gewinnen Aufträge.", "Website und SEO sind laut Check stark (76 von 100): Die Website trägt schon, sie braucht nur mehr Besucher."] });
    expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: "Daraus folgt" });
    expect(doc.blocks).toContainEqual(folgerungenTabelle(output));
    expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: "Fakten aus deinen Checks" });
    expect(doc.blocks).toContainEqual({ type: "list", items: input.fakten });
    // Reihenfolge: Satz, Stärken, Schwächen, Chancen, Risiken, Folgerungen, Fakten
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["Die Lage in einem Satz", "Stärken", "Schwächen", "Chancen", "Risiken", "Daraus folgt", "Fakten aus deinen Checks"]);
  });
  it("lässt leere Facts und den Abschnitt der Fakten weg", () => {
    const doc = toDocument(output, { ...input, ort: "", branche: "", ziel: "", fakten: [] });
    expect(doc.blocks[0]).toEqual({ type: "facts", items: [{ label: "Betrieb", value: "Malerei Keller" }] });
    expect(JSON.stringify(doc.blocks)).not.toContain("Fakten aus deinen Checks");
  });
  it("punktZeile und folgerungenTabelle: kein doppelter Punkt, leeres «behebt» als Strich", () => {
    expect(punktZeile(punkt("Offerte innert drei Tagen.", "Schnell gewinnt."))).toBe("Offerte innert drei Tagen: Schnell gewinnt.");
    expect(punktZeile(punkt("Website stark (76 von 100):", " Sie trägt. "))).toBe("Website stark (76 von 100): Sie trägt.");
    const table = folgerungenTabelle(output);
    expect(table).toEqual({
      type: "table",
      header: ["Massnahme", "Nutzt", "Behebt", "Aufwand"],
      widths: [3, 1.6, 1.6, 0.9],
      rows: [
        ["Google-Business-Profil bestätigen und mit Fotos füllen.", "Saubere Arbeit", "Schwaches Google-Profil", "klein"],
        ["Zufriedene Kundschaft um eine Bewertung bitten.", "Stammkundschaft", "–", "klein"],
        ["Beitrag und Flyer für das neue Quartier.", "Neue Hausbesitzer", "Abhängigkeit von Empfehlungen", "mittel"],
      ],
    });
  });
  it("reportMarkdown beginnt mit dem Titel, listet die Felder und die Tabelle und entspricht toMarkdown", () => {
    const md = reportMarkdown(output, input);
    expect(md).toBe(toMarkdown(toDocument(output, input)));
    expect(md.startsWith("# SWOT-Analyse\n")).toBe(true);
    expect(md).toContain("- **Betrieb:** Malerei Keller, Gossau");
    expect(md).toContain("## Stärken\n\n- Stammkundschaft, die den Betrieb weiterempfiehlt: Empfehlungen");
    expect(md).toContain("| Massnahme | Nutzt | Behebt | Aufwand |");
    expect(md).toContain("| Zufriedene Kundschaft um eine Bewertung bitten. | Stammkundschaft | – | klein |");
    expect(md).toContain(KI_HINWEIS);
  });
});

describe("swot: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten oder falscher Version den leeren Stand", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState([])).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, form, input, output })).toBe(EMPTY_STATE);
    expect(EMPTY_STATE).toEqual({ v: 1, form: EMPTY_FORM, input: null, output: null });
  });
  it("lässt Entwurf und Eingabe nur zusammen gelten und behält das Formular, gekürzt auf die Grenzen", () => {
    expect(parseState({ v: 1, form, input, output: { einSatz: "kaputt" } })).toEqual({ v: 1, form, input: null, output: null });
    expect(parseState({ v: 1, form, input: { betrieb: "" }, output })).toEqual({ v: 1, form, input: null, output: null });
    expect(parseState({ v: 1, form, output })).toEqual({ v: 1, form, input: null, output: null });
    const state = parseState({ v: 1, form: { staerken: "s".repeat(700), ziel: 7, chancen: null }, input, output });
    expect(state.form).toEqual({ ...EMPTY_FORM, staerken: "s".repeat(MAX_FELD_CHARS) });
    expect(state.output).toEqual(output);
    expect(parseState({ v: 1 }).form).toEqual(EMPTY_FORM);
    expect(parseState({ v: 1, form: "kaputt" }).form).toEqual(EMPTY_FORM);
  });
  it("gibt einen gültigen Stand nach JSON-Umweg unverändert zurück", () => {
    const state = { v: 1 as const, form, input, output };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
