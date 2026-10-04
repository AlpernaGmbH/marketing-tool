import { numberCH } from "@/lib/ch";
import type { Profile, ProfileKey } from "@/lib/profile";

// Reine Logik der QuestionnaireEngine: Fragetypen, Sichtbarkeit, Prüfung, Zwischenstand.
// Kein React, kein DOM, damit alles in Vitest ohne Browser testbar ist.

export type Option = { value: string; label: string; hint?: string };

export type AnswerValue = string | string[] | number | Record<string, string> | null;
export type Answers = Record<string, AnswerValue>;

type Base = {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
  /** Frage nur stellen, wenn die Funktion wahr liefert. Sieht alle bisherigen Antworten. */
  showIf?: (answers: Answers) => boolean;
};

export type Question =
  | (Base & { type: "single"; options: Option[] })
  | (Base & { type: "multi"; options: Option[]; max?: number })
  | (Base & { type: "text"; placeholder?: string; multiline?: boolean; maxLength?: number })
  | (Base & { type: "number"; min?: number; max?: number; step?: number; unit?: string })
  | (Base & { type: "scale"; min: number; max: number; minLabel?: string; maxLabel?: string })
  | (Base & { type: "ranking"; options: Option[] })
  | (Base & { type: "matrix"; rows: { id: string; label: string }[]; columns: Option[] });

/** Harte Regel 9: höchstens 10 Fragen pro Fragebogen-Tool. */
export const MAX_QUESTIONS = 10;

export function isEmptyAnswer(a: AnswerValue | undefined): boolean {
  if (a === undefined || a === null) return true;
  if (typeof a === "string") return a.trim() === "";
  if (typeof a === "number") return Number.isNaN(a);
  if (Array.isArray(a)) return a.length === 0;
  return Object.keys(a).length === 0;
}

/**
 * Prüft die Antwort auf eine Frage. Gibt eine Meldung in der Du-Form zurück oder null.
 * Leere Antworten sind nur bei `required` ein Fehler.
 */
export function validateAnswer(q: Question, a: AnswerValue | undefined): string | null {
  if (isEmptyAnswer(a)) {
    if (!q.required) return null;
    switch (q.type) {
      case "multi":
        return "Bitte wähle mindestens eine Antwort.";
      case "text":
        return "Bitte gib eine Antwort ein.";
      case "number":
        return "Bitte gib eine Zahl ein.";
      case "scale":
        return "Bitte wähle einen Wert.";
      default:
        return "Bitte wähle eine Antwort.";
    }
  }
  switch (q.type) {
    case "single":
      return q.options.some((o) => o.value === a) ? null : "Bitte wähle eine Antwort aus der Liste.";
    case "multi": {
      if (!Array.isArray(a)) return "Bitte wähle mindestens eine Antwort.";
      if (!a.every((v) => q.options.some((o) => o.value === v))) return "Bitte wähle Antworten aus der Liste.";
      if (q.max !== undefined && a.length > q.max) return `Bitte wähle höchstens ${q.max} Antworten.`;
      return null;
    }
    case "text": {
      if (typeof a !== "string") return "Bitte gib eine Antwort ein.";
      if (q.maxLength !== undefined && a.length > q.maxLength) return `Bitte kürze deine Antwort auf höchstens ${q.maxLength} Zeichen.`;
      return null;
    }
    case "number": {
      if (typeof a !== "number" || !Number.isFinite(a)) return "Bitte gib eine Zahl ein.";
      if (q.min !== undefined && q.max !== undefined && (a < q.min || a > q.max)) {
        return `Bitte gib eine Zahl zwischen ${q.min} und ${q.max} ein.`;
      }
      if (q.min !== undefined && a < q.min) return `Bitte gib eine Zahl ab ${q.min} ein.`;
      if (q.max !== undefined && a > q.max) return `Bitte gib eine Zahl bis ${q.max} ein.`;
      return null;
    }
    case "scale": {
      const n = typeof a === "string" ? Number(a) : a;
      if (typeof n !== "number" || !Number.isInteger(n) || n < q.min || n > q.max) return "Bitte wähle einen Wert auf der Skala.";
      return null;
    }
    case "ranking": {
      if (!Array.isArray(a)) return "Bitte bring die Einträge in eine Reihenfolge.";
      const values = q.options.map((o) => o.value).sort();
      return JSON.stringify([...a].sort()) === JSON.stringify(values) ? null : "Bitte bring alle Einträge in eine Reihenfolge.";
    }
    case "matrix": {
      if (typeof a !== "object" || Array.isArray(a)) return "Bitte beantworte jede Zeile.";
      const ok = q.rows.every((r) => q.columns.some((c) => c.value === (a as Record<string, string>)[r.id]));
      return ok ? null : "Bitte beantworte jede Zeile.";
    }
  }
}

/** Startwert einer Frage. Ranking beginnt in der vorgegebenen Reihenfolge. */
export function defaultAnswer(q: Question): AnswerValue {
  return q.type === "ranking" ? q.options.map((o) => o.value) : null;
}

