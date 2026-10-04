import { describe, expect, it } from "vitest";
import { MAX_QUESTIONS, validateQuestions, type Answers } from "@/components/tool/questionnaire";
import { toMarkdown } from "@/lib/export/model";
import {
  CHECK_WEIGHT,
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
  toDocument,
  type DimensionId,
} from "./logic";

// Spec: specs/reifegrad-check.md, Abschnitt «Logik» und «Rechenbeispiel».

/** Alle Fragen mit der Antwort an Position `index` (0 = tiefste, 3 = beste Stufe). */
function allAt(index: number): Answers {
  const out: Answers = {};
  for (const q of questions) {
    if (q.type === "single") out[q.id] = q.options[Math.min(index, q.options.length - 1)].value;
    else if (q.type === "multi") out[q.id] = index === 0 ? ["keine"] : q.options.filter((o) => o.value !== "keine").slice(0, index).map((o) => o.value);
  }
  return out;
}

/** Rechenbeispiel aus der Spec: Malerei Keller, Gossau. */
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
const KELLER_CHECK = { score: 38, checkedAt: "2026-10-03T09:00:00.000Z" };

const dim = (r: ReturnType<typeof evaluate>, id: DimensionId) => r.dimensionen.find((d) => d.id === id)!;

describe("reifegrad-check: Fragenkatalog", () => {
  it("ist gültig: genau zehn Fragen, alle Pflicht, eindeutige IDs und Werte", () => {
    expect(validateQuestions(questions)).toEqual([]);
    expect(questions).toHaveLength(MAX_QUESTIONS);
    expect(questions.every((q) => q.required)).toBe(true);
  });

  it("ordnet jede Frage genau einer Dimension zu", () => {
    const assigned = DIMENSIONS.flatMap((d) => [...d.questions]);
    expect([...assigned].sort()).toEqual(questions.map((q) => q.id).sort());
  });

  it("gibt bei single-Fragen die Position der Antwort als Punkte, 0 bis 3", () => {
    const q = questions.find((x) => x.id === "ziele")!;
    if (q.type !== "single") throw new Error("ziele ist single");
    expect(q.options.map((o) => pointsFor("ziele", o.value))).toEqual([0, 1, 2, 3]);
    expect(MAX_POINTS).toBe(3);
  });
});

