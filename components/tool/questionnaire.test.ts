import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  MAX_QUESTIONS,
  defaultAnswer,
  isEmptyAnswer,
  parseState,
  planQuestions,
  prefillFromProfile,
  validateAnswer,
  validateQuestions,
  type Question,
} from "@/components/tool/questionnaire";

const opts = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
];
const single: Question = { id: "s", type: "single", label: "S", options: opts, required: true };
const multi: Question = { id: "m", type: "multi", label: "M", options: opts, required: true, max: 2 };
const text: Question = { id: "t", type: "text", label: "T", required: true, maxLength: 5 };
const num: Question = { id: "n", type: "number", label: "N", required: true, min: 0, max: 100 };
const scale: Question = { id: "sc", type: "scale", label: "Sc", min: 1, max: 5, required: true };
const ranking: Question = { id: "r", type: "ranking", label: "R", options: opts };
const matrix: Question = {
  id: "x",
  type: "matrix",
  label: "X",
  required: true,
  rows: [
    { id: "r1", label: "Zeile 1" },
    { id: "r2", label: "Zeile 2" },
  ],
  columns: [
    { value: "ja", label: "Ja" },
    { value: "nein", label: "Nein" },
  ],
};

describe("isEmptyAnswer", () => {
  it("erkennt leere Antworten", () => {
    for (const e of [undefined, null, "", "  ", [], {}, NaN]) expect(isEmptyAnswer(e as never)).toBe(true);
    for (const f of ["x", 0, ["a"], { r1: "ja" }]) expect(isEmptyAnswer(f as never)).toBe(false);
  });
});

describe("validateAnswer", () => {
  it("verlangt bei required eine Antwort, sonst nicht", () => {
    expect(validateAnswer(single, null)).toBe("Bitte wähle eine Antwort.");
    expect(validateAnswer({ ...single, required: false }, null)).toBeNull();
    expect(validateAnswer(multi, [])).toBe("Bitte wähle mindestens eine Antwort.");
    expect(validateAnswer(text, "")).toBe("Bitte gib eine Antwort ein.");
    expect(validateAnswer(num, null)).toBe("Bitte gib eine Zahl ein.");
    expect(validateAnswer(scale, null)).toBe("Bitte wähle einen Wert.");
  });
  it("prüft single und multi gegen die Optionen", () => {
    expect(validateAnswer(single, "a")).toBeNull();
    expect(validateAnswer(single, "zzz")).toMatch(/aus der Liste/);
    expect(validateAnswer(multi, ["a", "b"])).toBeNull();
    expect(validateAnswer(multi, ["a", "b", "c"])).toBe("Bitte wähle höchstens 2 Antworten.");
    expect(validateAnswer(multi, ["a", "x"])).toMatch(/aus der Liste/);
  });
  it("prüft Text, Zahl und Skala", () => {
    expect(validateAnswer(text, "kurz")).toBeNull();
    expect(validateAnswer(text, "viel zu lang")).toMatch(/höchstens 5 Zeichen/);
    expect(validateAnswer(num, 0)).toBeNull();
    expect(validateAnswer(num, 100)).toBeNull();
    expect(validateAnswer(num, -1)).toBe("Bitte gib eine Zahl zwischen 0 und 100 ein.");
    expect(validateAnswer(num, 101)).toBe("Bitte gib eine Zahl zwischen 0 und 100 ein.");
    expect(validateAnswer(num, Infinity)).toBe("Bitte gib eine Zahl ein.");
    expect(validateAnswer({ ...num, max: undefined }, -5)).toBe("Bitte gib eine Zahl ab 0 ein.");
    expect(validateAnswer(scale, 3)).toBeNull();
    expect(validateAnswer(scale, 6)).toMatch(/Skala/);
    expect(validateAnswer(scale, 2.5)).toMatch(/Skala/);
  });
  it("verlangt bei Ranking alle Einträge genau einmal", () => {
    expect(validateAnswer(ranking, ["c", "a", "b"])).toBeNull();
    expect(validateAnswer(ranking, ["a", "b"])).toMatch(/alle Einträge/);
    expect(validateAnswer(ranking, ["a", "a", "b"])).toMatch(/alle Einträge/);
  });
  it("verlangt bei Matrix jede Zeile", () => {
    expect(validateAnswer(matrix, { r1: "ja", r2: "nein" })).toBeNull();
    expect(validateAnswer(matrix, { r1: "ja" })).toBe("Bitte beantworte jede Zeile.");
    expect(validateAnswer(matrix, { r1: "ja", r2: "vielleicht" })).toBe("Bitte beantworte jede Zeile.");
  });
});