export type Plan = {
  /** Wird dem Besucher gestellt, in Reihenfolge. */
  asked: Question[];
  /** Aus dem Firmenprofil vorbefüllt und deshalb nicht erneut gefragt (Harte Regel 10). */
  fromProfile: Question[];
  /** Alle Antworten. Für Fragen aus dem Profil gilt der aktuelle Profilwert: Die Frage wird nicht mehr gestellt, also kann eine alte Antwort sie nicht übersteuern. */
  answers: Answers;
};

/** Welche Fragen sind sichtbar, welche stammen aus dem Profil? */
export function planQuestions(questions: Question[], given: Answers, prefill: Answers = {}): Plan {
  const answers: Answers = { ...prefill, ...given };
  const asked: Question[] = [];
  const fromProfile: Question[] = [];
  for (const q of questions) {
    if (q.showIf && !q.showIf(answers)) continue;
    const prefilled = !isEmptyAnswer(prefill[q.id]);
    if (prefilled) {
      fromProfile.push(q);
      answers[q.id] = prefill[q.id];
    } else {
      asked.push(q);
    }
  }
  return { asked, fromProfile, answers };
}

/**
 * Baut `prefill` für die Engine aus dem Firmenprofil. `map` ordnet Frage-IDs Profilfeldern zu,
 * z. B. { branche: "branche", kanton: "kanton" }. Nur gefüllte Text-, Zahl- und Listenwerte
 * werden übernommen; so wird nichts gefragt, was das Profil schon weiss (Harte Regel 10).
 */
export function prefillFromProfile(profile: Profile, map: Record<string, ProfileKey>): Answers {
  const out: Answers = {};
  for (const [questionId, key] of Object.entries(map)) {
    const v = profile[key];
    if (typeof v === "string" && v.trim() !== "") out[questionId] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[questionId] = v;
    else if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) out[questionId] = [...(v as unknown[])] as string[];
  }
  return out;
}

/** Prüfung für Entwicklung und Tests: gibt Fehler im Fragenkatalog zurück. */
export function validateQuestions(questions: Question[]): string[] {
  const problems: string[] = [];
  if (questions.length > MAX_QUESTIONS) problems.push(`${questions.length} Fragen, erlaubt sind höchstens ${MAX_QUESTIONS}`);
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) problems.push(`Doppelte Frage-ID «${q.id}»`);
    seen.add(q.id);
    if (!q.label.trim()) problems.push(`Frage «${q.id}» hat keinen Text`);
    if ((q.type === "single" || q.type === "multi" || q.type === "ranking") && q.options.length < 2) {
      problems.push(`Frage «${q.id}» braucht mindestens zwei Optionen`);
    }
    if ((q.type === "single" || q.type === "multi" || q.type === "ranking") && new Set(q.options.map((o) => o.value)).size !== q.options.length) {
      problems.push(`Frage «${q.id}» hat doppelte Optionswerte`);
    }
    if (q.type === "scale" && !(q.min < q.max && q.max - q.min <= 10)) problems.push(`Skala «${q.id}»: min < max und höchstens 11 Stufen`);
    if (q.type === "matrix" && (q.rows.length < 1 || q.columns.length < 2)) problems.push(`Matrix «${q.id}» braucht Zeilen und mindestens zwei Spalten`);
  }
  return problems;
}

// ---- Zwischenstand (localStorage mt:<slug>) --------------------------------------------------

export type Phase = "intro" | "questions" | "summary" | "result";

export type SavedState = {
  v: 1;
  phase: Phase;
  step: number;
  answers: Answers;
  /** Ergebnis wurde schon über /api/access/complete gezählt (Reload zählt nicht erneut). */
};

export const EMPTY_STATE: SavedState = { v: 1, phase: "intro", step: 0, answers: {} };

const PHASES: Phase[] = ["intro", "questions", "summary", "result"];

export function parseState(raw: unknown): SavedState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<SavedState>;
  const phase = PHASES.includes(r.phase as Phase) ? (r.phase as Phase) : "intro";
  const answers = typeof r.answers === "object" && r.answers !== null && !Array.isArray(r.answers) ? (r.answers as Answers) : {};
  const step = typeof r.step === "number" && Number.isInteger(r.step) && r.step >= 0 ? r.step : 0;
  return { v: 1, phase, step, answers };
}

// ---- Anzeige -----------------------------------------------------------------------------------


const label = (options: Option[], value: string) => options.find((o) => o.value === value)?.label ?? value;

/** Antwort als lesbarer Text für die Zusammenfassung und für Exporte. */
export function formatAnswer(q: Question, a: AnswerValue | undefined): string {
  if (isEmptyAnswer(a)) return "–";
  switch (q.type) {
    case "single":
      return label(q.options, String(a));
    case "multi":
      return (a as string[]).map((v) => label(q.options, v)).join(", ");
    case "text":
      return String(a);
    case "number":
      return `${numberCH(a as number, 2)}${q.unit ? ` ${q.unit}` : ""}`;
    case "scale":
      return `${a} von ${q.max}`;
    case "ranking":
      return (a as string[]).map((v, i) => `${i + 1}. ${label(q.options, v)}`).join(", ");
    case "matrix": {
      const m = a as Record<string, string>;
      return q.rows.map((r) => `${r.label}: ${m[r.id] ? label(q.columns, m[r.id]) : "–"}`).join("; ");
    }
  }
}
