import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator } from "@/lib/generator";

// Generator des Persona-Generators (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem Server:
// nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Firmenprofil (Betrieb, Branche, Ort) und dem
// Formular; die Route /api/generate prüft Eingabe und Antwort mit denselben Schemas. Spec: specs/persona.md

/** Altersgruppen: Die Zahlen im Text kommen so aus der Eingabe und dürfen im Entwurf stehen (checkPersona). */
export const ALTERSGRUPPE_KEYS = ["unter-30", "30-45", "45-60", "ueber-60", "gemischt"] as const;
export type AltersgruppeKey = (typeof ALTERSGRUPPE_KEYS)[number];
export const ALTERSGRUPPE_LABELS: Record<AltersgruppeKey, string> = {
  "unter-30": "unter 30",
  "30-45": "30 bis 45",
  "45-60": "45 bis 60",
  "ueber-60": "über 60",
  gemischt: "gemischt",
};
export const ALTERSGRUPPEN = ALTERSGRUPPE_KEYS.map((key) => ({ key, label: ALTERSGRUPPE_LABELS[key] }));

export const ROLLE_KEYS = ["privatperson", "kmu-inhaber", "fachperson", "verwaltung", "vereinsvorstand"] as const;
export type RolleKey = (typeof ROLLE_KEYS)[number];
export const ROLLE_LABELS: Record<RolleKey, string> = {
  privatperson: "Privatperson",
  "kmu-inhaber": "Inhaberin oder Inhaber eines KMU",
  fachperson: "Angestellte Fachperson",
  verwaltung: "Verwaltung oder Gemeinde",
  vereinsvorstand: "Vereinsvorstand",
};
export const ROLLEN = ROLLE_KEYS.map((key) => ({ key, label: ROLLE_LABELS[key] }));

export const MAX_ZIELGRUPPE_CHARS = 200;
export const MIN_ANGEBOT_CHARS = 20;
export const MAX_ANGEBOT_CHARS = 600;
export const MAX_FREITEXT_CHARS = 600;

export function altersgruppeLabel(key: AltersgruppeKey): string {
  return ALTERSGRUPPE_LABELS[key] ?? key;
}

export function rolleLabel(key: RolleKey): string {
  return ROLLE_LABELS[key] ?? key;
}

export const personaInput = z.object({
  betrieb: z.string().trim().min(1).max(120),
  branche: z.string().trim().max(120),
  ort: z.string().trim().max(80),
  zielgruppe: z.string().trim().min(1).max(MAX_ZIELGRUPPE_CHARS),
  angebot: z.string().trim().min(MIN_ANGEBOT_CHARS).max(MAX_ANGEBOT_CHARS),
  altersgruppe: z.enum(ALTERSGRUPPE_KEYS),
  rolle: z.enum(ROLLE_KEYS),
  situation: z.string().trim().max(MAX_FREITEXT_CHARS),
  fragen: z.string().trim().max(MAX_FREITEXT_CHARS),
});
export type PersonaInput = z.infer<typeof personaInput>;

const satz = (min: number, max: number) => z.string().min(min).max(max);
const punkte = (min: number, max: number) => z.array(satz(10, 160)).min(min).max(max);
const woerter = (min: number, max: number) => z.array(satz(2, 40)).min(min).max(max);

export const personaOutput = z.object({
  name: satz(3, 40),
  kurz: satz(40, 240),
  alltag: satz(80, 500),
  ziele: punkte(3, 5),
  sorgen: punkte(3, 5),
  informationswege: punkte(3, 5),
  einwaende: punkte(2, 4),
  soSprichstDuSieAn: z.object({
    ton: satz(20, 240),
    woerter: woerter(4, 8),
    vermeiden: woerter(3, 6),
  }),
  zitat: satz(20, 200),
});
export type PersonaOutput = z.infer<typeof personaOutput>;

/** Ziffernfolgen in einem Text, ohne Trennzeichen und ohne Listenmarken («1. Punkt»). Vorbild: tools/ideen-aus-website/generator.ts. */
export function numbersIn(text: string): string[] {
  const withoutListMarks = text.replace(/^\s*\d+[.)]\s+/gm, "");
  return (withoutListMarks.match(/\d+(?:[.,'’  ]\d+)*/g) ?? []).map((n) => n.replace(/[.,'’  ]/g, ""));
}

/** Die Angaben, wie sie an die KI gehen: Altersgruppe und Rolle als Text, nicht als Schlüssel. */
export function promptData(input: PersonaInput) {
  return { ...input, altersgruppe: altersgruppeLabel(input.altersgruppe), rolle: rolleLabel(input.rolle) };
}