describe("defaultAnswer", () => {
  it("beginnt Ranking in der vorgegebenen Reihenfolge, sonst leer", () => {
    expect(defaultAnswer(ranking)).toEqual(["a", "b", "c"]);
    expect(defaultAnswer(single)).toBeNull();
  });
});

describe("planQuestions", () => {
  const qs: Question[] = [
    { id: "branche", type: "text", label: "Branche", required: true },
    { id: "kanton", type: "text", label: "Kanton", required: true },
    { id: "gross", type: "text", label: "Nur für Grosse", showIf: (a) => a.groesse === "250+" },
    { id: "groesse", type: "single", label: "Grösse", options: [{ value: "1-9", label: "klein" }, { value: "250+", label: "gross" }] },
  ];

  it("fragt alle Fragen ohne Profil, ohne die bedingte", () => {
    const p = planQuestions(qs, {});
    expect(p.asked.map((q) => q.id)).toEqual(["branche", "kanton", "groesse"]);
    expect(p.fromProfile).toEqual([]);
  });
  it("fragt nie, was im Profil steht (Harte Regel 10)", () => {
    const p = planQuestions(qs, {}, { branche: "Maler", kanton: "SG" });
    expect(p.asked.map((q) => q.id)).toEqual(["groesse"]);
    expect(p.fromProfile.map((q) => q.id)).toEqual(["branche", "kanton"]);
    expect(p.answers).toMatchObject({ branche: "Maler", kanton: "SG" });
  });
  it("wertet showIf auch mit Profilwerten aus", () => {
    const p = planQuestions(qs, {}, { groesse: "250+" });
    expect(p.asked.map((q) => q.id)).toEqual(["branche", "kanton", "gross"]);
  });
  it("lässt den aktuellen Profilwert gegen eine alte Antwort gewinnen (die Frage wird nicht mehr gestellt)", () => {
    const p = planQuestions(qs, { branche: "Schreiner" }, { branche: "Maler" });
    expect(p.answers.branche).toBe("Maler");
    expect(p.asked.map((q) => q.id)).not.toContain("branche");
  });
  it("behält eine alte Antwort, solange das Profil das Feld nicht kennt", () => {
    const p = planQuestions(qs, { branche: "Schreiner" }, {});
    expect(p.answers.branche).toBe("Schreiner");
    expect(p.asked.map((q) => q.id)).toContain("branche");
  });
  it("behandelt leere Profilwerte als nicht vorhanden", () => {
    const p = planQuestions(qs, {}, { branche: "  ", kanton: [] as unknown as string });
    expect(p.asked.map((q) => q.id)).toContain("branche");
    expect(p.asked.map((q) => q.id)).toContain("kanton");
  });
});

describe("prefillFromProfile", () => {
  it("übernimmt gefüllte Text-, Zahl- und Listenwerte unter der Frage-ID", () => {
    const a = prefillFromProfile({ branche: "Maler", budgetJahr: 5000, marke: { werte: ["x"] } }, { frageBranche: "branche", frageBudget: "budgetJahr" });
    expect(a).toEqual({ frageBranche: "Maler", frageBudget: 5000 });
  });
  it("lässt leere und nicht abbildbare Felder weg", () => {
    const a = prefillFromProfile(
      { branche: "  ", kanton: "SG", zielgruppen: [{ name: "x" }], organisationstyp: undefined },
      { b: "branche", k: "kanton", z: "zielgruppen", o: "organisationstyp", fehlt: "ort" },
    );
    expect(a).toEqual({ k: "SG" });
  });
  it("ergibt bei leerem Profil ein leeres Objekt", () => {
    expect(prefillFromProfile({}, { b: "branche" })).toEqual({});
  });
});

