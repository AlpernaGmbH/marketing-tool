import { describe, expect, it } from "vitest";
import { MAX_QUESTIONS, validateQuestions, type Answers } from "@/components/tool/questionnaire";
import { toMarkdown } from "@/lib/export/model";
import {
  AUFTRITT_GEWICHT,
  DIMENSIONS,
  FESTIGEN_AB,
  MAX_POINTS,
  STEPS,
  STUFE_AB,
  checkInfo,
  evaluate,
  groesseLabel,
  pointsFor,
  questions,
  resultText,
  stufe,
  pitchFor,
  toDocument,
  visualBlocks,
  type CheckInfo,
  type DimensionId,
} from "./logic";

// Spec: specs/reifegrad-check.md, Abschnitt «Logik» und «Rechenbeispiel».

/** Alle Fragen mit der Antwort an Position `index` (0 = tiefste, 3 = beste Stufe). */
function allAt(index: number): Answers {
  const out: Answers = {};
  for (const q of questions) if (q.type === "single") out[q.id] = q.options[Math.min(index, q.options.length - 1)].value;
  return out;
}

/** Rechenbeispiel aus der Spec: Malerei Keller, Gossau. */
const KELLER: Answers = {
  ziele: "kopf",
  zielgruppe: "grob",
  verantwortung: "unter2",
  bewertungen: "manchmal",
  kontakt: "gelegentlich",
  budget: "keins",
};
/** Website-Scan von Malerei Keller: Marketing-Check 38 von 100, Website 60, Google-Profil 50 (nicht bestätigt), Social Media 40, keine Web-Analyse. */
const KELLER_CHECK: CheckInfo = { score: 38, checkedAt: "2026-10-03T09:00:00.000Z", seo: 60, gbp: 50, gbpGeprueft: false, social: 40, analytics: false };
const VOLL: CheckInfo = { score: 100, checkedAt: "", seo: 100, gbp: 100, gbpGeprueft: true, social: 100, analytics: true };
const LEER: CheckInfo = { score: 0, checkedAt: "", seo: 0, gbp: 0, gbpGeprueft: true, social: 0, analytics: false };

const dim = (r: ReturnType<typeof evaluate>, id: DimensionId) => r.dimensionen.find((d) => d.id === id)!;