/**
 * Prüfung, die nur dieses Werkzeug kennt: keine Ziffer in der Persona, die nicht in den Angaben steht (Betrieb, Branche,
 * Ort, Zielgruppe, Angebot, Situation, Fragen und der Text der Altersgruppe), und der Name ist nicht der Betrieb.
 * Gibt den Grund zurück («name», «zahl») oder null.
 */
export function checkPersona(output: PersonaOutput, input: PersonaInput): string | null {
  if (output.name.trim().toLowerCase() === input.betrieb.trim().toLowerCase()) return "name";
  const known = new Set(
    numbersIn([input.betrieb, input.branche, input.ort, input.zielgruppe, input.angebot, altersgruppeLabel(input.altersgruppe), input.situation, input.fragen].join("\n")),
  );
  for (const n of numbersIn(collectStrings(output).join("\n"))) if (!known.has(n)) return "zahl";
  return null;
}

const INSTRUCTION = `Schreib eine Persona für ein Schweizer KMU: eine erfundene, konkrete Person aus der Zielgruppe, an die der Betrieb seine Texte und Beiträge richtet.
- Die Person ist fiktiv. «name» besteht aus Vorname und Nachname, wie sie in der Schweiz üblich sind, und ist erkennbar erfunden: keine echte oder bekannte Person, nicht der Name des Betriebs, keine Person aus den Angaben.
- «kurz»: ein Satz, wer sie ist, mit ihrer Rolle und der Altersgruppe. Übernimm die Altersgruppe wörtlich aus den Angaben, zum Beispiel «zwischen 30 und 45» oder «über 60». Schreib kein genaues Alter in Ziffern; «Mitte vierzig» als Wort ist erlaubt.
- Ziffern nur, wenn sie wörtlich in den Angaben stehen (die Altersgruppe zählt dazu). Sonst schreib die Zahl als Wort oder lass sie weg. Erfinde keine Preise, Einwohnerzahlen, Jahreszahlen oder Statistiken.
- Konkret und ohne Klischees: Schweizer Alltag und echte Orte in der Region des Betriebs (Gemeinde, Kanton, Pendlerstrecke, Dorfladen, Gemeindeversammlung, Vereinsabend). Keine Werbesprache, keine Verallgemeinerungen über Altersgruppen.
- «alltag»: ein kurzer Absatz, wie ein Tag oder eine Woche dieser Person aussieht und wo das Angebot des Betriebs darin vorkommt.
- «ziele»: drei bis fünf Dinge, die sie mit dem Angebot erreichen will. «sorgen»: drei bis fünf Dinge, die sie zögern lassen oder beschäftigen.
- «informationswege»: drei bis fünf Orte, wo sie sucht und liest, zum Beispiel Google, Empfehlung von Bekannten, Instagram, Gemeindeblatt, Anzeiger, Aushang im Dorfladen. Nimm, was zu Rolle und Altersgruppe passt.
- «einwaende»: zwei bis vier Sätze in ihrer Sprache, die sie dem Betrieb entgegenhält, bevor sie anfragt.
- «soSprichstDuSieAn»: «ton» sagt in ein bis zwei Sätzen, wie der Betrieb mit ihr spricht (Du oder Sie, Tempo, Fachwörter ja oder nein). «woerter»: vier bis acht Wörter oder kurze Wendungen, die bei ihr ankommen. «vermeiden»: drei bis sechs Wörter, die sie abschrecken, zum Beispiel Fachbegriffe, Abkürzungen oder englische Werbewörter aus der Branche; nenne dort keine Wörter aus den Regeln oben.
- «zitat»: ein Satz, den sie so sagen könnte, in ihrer Sprache, ohne Anführungszeichen.
- Nutze die typische Situation und die Fragen aus den Angaben, wenn sie da sind. Fehlen sie, leite sie aus Angebot, Rolle und Altersgruppe ab.
Form: {"name": "…", "kurz": "…", "alltag": "…", "ziele": ["…"], "sorgen": ["…"], "informationswege": ["…"], "einwaende": ["…"], "soSprichstDuSieAn": {"ton": "…", "woerter": ["…"], "vermeiden": ["…"]}, "zitat": "…"}`;

export const personaGenerator = defineGenerator({
  slug: "persona",
  input: personaInput,
  output: personaOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zur Zielgruppe", promptData(i)),
  maxTokens: 1200,
  temperature: 0.6,
  check: checkPersona,
});

export { personaGenerator as generator };
export default personaGenerator;