describe("reifegrad-check: evaluate", () => {
  it("alles in der tiefsten Stufe ergibt 0 und «Anfang» in jeder Dimension und gesamt", () => {
    const r = evaluate(allAt(0));
    expect(r.gesamt).toBe(0);
    expect(r.stufe).toBe("Anfang");
    expect(r.dimensionen.map((d) => d.score)).toEqual([0, 0, 0, 0, 0]);
    expect(r.dimensionen.every((d) => d.stufe === "Anfang")).toBe(true);
    expect(r.check).toBeNull();
    // Bei Gleichstand bleibt die feste Reihenfolge der Dimensionen.
    expect(r.schritte.map((s) => s.dimension)).toEqual(["strategie", "strategie", "auftritt", "auftritt", "inhalte", "inhalte", "kundenkontakt", "kundenkontakt", "steuerung", "steuerung"]);
  });

  it("alles bestens ergibt 100 und «Fortgeschritten»", () => {
    const r = evaluate(allAt(3));
    expect(r.gesamt).toBe(100);
    expect(r.stufe).toBe("Fortgeschritten");
    expect(r.dimensionen.every((d) => d.score === 100 && d.stufe === "Fortgeschritten")).toBe(true);
  });

  it("rechnet das Beispiel Malerei Keller ohne Check: 33, 67, 67, 33, 22 → 44", () => {
    const r = evaluate(KELLER);
    expect(r.dimensionen.map((d) => [d.id, d.score, d.stufe])).toEqual([
      ["strategie", 33, "Aufbau"],
      ["auftritt", 67, "Routine"],
      ["inhalte", 67, "Routine"],
      ["kundenkontakt", 33, "Aufbau"],
      ["steuerung", 22, "Anfang"],
    ]);
    expect(r.gesamt).toBe(44);
    expect(r.stufe).toBe("Aufbau");
    expect(dim(r, "auftritt").check).toBeNull();
    expect(dim(r, "auftritt").selbst).toBe(67);
  });

  it("zählt den Marketing-Check zur Hälfte in «Auftritt»: (67 + 38) ÷ 2 = 52,5 → 53, gesamt 42", () => {
    expect(CHECK_WEIGHT).toBe(0.5);
    const r = evaluate(KELLER, KELLER_CHECK);
    const auftritt = dim(r, "auftritt");
    expect(auftritt.selbst).toBe(67);
    expect(auftritt.check).toBe(38);
    expect(auftritt.score).toBe(53);
    expect(auftritt.stufe).toBe("Routine");
    expect(r.gesamt).toBe(42);
    expect(r.check).toEqual(KELLER_CHECK);
    // Die übrigen Dimensionen bleiben unverändert.
    expect(dim(r, "strategie").score).toBe(33);
    expect(dim(r, "steuerung").score).toBe(22);
    expect(r.dimensionen.filter((d) => d.id !== "auftritt").every((d) => d.check === null)).toBe(true);
  });

  it("ordnet die Schritte nach der schwächsten Dimension, bei Gleichstand in fester Reihenfolge", () => {
    const r = evaluate(KELLER, KELLER_CHECK);
    expect(r.schritte).toHaveLength(10);
    expect(r.schritte.map((s) => s.dimension)).toEqual(["steuerung", "steuerung", "strategie", "strategie", "kundenkontakt", "kundenkontakt", "auftritt", "auftritt", "inhalte", "inhalte"]);
    expect(r.schritte[0].name).toBe("Steuerung");
    expect(r.schritte[0].text).toBe(STEPS.steuerung.aufbauen[0]);
  });

  it("wählt die Schritte nach Stufe: unter 50 aufbauen, ab 50 festigen", () => {
    expect(FESTIGEN_AB).toBe(50);
    const r = evaluate(KELLER);
    expect(dim(r, "strategie").schritte).toEqual([...STEPS.strategie.aufbauen]);
    expect(dim(r, "inhalte").schritte).toEqual([...STEPS.inhalte.festigen]);
    // Genau an der Grenze: 50 ist festigen.
    const grenze = evaluate({ ...KELLER, website: "quartal", google: "keins" }); // (3 + 0) ÷ 6 = 50
    expect(dim(grenze, "auftritt").score).toBe(50);
    expect(dim(grenze, "auftritt").schritte).toEqual([...STEPS.auftritt.festigen]);
  });

  it("ignoriert ein fehlendes oder unbrauchbares Check-Ergebnis", () => {
    expect(evaluate(KELLER, null).gesamt).toBe(44);
    expect(evaluate(KELLER, { score: Number.NaN, checkedAt: "" }).check).toBeNull();
    expect(evaluate(KELLER, { score: Number.NaN, checkedAt: "" }).gesamt).toBe(44);
    // Ausserhalb von 0 bis 100 wird begrenzt.
    expect(dim(evaluate(KELLER, { score: 250, checkedAt: "" }), "auftritt").check).toBe(100);
    expect(dim(evaluate(KELLER, { score: -5, checkedAt: "" }), "auftritt").check).toBe(0);
  });

  it("gibt bei leeren, unbekannten oder falsch typisierten Antworten 0 Punkte, nie NaN", () => {
    const cases: unknown[] = [{}, null, undefined, { ziele: "gibt-es-nicht", website: 7, messung: "anfragen", budget: ["fest"], social: null }, { ziele: ["messbar"], messung: [42, null] }];
    for (const c of cases) {
      const r = evaluate(c as Answers);
      expect(r.gesamt).toBe(0);
      expect(r.dimensionen.every((d) => Number.isFinite(d.score) && d.score === 0)).toBe(true);
      expect(r.schritte).toHaveLength(10);
      expect(r.antworten.every((a) => a.antwort === "–")).toBe(true);
    }
    expect(pointsFor("unbekannte-frage", "x")).toBe(0);
    expect(pointsFor("ziele", undefined)).toBe(0);
  });

  it("zählt bei den Kennzahlen jede Kennzahl einen Punkt, höchstens drei; «keine» und Doppelte zählen nicht", () => {
    expect(pointsFor("messung", [])).toBe(0);
    expect(pointsFor("messung", ["keine"])).toBe(0);
    expect(pointsFor("messung", ["keine", "anfragen"])).toBe(1);
    expect(pointsFor("messung", ["anfragen", "anfragen"])).toBe(1);
    expect(pointsFor("messung", ["anfragen", "website", "google", "social", "kosten"])).toBe(3);
    expect(pointsFor("messung", ["anfragen", "erfunden"])).toBe(1);
  });

  it("nimmt Branche und Grösse aus den (vorbefüllten) Antworten als Kontext, fehlende bleiben leer", () => {
    expect(evaluate(KELLER).kontext).toEqual({ branche: null, groesse: null });
    const r = evaluate({ ...KELLER, branche: " Malerei ", groesse: "10-49" });
    expect(r.kontext).toEqual({ branche: "Malerei", groesse: "10 bis 49 Mitarbeitende" });
    expect(groesseLabel("bis-50")).toBe("bis 50 Mitglieder");
    expect(groesseLabel("sonstwas")).toBe("sonstwas");
    // Kontext ändert die Punkte nicht.
    expect(r.gesamt).toBe(44);
    expect(r.antworten).toHaveLength(10);
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
  it("liest nur ein Ergebnis mit endlicher Punktzahl", () => {
    expect(checkInfo(null)).toBeNull();
    expect(checkInfo({ phase: "intro" })).toBeNull();
    expect(checkInfo({ phase: "result" })).toBeNull();
    expect(checkInfo({ phase: "result", result: { score: "38" } })).toBeNull();
    expect(checkInfo({ phase: "result", result: { score: Number.NaN } })).toBeNull();
    expect(checkInfo({ phase: "result", result: { score: 38.4, checkedAt: "2026-10-03T09:00:00.000Z" } })).toEqual({ score: 38, checkedAt: "2026-10-03T09:00:00.000Z" });
    expect(checkInfo({ phase: "result", result: { score: 120 } })).toEqual({ score: 100, checkedAt: "" });
  });
});

describe("reifegrad-check: Dokument und CRM-Text", () => {
  it("enthält Gesamt, alle fünf Dimensionen, die Schritte, den Rechenweg und die Antworten", () => {
    const r = evaluate({ ...KELLER, branche: "Malerei", groesse: "10-49" }, KELLER_CHECK);
    const doc = toDocument(r);
    const md = toMarkdown(doc);
    expect(doc.title).toBe("Reifegrad-Check");
    expect(doc.filename).toBe("reifegrad-check");
    expect(md).toContain("42 von 100, Stufe «Aufbau»");
    for (const d of DIMENSIONS) expect(md).toContain(`| ${d.name} |`);
    expect(md).toContain("| Auftritt | 53 von 100 (Selbstangabe 67, Check 38) | Routine |");
    expect(md).toContain("38 von 100 vom 03.10.2026, zählt zur Hälfte in «Auftritt»");
    expect(md).toContain("Malerei");
    expect(md).toContain("10 bis 49 Mitarbeitende");
    expect(md).toContain(`1. Steuerung: ${STEPS.steuerung.aufbauen[0]}`);
    expect(md).toContain("(67 + 38) ÷ 2 = 53");
    expect(md).toContain("Richtwerte dieses Werkzeugs");
    expect(md).toContain("Sind deine Marketingziele schriftlich festgehalten?:** Im Kopf oder mündlich besprochen");
  });

  it("sagt ohne Check, dass nur die Selbstangabe zählt, und lässt leere Kontextzeilen weg", () => {
    const md = resultText(evaluate(KELLER));
    expect(md).toContain("nicht einbezogen, kein Ergebnis gespeichert");
    expect(md).toContain("nur die Selbstangabe");
    expect(md).not.toContain("Branche:");
    expect(md).not.toContain("Grösse:");
    expect(md).toContain("| Auftritt | 67 von 100 | Routine |");
  });

  it("resultText beginnt mit Gesamt und Dimensionen, damit das Wichtigste vor der Kürzung auf 1'900 Zeichen steht", () => {
    const md = resultText(evaluate(KELLER, KELLER_CHECK));
    expect(md.indexOf("42 von 100")).toBeLessThan(md.indexOf("Nächste Schritte"));
    expect(md.slice(0, 1900)).toContain("| Steuerung | 22 von 100 | Anfang |");
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
