import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";
import { nenntAngabe } from "@/tools/story-post/generator";

// Generator der Anspruchsgruppen-Analyse (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4): Aus Rechtsform, Tätigkeit, Ort, Finanzierung, Vorhaben
// und den Gruppen, die die Person schon kennt, schlägt die KI sechs bis zehn Anspruchsgruppen mit Interesse, Einfluss und Beziehung vor.
// Die Person prüft und ändert alles, bevor die Analyse entsteht (Matrix, Strategie, Plan sind feste Regeln in logic.ts).
// Läuft im Browser und auf dem Server: nur zod, Strings und reine Funktionen.

export const LIMITS = {
  betrieb: 120,
  rechtsform: 60,
  branche: 120,
  ort: 80,
  finanzierung: 6,
  finanzierungWort: 40,
  vorhaben: 200,
  bekannte: 200,
} as const;
export const GRUPPEN = { min: 6, max: 10 } as const;
export const NAME_MAX = 60;
export const TEXT = { min: 10, max: 200 } as const;

export const anspruchsgruppenInput = z.object({
  betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
  typ: z.enum(["kmu", "verein"]),
  rechtsform: z.string().trim().max(LIMITS.rechtsform),
  branche: z.string().trim().max(LIMITS.branche),
  ort: z.string().trim().max(LIMITS.ort),
  finanzierung: z.array(z.string().trim().min(1).max(LIMITS.finanzierungWort)).max(LIMITS.finanzierung),
  vorhaben: z.string().trim().max(LIMITS.vorhaben),
  bekannte: z.string().trim().max(LIMITS.bekannte),
});
export type AnspruchsgruppenInput = z.infer<typeof anspruchsgruppenInput>;

const wert = z.number().int().min(1).max(5);

export const anspruchsgruppenOutput = z.object({
  gruppen: z
    .array(
      z.object({
        name: z.string().trim().min(3).max(NAME_MAX),
        interesse: wert,
        einfluss: wert,
        beziehung: z.enum(["eng", "gut", "lose", "keine"]),
        erwartung: z.string().trim().min(TEXT.min).max(TEXT.max),
        bedarf: z.string().trim().min(TEXT.min).max(TEXT.max),
      }),
    )
    .min(GRUPPEN.min)
    .max(GRUPPEN.max),
});
export type AnspruchsgruppenOutput = z.infer<typeof anspruchsgruppenOutput>;
export type VorgeschlageneGruppe = AnspruchsgruppenOutput["gruppen"][number];

// ---- Prüfung -----------------------------------------------------------------------------------

const norm = (s: string): string => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/** Die bekannten Gruppen der Person als einzelne Angaben (getrennt an Komma, Strichpunkt und Zeilenumbruch). */
export function bekannteListe(bekannte: string): string[] {
  return bekannte
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Interesse und Einfluss ab 4 gelten als hoch (wie in logic.ts, SCHWELLE). */
const hoch = (n: number): boolean => n >= 4;

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «namedoppelt» (zwei Gruppen heissen gleich), «zahl» (eine Ziffernfolge, die nicht in den Angaben steht), «bekannt» (eine Gruppe, die die Person
 * genannt hat, fehlt), «streuung» (alle Gruppen liegen im selben Quadranten: Die Matrix wäre sinnlos).
 */
export function checkAnspruchsgruppen(output: AnspruchsgruppenOutput, input: AnspruchsgruppenInput): string | null {
  const namen = new Set<string>();
  for (const g of output.gruppen) {
    const k = norm(g.name);
    if (namen.has(k)) return "namedoppelt";
    namen.add(k);
  }

  const angaben = [input.betrieb, input.rechtsform, input.branche, input.ort, ...input.finanzierung, input.vorhaben, input.bekannte].join("\n");
  const known = new Set(numbersIn(angaben));
  for (const n of numbersIn(collectStrings(output).join("\n"))) if (!known.has(n)) return "zahl";

  const alleNamen = output.gruppen.map((g) => g.name).join("\n");
  for (const b of bekannteListe(input.bekannte)) if (!nenntAngabe(alleNamen, b)) return "bekannt";

  const quadranten = new Set(output.gruppen.map((g) => `${hoch(g.interesse)}-${hoch(g.einfluss)}`));
  if (quadranten.size < 2) return "streuung";
  return null;
}

// ---- Aufgabe -----------------------------------------------------------------------------------

const INSTRUCTION = `Du schlägst Anspruchsgruppen für einen Schweizer Betrieb oder Verein vor. Anspruchsgruppen sind Gruppen von Menschen oder Stellen, die Erwartungen an ihn haben oder seinen Erfolg beeinflussen. Die Person prüft und ändert alles danach selbst.
- «typ» ist «kmu» (Betrieb) oder «verein». Nutze «rechtsform», «branche», «ort», «finanzierung» (woher das Geld kommt), «vorhaben» (was in den nächsten zwölf Monaten ansteht) und «bekannte» (Gruppen, die die Person selbst genannt hat; sie müssen alle vorkommen).
- Antworte mit sechs bis zehn Gruppen. Eine Gruppe ist eine Gruppe, keine Einzelperson und keine Firma mit Namen: «Vorstand», «Sponsoren», «Gemeinde und Behörden», «Stammkundschaft», nicht «Hans Keller». Jeder Name ist verschieden und hat höchstens 60 Zeichen.
- «interesse» und «einfluss» sind ganze Zahlen von 1 bis 5: Interesse = wie stark sich die Gruppe mit dem Betrieb oder Verein beschäftigt, Einfluss = wie stark sie seinen Erfolg beeinflussen kann. Nutze die ganze Skala, die Gruppen liegen nicht alle gleich.
- «beziehung» ist «eng», «gut», «lose» oder «keine»: So schätzt du die heutige Beziehung aus den Angaben ein. Fehlt jede Grundlage, wähle «lose».
- «erwartung» ist ein Satz (10 bis 200 Zeichen), was die Gruppe vom Betrieb oder Verein erwartet. «bedarf» ist ein Satz (10 bis 200 Zeichen), was der Betrieb oder Verein von der Gruppe braucht.
- Erfinde nichts: keine Namen von Personen, Firmen oder Vereinen, keine Zahlen, die nicht in den Angaben stehen. Du darfst Gruppen nennen, die zur Rechtsform, zur Branche und zum Ort passen.
- Keine Floskeln, keine Ausrufezeichen, keine Emojis.
Form: {"gruppen": [{"name": "…", "interesse": 3, "einfluss": 4, "beziehung": "gut", "erwartung": "…", "bedarf": "…"}]}`;

export const anspruchsgruppenGenerator = defineGenerator({
  slug: "anspruchsgruppen",
  input: anspruchsgruppenInput,
  output: anspruchsgruppenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Betrieb oder Verein", i),
  maxTokens: 2200,
  temperature: 0.4,
  check: checkAnspruchsgruppen,
});

export { anspruchsgruppenGenerator as generator };
export default anspruchsgruppenGenerator;