describe("validateQuestions", () => {
  it("lässt einen sauberen Katalog durch", () => {
    expect(validateQuestions([single, multi, text, num, scale, ranking, matrix])).toEqual([]);
  });
  it("lehnt mehr als 10 Fragen ab (Harte Regel 9)", () => {
    const many = Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) => ({ ...text, id: `q${i}` }));
    expect(validateQuestions(many)[0]).toMatch(/höchstens 10/);
    expect(validateQuestions(many.slice(0, MAX_QUESTIONS))).toEqual([]);
  });
  it("findet doppelte IDs, leere Texte, zu wenige oder doppelte Optionen und kaputte Skalen", () => {
    const problems = validateQuestions([
      single,
      { ...single },
      { ...text, id: "leer", label: " " },
      { ...single, id: "eine", options: [opts[0]] },
      { ...single, id: "dopp", options: [opts[0], { ...opts[0] }] },
      { ...scale, id: "sk", min: 5, max: 1 },
      { ...matrix, id: "mx", columns: [matrix.type === "matrix" ? matrix.columns[0] : opts[0]] },
    ]);
    expect(problems.join("\n")).toMatch(/Doppelte Frage-ID «s»/);
    expect(problems.join("\n")).toMatch(/«leer» hat keinen Text/);
    expect(problems.join("\n")).toMatch(/«eine» braucht mindestens zwei/);
    expect(problems.join("\n")).toMatch(/«dopp» hat doppelte Optionswerte/);
    expect(problems.join("\n")).toMatch(/Skala «sk»/);
    expect(problems.join("\n")).toMatch(/Matrix «mx»/);
  });
});

describe("parseState", () => {
  it("gibt bei Müll den Anfangszustand zurück", () => {
    for (const bad of [null, undefined, "x", 3, []]) expect(parseState(bad)).toEqual(EMPTY_STATE);
  });
  it("liest einen gültigen Stand und repariert einzelne kaputte Felder", () => {
    expect(parseState({ phase: "summary", step: 3, answers: { a: "b" } })).toEqual({
      v: 1,
      phase: "summary",
      step: 3,
      answers: { a: "b" },
    });
    expect(parseState({ phase: "böse", step: -1, answers: [] })).toEqual(EMPTY_STATE);
  });
});

import { formatAnswer } from "@/components/tool/questionnaire";

describe("formatAnswer", () => {
  it("macht aus jeder Antwort lesbaren Text", () => {
    expect(formatAnswer(single, "b")).toBe("B");
    expect(formatAnswer(multi, ["a", "c"])).toBe("A, C");
    expect(formatAnswer(text, "Gossau")).toBe("Gossau");
    expect(formatAnswer({ ...num, unit: "CHF" }, 12500)).toBe("12'500 CHF");
    expect(formatAnswer(scale, 4)).toBe("4 von 5");
    expect(formatAnswer(ranking, ["c", "a", "b"])).toBe("1. C, 2. A, 3. B");
    expect(formatAnswer(matrix, { r1: "ja", r2: "nein" })).toBe("Zeile 1: Ja; Zeile 2: Nein");
  });
  it("zeigt «–» bei fehlender Antwort und behält unbekannte Werte sichtbar", () => {
    expect(formatAnswer(single, null)).toBe("–");
    expect(formatAnswer(single, undefined)).toBe("–");
    expect(formatAnswer(single, "alt")).toBe("alt");
    expect(formatAnswer(matrix, { r1: "ja" })).toBe("Zeile 1: Ja; Zeile 2: –");
  });
});
