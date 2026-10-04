import { z } from "zod";
import { dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";

// Generator des Werkzeugs «SWOT-Analyse» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem
// Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Firmenprofil, den vier Feldern der Person
// und den Fakten aus ihren gespeicherten Checks (logic.ts, faktenAus). Die Route /api/generate prüft Eingabe und
// Antwort mit denselben Schemas.

export const MAX_FELD_CHARS = 600;
export const MAX_ZIEL_CHARS = 200;
export const MAX_FAKTEN = 12;
export const MAX_FAKT_CHARS = 200;

export const AUFWAND_KEYS = ["klein", "mittel", "gross"] as const;
export type AufwandKey = (typeof AUFWAND_KEYS)[number];

export const swotInput = z.object({
  betrieb: z.string().trim().min(1).max(120),
  branche: z.string().trim().max(120),
  ort: z.string().trim().max(80),
  groesse: z.string().trim().max(60),
  positionierung: z.string().trim().max(MAX_FELD_CHARS),
  ziel: z.string().trim().max(MAX_ZIEL_CHARS),
  staerken: z.string().trim().max(MAX_FELD_CHARS),
  schwaechen: z.string().trim().max(MAX_FELD_CHARS),
  chancen: z.string().trim().max(MAX_FELD_CHARS),
  risiken: z.string().trim().max(MAX_FELD_CHARS),
  fakten: z.array(z.string().trim().max(MAX_FAKT_CHARS)).max(MAX_FAKTEN),
});
export type SwotInput = z.infer<typeof swotInput>;

export const punktSchema = z.object({
  punkt: z.string().min(10).max(160),
  warum: z.string().min(10).max(200),
});
export type Punkt = z.infer<typeof punktSchema>;

export const folgerungSchema = z.object({
  massnahme: z.string().min(10).max(160),
  /** Welche Stärke oder Chance die Massnahme nutzt. */
  nutzt: z.string().min(3).max(80),
  /** Welche Schwäche oder welches Risiko sie behebt; leer, wenn keines. */
  behebt: z.string().max(80),
  aufwand: z.enum(AUFWAND_KEYS),
});
export type Folgerung = z.infer<typeof folgerungSchema>;

export const swotOutput = z.object({
  staerken: z.array(punktSchema).min(3).max(6),
  schwaechen: z.array(punktSchema).min(3).max(6),
  chancen: z.array(punktSchema).min(3).max(6),
  risiken: z.array(punktSchema).min(2).max(5),
  folgerungen: z.array(folgerungSchema).min(3).max(5),
  /** Die Lage in einem Satz. */
  einSatz: z.string().min(40).max(240),
});
export type SwotOutput = z.infer<typeof swotOutput>;

export { numbersIn };

/** Alle Texte der Angaben, aus denen Ziffern stammen dürfen. */
export function knownText(input: SwotInput): string {
  return [input.betrieb, input.branche, input.ort, input.groesse, input.positionierung, input.ziel, input.staerken, input.schwaechen, input.chancen, input.risiken, ...input.fakten].join("\n");
}

/** Alle Texte der Antwort, in fester Reihenfolge. */
export function outputTexts(output: SwotOutput): string[] {
  const punkte = [...output.staerken, ...output.schwaechen, ...output.chancen, ...output.risiken].flatMap((p) => [p.punkt, p.warum]);
  const folgerungen = output.folgerungen.flatMap((f) => [f.massnahme, f.nutzt, f.behebt]);
  return [output.einSatz, ...punkte, ...folgerungen];
}

/**
 * Prüfung, die nur dieses Werkzeug kennt: keine Ziffer in der Antwort, die nicht in den Angaben oder Fakten steht
 * (Betrieb, Branche, Ort, Grösse, Positionierung, Ziel, die vier Felder, Fakten). Gibt «zahl» oder null zurück.
 */
export function checkSwot(output: SwotOutput, input: SwotInput): string | null {
  const known = new Set(numbersIn(knownText(input)));
  for (const n of numbersIn(outputTexts(output).join("\n"))) if (!known.has(n)) return "zahl";
  return null;
}

const INSTRUCTION = `Schreib eine SWOT-Analyse fürs Marketing eines Schweizer KMU oder Vereins.
- Grundlage sind die Angaben der Person («staerken», «schwaechen», «chancen», «risiken», «ziel», «positionierung») und die «fakten» aus ihren Checks. Ordne sie den vier Feldern zu, schärfe die Formulierung und ergänze nur, was sich aus Angaben und Fakten ergibt. Erfinde nichts, was nicht in den Angaben oder Fakten steht.
- Stärken und Schwächen liegen im Betrieb: Angebot, Team, Auftritt, Abläufe, Kundschaft, die schon da ist. Chancen und Risiken kommen von aussen: Region, Branche, Nachfrage, Mitbewerber, Regeln, Technik.
- Beziehe Chancen und Risiken auf Ort, Region und Branche. Allgemeine Entwicklungen nur mit Platzhalter in eckigen Klammern, zum Beispiel [Bauprojekt in deiner Gemeinde], [Mitbewerber im Nachbardorf] oder [Anlass in deiner Region].
- Jeder Punkt hat «punkt» (ein konkreter Satz) und «warum» (ein Satz: was das fürs Marketing heisst).
- Fehlt Material für ein Feld, schreib wenige Punkte mit Platzhaltern statt erfundener Fakten. Mindestens drei Stärken, drei Schwächen, drei Chancen und zwei Risiken.
- «folgerungen»: drei bis fünf Massnahmen, konkret und klein beginnend; die erste ist in einer Woche machbar, die letzte darf grösser sein. «nutzt» nennt die Stärke oder Chance, auf der die Massnahme aufbaut. «behebt» nennt die Schwäche oder das Risiko, das sie angeht, sonst bleibt es leer. «aufwand» ist klein, mittel oder gross. Ist ein Ziel angegeben, führen die Massnahmen dorthin.
- «einSatz»: die Lage in einem Satz, ruhig, ohne Urteil und ohne Floskel.
- Ziffern nur, wenn sie wörtlich in den Angaben oder Fakten stehen. Sonst schreib die Zahl als Wort oder lass sie weg.
Form: {"einSatz": "…", "staerken": [{"punkt": "…", "warum": "…"}], "schwaechen": [{"punkt": "…", "warum": "…"}], "chancen": [{"punkt": "…", "warum": "…"}], "risiken": [{"punkt": "…", "warum": "…"}], "folgerungen": [{"massnahme": "…", "nutzt": "…", "behebt": "", "aufwand": "klein"}]}`;

export const swotGenerator = defineGenerator({
  slug: "swot",
  input: swotInput,
  output: swotOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben und Fakten", i),
  maxTokens: 1600,
  temperature: 0.4,
  check: checkSwot,
});

export { swotGenerator as generator };
export default swotGenerator;