describe("reifegrad-check: Fragenkatalog", () => {
  it("ist gültig: höchstens sechs Fragen, alle Pflicht, eindeutige IDs und Werte", () => {
    expect(validateQuestions(questions)).toEqual([]);
    expect(questions).toHaveLength(6);
    expect(questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(questions.every((q) => q.required && q.type === "single")).toBe(true);
  });

  it("fragt nichts, was der Website-Scan liest: Website, Google-Profil, Social Media, Kennzahlen", () => {
    const ids = questions.map((q) => q.id);
    for (const gone of ["website", "google", "social", "messung"]) expect(ids).not.toContain(gone);
  });

  it("ordnet jede Frage genau einer Dimension zu; Auftritt und Inhalte haben keine Frage", () => {
    const assigned = DIMENSIONS.flatMap((d) => [...d.questions]);
    expect([...assigned].sort()).toEqual(questions.map((q) => q.id).sort());
    expect(DIMENSIONS.filter((d) => d.questions.length === 0).map((d) => d.id)).toEqual(["auftritt", "inhalte"]);
  });

  it("gibt bei single-Fragen die Position der Antwort als Punkte, 0 bis 3", () => {
    const q = questions.find((x) => x.id === "ziele")!;
    if (q.type !== "single") throw new Error("ziele ist single");
    expect(q.options.map((o) => pointsFor("ziele", o.value))).toEqual([0, 1, 2, 3]);
    expect(MAX_POINTS).toBe(3);
  });
});

describe("reifegrad-check: evaluate ohne Website-Scan", () => {
  it("bewertet nur Strategie, Kundenkontakt und Steuerung; Auftritt und Inhalte sind nicht bewertet und zählen nicht ins Gesamt", () => {
    const r = evaluate(KELLER);
    expect(r.dimensionen.map((d) => [d.id, d.score, d.stufe, d.quelle])).toEqual([
      ["strategie", 33, "Aufbau", "Selbstangabe"],
      ["auftritt", null, null, "nicht bewertet"],
      ["inhalte", null, null, "nicht bewertet"],
      ["kundenkontakt", 33, "Aufbau", "Selbstangabe"],
      ["steuerung", 17, "Anfang", "Selbstangabe"],
    ]);
    expect(r.nichtBewertet).toEqual(["Auftritt", "Inhalte"]);
    // (33 + 33 + 17) ÷ 3 = 27,7 → 28
    expect(r.gesamt).toBe(28);
    expect(r.stufe).toBe("Aufbau");
    expect(r.check).toBeNull();
    // Schritte nur für die drei bewerteten Dimensionen, schwächste zuerst
    expect(r.schritte.map((s) => s.dimension)).toEqual(["steuerung", "steuerung", "strategie", "strategie", "kundenkontakt", "kundenkontakt"]);
  });

  it("alles in der tiefsten Stufe ergibt 0, alles bestens 100", () => {
    const tief = evaluate(allAt(0));
    expect(tief.gesamt).toBe(0);
    expect(tief.stufe).toBe("Anfang");
    expect(tief.dimensionen.map((d) => d.score)).toEqual([0, null, null, 0, 0]);
    const gut = evaluate(allAt(3));
    expect(gut.gesamt).toBe(100);
    expect(gut.stufe).toBe("Fortgeschritten");
    expect(gut.dimensionen.filter((d) => d.score !== null).every((d) => d.score === 100)).toBe(true);
  });

  it("gibt bei leeren, unbekannten oder falsch typisierten Antworten 0 Punkte, nie NaN", () => {
    const cases: unknown[] = [{}, null, undefined, { ziele: "gibt-es-nicht", budget: ["fest"], verantwortung: 7 }, { ziele: ["messbar"], bewertungen: null }];
    for (const c of cases) {
      const r = evaluate(c as Answers);
      expect(r.gesamt).toBe(0);
      expect(r.dimensionen.every((d) => d.score === null || (Number.isFinite(d.score) && d.score === 0))).toBe(true);
      expect(r.antworten).toHaveLength(6);
      expect(r.antworten.every((a) => a.antwort === "–")).toBe(true);
    }
    expect(pointsFor("unbekannte-frage", "x")).toBe(0);
    expect(pointsFor("ziele", undefined)).toBe(0);
    expect(pointsFor("ziele", ["messbar"])).toBe(0);
  });

  it("wählt die Schritte nach Stufe: unter 50 aufbauen, ab 50 festigen; 50 ist festigen", () => {
    expect(FESTIGEN_AB).toBe(50);
    const r = evaluate(KELLER);
    expect(dim(r, "strategie").schritte).toEqual([...STEPS.strategie.aufbauen]);
    // Strategie (3 + 0) ÷ 6 = 50
    const grenze = evaluate({ ...KELLER, ziele: "messbar", zielgruppe: "nein" });
    expect(dim(grenze, "strategie").score).toBe(50);
    expect(dim(grenze, "strategie").schritte).toEqual([...STEPS.strategie.festigen]);
  });

  it("nimmt Branche und Grösse aus den (vorbefüllten) Antworten als Kontext, fehlende bleiben leer", () => {
    expect(evaluate(KELLER).kontext).toEqual({ branche: null, groesse: null });
    const r = evaluate({ ...KELLER, branche: " Malerei ", groesse: "10-49" });
    expect(r.kontext).toEqual({ branche: "Malerei", groesse: "10 bis 49 Mitarbeitende" });
    expect(groesseLabel("bis-50")).toBe("bis 50 Mitglieder");
    expect(groesseLabel("sonstwas")).toBe("sonstwas");
    // Kontext ändert die Punkte nicht.
    expect(r.gesamt).toBe(28);
  });
});

describe("reifegrad-check: evaluate mit Website-Scan", () => {
  it("rechnet das Beispiel Malerei Keller: 33, 56, 40, 33, 11 → 35", () => {
    const r = evaluate(KELLER, KELLER_CHECK);
    expect(AUFTRITT_GEWICHT).toEqual({ seo: 25, gbp: 20 });
    expect(r.dimensionen.map((d) => [d.id, d.score, d.stufe, d.quelle])).toEqual([
      ["strategie", 33, "Aufbau", "Selbstangabe"],
      // (60 × 25 + 50 × 20) ÷ 45 = 55,6 → 56
      ["auftritt", 56, "Routine", "Website-Scan"],
      ["inhalte", 40, "Aufbau", "Website-Scan"],
      ["kundenkontakt", 33, "Aufbau", "Selbstangabe"],
      // (1 + 0 + 0 ohne Web-Analyse) ÷ 9 = 11
      ["steuerung", 11, "Anfang", "Selbstangabe und Website-Scan"],
    ]);
    expect(r.nichtBewertet).toEqual([]);
    // (33 + 56 + 40 + 33 + 11) ÷ 5 = 34,6 → 35
    expect(r.gesamt).toBe(35);
    expect(r.stufe).toBe("Aufbau");
    expect(r.check).toEqual(KELLER_CHECK);
    expect(dim(r, "auftritt").scan).toBe(56);
    expect(dim(r, "auftritt").selbst).toBeNull();
    expect(dim(r, "steuerung")).toMatchObject({ selbst: 17, scan: 0 });
  });

  it("zählt eine eingebundene Web-Analyse in «Steuerung» als dritte Frage mit 3 Punkten: (1 + 0 + 3) ÷ 9 = 44", () => {
    const r = evaluate(KELLER, { ...KELLER_CHECK, analytics: true });
    expect(dim(r, "steuerung")).toMatchObject({ score: 44, scan: 100, quelle: "Selbstangabe und Website-Scan" });
    // Ist die Web-Analyse unbekannt, zählen nur die zwei Fragen.
    const unbekannt = evaluate(KELLER, { ...KELLER_CHECK, analytics: null });
    expect(dim(unbekannt, "steuerung")).toMatchObject({ score: 17, scan: null, quelle: "Selbstangabe" });
  });

  it("nimmt für «Auftritt» den vorhandenen Teilwert allein, wenn der andere fehlt, und lässt die Dimension sonst unbewertet", () => {
    expect(dim(evaluate(KELLER, { ...KELLER_CHECK, gbp: null }), "auftritt").score).toBe(60);
    expect(dim(evaluate(KELLER, { ...KELLER_CHECK, seo: null }), "auftritt").score).toBe(50);
    const keine = evaluate(KELLER, { ...KELLER_CHECK, seo: null, gbp: null, social: null });
    expect(dim(keine, "auftritt").score).toBeNull();
    expect(dim(keine, "inhalte").score).toBeNull();
    expect(keine.nichtBewertet).toEqual(["Auftritt", "Inhalte"]);
  });

  it("ergibt mit bestem Scan und besten Antworten 100, mit schlechtestem 0", () => {
    expect(evaluate(allAt(3), VOLL).gesamt).toBe(100);
    expect(evaluate(allAt(3), VOLL).dimensionen.every((d) => d.score === 100)).toBe(true);
    const tief = evaluate(allAt(0), LEER);
    expect(tief.gesamt).toBe(0);
    expect(tief.dimensionen.map((d) => d.score)).toEqual([0, 0, 0, 0, 0]);
    // Bei Gleichstand bleibt die feste Reihenfolge der Dimensionen.
    expect(tief.schritte.map((s) => s.dimension)).toEqual(["strategie", "strategie", "auftritt", "auftritt", "inhalte", "inhalte", "kundenkontakt", "kundenkontakt", "steuerung", "steuerung"]);
  });

  it("ordnet die Schritte nach der schwächsten Dimension", () => {
    const r = evaluate(KELLER, KELLER_CHECK);
    expect(r.schritte).toHaveLength(10);
    expect(r.schritte.map((s) => s.dimension)).toEqual(["steuerung", "steuerung", "strategie", "strategie", "kundenkontakt", "kundenkontakt", "inhalte", "inhalte", "auftritt", "auftritt"]);
    expect(r.schritte[0].text).toBe(STEPS.steuerung.aufbauen[0]);
    expect(dim(r, "auftritt").schritte).toEqual([...STEPS.auftritt.festigen]);
  });

  it("ignoriert ein unbrauchbares Check-Ergebnis und begrenzt die Punktzahl auf 0 bis 100", () => {
    expect(evaluate(KELLER, { ...KELLER_CHECK, score: Number.NaN }).check).toBeNull();
    expect(evaluate(KELLER, { ...KELLER_CHECK, score: Number.NaN }).gesamt).toBe(28);
    expect(evaluate(KELLER, { ...KELLER_CHECK, score: 250 }).check?.score).toBe(100);
    expect(evaluate(KELLER, { ...KELLER_CHECK, score: -5 }).check?.score).toBe(0);
  });
});

describe("reifegrad-check: Stufen", () => {
  it("hält die Grenzen 25, 50 und 75 ein (Richtwert dieses Werkzeugs)", () => {
    expect(STUFE_AB).toEqual({ Aufbau: 25, Routine: 50, Fortgeschritten: 75 });
    expect(stufe(0)).toBe("Anfang");
    expect(stufe(24)).toBe("Anfang");
    expect(stufe(25)).toBe("Aufbau");
    expect(stufe(49)).toBe("Aufbau");
    expect(stufe(50)).toBe("Routine");
    expect(stufe(74)).toBe("Routine");
    expect(stufe(75)).toBe("Fortgeschritten");
    expect(stufe(100)).toBe("Fortgeschritten");
    expect(stufe(Number.NaN)).toBe("Anfang");
  });
});

describe("reifegrad-check: checkInfo", () => {
  const result = {
    score: 38.4,
    checkedAt: "2026-10-03T09:00:00.000Z",
    categories: [
      { id: "seo", score: 0.6 },
      { id: "gbp", score: 0.5, verified: false },
      { id: "social", score: 0.4 },
      { id: "sea", score: 0.4, items: [{ id: "sea.ads", ok: false }, { id: "sea.analytics", ok: true }] },
    ],
  };

  it("liest nur ein Ergebnis mit endlicher Punktzahl", () => {
    expect(checkInfo(null)).toBeNull();
    expect(checkInfo({ phase: "intro" })).toBeNull();
    expect(checkInfo({ phase: "result" })).toBeNull();
    expect(checkInfo({ phase: "result", result: { score: "38" } })).toBeNull();
    expect(checkInfo({ phase: "result", result: { score: Number.NaN } })).toBeNull();
    expect(checkInfo({ phase: "result", result: { score: 120 } })?.score).toBe(100);
  });

  it("liest Teilwerte, die Bestätigung des Google-Profils und die Web-Analyse aus den Kategorien", () => {
    expect(checkInfo({ phase: "result", result })).toEqual({
      score: 38,
      checkedAt: "2026-10-03T09:00:00.000Z",
      seo: 60,
      gbp: 50,
      gbpGeprueft: false,
      social: 40,
      analytics: true,
    });
    const bestaetigt = checkInfo({ phase: "result", result: { ...result, categories: [{ id: "gbp", score: 1, verified: true }] } });
    expect(bestaetigt).toMatchObject({ gbp: 100, gbpGeprueft: true, seo: null, social: null, analytics: null });
  });

  it("verträgt fehlende, kaputte und unsinnige Kategorien", () => {
    const leer = { score: null, seo: null, gbp: null, social: null, analytics: null, gbpGeprueft: false };
    expect(checkInfo({ phase: "result", result: { score: 10 } })).toMatchObject({ ...leer, score: 10 });
    expect(checkInfo({ phase: "result", result: { score: 10, categories: [null, 3, "x", { id: "seo", score: "hoch" }, { id: "sea", items: "nein" }] } })).toMatchObject({ ...leer, score: 10 });
    expect(checkInfo({ phase: "result", result: { score: 10, categories: [{ id: "seo", score: 7 }, { id: "social", score: -2 }] } })).toMatchObject({ seo: 100, social: 0 });
  });
});

describe("reifegrad-check: Dokument und CRM-Text", () => {
  it("enthält Gesamt, alle fünf Dimensionen mit Quelle, die Schritte, den Rechenweg und die Antworten", () => {
    const r = evaluate({ ...KELLER, branche: "Malerei", groesse: "10-49" }, KELLER_CHECK);
    const doc = toDocument(r);
    const md = toMarkdown(doc);
    expect(doc.title).toBe("Reifegrad-Check");
    expect(doc.filename).toBe("reifegrad-check");
    expect(md).toContain("35 von 100, Stufe «Aufbau»");
    for (const d of DIMENSIONS) expect(md).toContain(`| ${d.name} |`);
    expect(md).toContain("| Auftritt | 56 von 100 | Routine | Website-Scan |");
    expect(md).toContain("| Steuerung | 11 von 100 | Anfang | Selbstangabe und Website-Scan |");
    expect(md).toContain("Marketing-Check 38 von 100 vom 03.10.2026");
    expect(md).toContain("Malerei");
    expect(md).toContain("10 bis 49 Mitarbeitende");
    expect(md).toContain(`1. Steuerung: ${STEPS.steuerung.aufbauen[0]}`);
    expect(md).toContain("im Verhältnis 25 zu 20");
    expect(md).toContain("Richtwerte dieses Werkzeugs");
    expect(md).toContain("Sind deine Marketingziele schriftlich festgehalten?:** Im Kopf oder mündlich besprochen");
  });

  it("sagt ohne Scan, was nicht bewertet ist, und lässt leere Kontextzeilen weg", () => {
    const md = resultText(evaluate(KELLER));
    expect(md).toContain("nicht einbezogen, kein Ergebnis gespeichert; nicht bewertet: Auftritt, Inhalte");
    expect(md).toContain("| Auftritt | nicht bewertet | – | nicht bewertet |");
    expect(md).toContain("Ohne Scan sind sie nicht bewertet und zählen nicht ins Gesamt.");
    expect(md).not.toContain("Branche:");
    expect(md).not.toContain("Grösse:");
  });

  it("resultText beginnt mit Gesamt und Dimensionen, damit das Wichtigste vor der Kürzung auf 1'900 Zeichen steht", () => {
    const md = resultText(evaluate(KELLER, KELLER_CHECK));
    expect(md.indexOf("35 von 100")).toBeLessThan(md.indexOf("Nächste Schritte"));
    expect(md.slice(0, 1900)).toContain("| Steuerung | 11 von 100 | Anfang |");
  });

  it("hält die Schrittexte frei von Ausrufezeichen, Gedankenstrichen und «jetzt»", () => {
    for (const d of Object.values(STEPS)) {
      for (const t of [...d.aufbauen, ...d.festigen]) {
        expect(t).not.toMatch(/[!—]/);
        expect(t).not.toMatch(/\bjetzt\b/i);
        expect(t).not.toMatch(/\s[,.;:?]/);
      }
    }
  });
});

describe("reifegrad-check: Bildschirm und Hinweis auf Alperna", () => {
  it("zeigt Gesamt, das Netzdiagramm der fünf Dimensionen und die Schritte als Folien, in der Reihenfolge der schwächsten Dimension", () => {
    const r = evaluate(KELLER, KELLER_CHECK);
    const blocks = visualBlocks(r);
    expect(blocks.map((b) => b.type)).toEqual(["stat", "radar", "slides"]);
    expect(blocks[0]).toMatchObject({ type: "stat", value: "35", of: "100", band: "Stufe «Aufbau»" });
    const radar = blocks[1] as Extract<(typeof blocks)[number], { type: "radar" }>;
    expect(radar.title).toBe("Fünf Dimensionen");
    expect(radar.items.map((i) => i.label)).toEqual(DIMENSIONS.map((d) => d.name));
    expect(radar.items.find((i) => i.label === "Auftritt")).toMatchObject({ value: 56, note: "Stufe «Routine», Website-Scan" });
    // genau eine Dimension ist hervorgehoben: die schwächste, mit der auch die Schritte beginnen
    expect(radar.items.filter((i) => i.highlight).map((i) => i.label)).toEqual(["Steuerung"]);
    const slides = blocks[2] as Extract<(typeof blocks)[number], { type: "slides" }>;
    expect(slides.items).toHaveLength(r.schritte.length);
    expect(slides.items[0]).toMatchObject({ title: "Steuerung", tag: "Schritt 1" });
  });

  it("zeigt ohne Scan nur die bewerteten Dimensionen im Netzdiagramm und nennt die übrigen in einem Satz", () => {
    const blocks = visualBlocks(evaluate(KELLER));
    expect(blocks.map((b) => b.type)).toEqual(["stat", "radar", "paragraph", "slides"]);
    const radar = blocks[1] as Extract<(typeof blocks)[number], { type: "radar" }>;
    expect(radar.title).toBe("3 von 5 Dimensionen");
    expect(radar.items.map((i) => i.label)).toEqual(["Strategie", "Kundenkontakt", "Steuerung"]);
    expect(blocks[2]).toMatchObject({ type: "paragraph", text: expect.stringContaining("Nicht bewertet: Auftritt und Inhalte.") });
  });

  it("nennt Alperna in der schwächsten Dimension, in der Alperna arbeitet, mit dem passenden Baustein", () => {
    // Auftritt tief (Website und Google-Profil 0), alles andere hoch: Website
    const auftritt = evaluate(allAt(3), { ...VOLL, seo: 0, gbp: 0 });
    expect(dim(auftritt, "auftritt").score).toBe(0);
    expect(pitchFor(auftritt)).toEqual({ baustein: "Website", satz: "Am meisten Luft hat bei dir «Auftritt»: 0 von 100." });
    // Inhalte tief: Social Media
    expect(pitchFor(evaluate(allAt(3), { ...VOLL, social: 10 }))).toEqual({ baustein: "Social Media", satz: "Am meisten Luft hat bei dir «Inhalte»: 10 von 100." });
  });

  it("wählt die schwächste von Auftritt, Inhalte und Kundenkontakt; Strategie und Steuerung zählen nicht", () => {
    const spec = pitchFor(evaluate(KELLER, KELLER_CHECK))!;
    // Kundenkontakt 33 ist schwächer als Inhalte 40 und Auftritt 56; Steuerung 11 zählt nicht
    expect(spec).toEqual({ baustein: "Google Business Profil", satz: "Am meisten Luft hat bei dir «Kundenkontakt»: 33 von 100." });
    expect(spec.satz).not.toMatch(/Strategie|Steuerung/);
  });

  it("überspringt nicht bewertete Dimensionen und sagt nichts, wenn alle drei schon «Fortgeschritten» sind", () => {
    const ohneScan = pitchFor(evaluate(KELLER))!;
    expect(ohneScan.satz).toBe("Am meisten Luft hat bei dir «Kundenkontakt»: 33 von 100.");
    expect(pitchFor(evaluate(allAt(3), VOLL))).toBeNull();
    expect(pitchFor(evaluate(allAt(3)))).toBeNull();
  });

  it("nennt weder Preise noch Versprechen im Satz", () => {
    const spec = pitchFor(evaluate(KELLER, KELLER_CHECK))!;
    expect(spec.satz).not.toMatch(/CHF|garantiert|Gratis/i);
  });
});
