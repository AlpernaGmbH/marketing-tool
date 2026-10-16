import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn, withoutKeys } from "@/lib/generator";

// Generator des Positionierungs-Checks (Klasse A/B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem
// Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus lib/read.ts (Startseite), dem Firmenprofil,
// den Funden des Checks (logic.ts) und zwei freiwilligen Feldern; die Route /api/generate prüft Eingabe und Antwort
// mit denselben Schemas.

/** Weniger als READ_MAX_CHARS in lib/read.ts: Für die Positionierung reicht der Anfang der Startseite. */
export const MAX_TEXT_CHARS = 6_000;
export const MAX_HEADINGS = 20;
export const MAX_FUNDE = 12;
export const MAX_FREITEXT = 600;

export const STIL_KEYS = ["kurz", "konkret", "persoenlich"] as const;
export type StilKey = (typeof STIL_KEYS)[number];

export const STIL_LABELS: Record<StilKey, string> = {
  kurz: "Kurz",
  konkret: "Konkret",
  persoenlich: "Persönlich",
};

export const positionierungInput = z.object({
  betrieb: z.string().trim().min(1).max(120),
  branche: z.string().trim().max(120),
  ort: z.string().trim().max(80),
  kanton: z.string().trim().max(40),
  host: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200),
  headings: z.array(z.string().max(200)).max(MAX_HEADINGS),
  text: z.string().max(MAX_TEXT_CHARS),
  /** Die Funde des Checks als kurze Sätze, damit der Entwurf die Lücken schliesst. */
  funde: z.array(z.string().max(160)).max(MAX_FUNDE),
  /** Freiwillig: «Was dich wirklich unterscheidet». */
  unterscheidung: z.string().trim().max(MAX_FREITEXT),
  /** Freiwillig: «Beweise, die du hast». */
  beweise: z.string().trim().max(MAX_FREITEXT),
});
export type PositionierungInput = z.infer<typeof positionierungInput>;

export const varianteSchema = z.object({
  stil: z.enum(STIL_KEYS),
  satz: z.string().min(20).max(220),
});
export type Variante = z.infer<typeof varianteSchema>;

export const positionierungOutput = z.object({
  /** Ein Satz: für wen, was, was anders. */
  kernsatz: z.string().min(30).max(200),
  fuerWen: z.string().min(20).max(240),
  wasAnders: z.string().min(40).max(400),
  /** Nur aus den Angaben; sonst Platzhalter in eckigen Klammern. */
  beweise: z.array(z.string().min(10).max(200)).min(2).max(5),
  varianten: z.array(varianteSchema).length(3),
  /** Wörter oder Sätze der Website, die nichts sagen, wörtlich oder als Muster. */
  streichen: z.array(z.string().min(2).max(200)).min(2).max(6),
  /** Was die Person auf der Startseite zuerst ändert. */
  naechsterSchritt: z.string().min(30).max(300),
});
export type PositionierungOutput = z.infer<typeof positionierungOutput>;

export { numbersIn };

/** Unter diesem Schlüssel zitiert die KI Stellen der Website, die nichts sagen («ganzheitlich», «Wir freuen uns auf Ihre Anfrage»). */
export const NEGATIVE_KEYS = ["streichen"] as const;

/**
 * Alle Texte, aus denen Ziffern stammen dürfen: die Angaben, der Website-Text und die beiden freiwilligen Felder. Die Funde
 * des Checks zählen nicht: Ihre Zahlen sind Punkte und Gewichte («0 von 20», «5 von 10»), keine Angaben des Betriebs, und
 * machten sonst «20 Jahre Erfahrung» oder «10 Mitarbeitende» zu erlaubten Zahlen.
 */
function knownNumbers(input: PositionierungInput): Set<string> {
  return new Set(numbersIn([input.betrieb, input.branche, input.ort, input.kanton, input.host, input.title, ...input.headings, input.text, input.unterscheidung, input.beweise].join("\n")));
}

/**
 * Bringt die rohe Antwort in Form, bevor das Schema sie prüft: Das Modell schreibt den Stil gern mit Umlaut oder gross
 * («persönlich», «Persönlich»); erlaubt ist «persoenlich» (STIL_KEYS).
 */
export function normalizePositionierung(value: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(value.varianten)) return value;
  const stil = (raw: string): string => {
    const key = raw.normalize("NFC").trim().toLowerCase().replace(/ö/g, "oe");
    return (STIL_KEYS as readonly string[]).includes(key) ? key : raw;
  };
  return {
    ...value,
    varianten: value.varianten.map((v) => (typeof v === "object" && v !== null && typeof (v as { stil?: unknown }).stil === "string" ? { ...v, stil: stil((v as { stil: string }).stil) } : v)),
  };
}

/** Superlative, mit denen der Betrieb von sich spricht («der beste und günstigste Malerbetrieb»). Steht die Wendung in den Angaben, ist sie erlaubt. */
const SUPERLATIV_RE = /\b(?:der|die|das|den|dem)\s+(?:beste|günstigste|billigste|schnellste|erfahrenste|beliebteste)[nrms]?\b/giu;
/** Personen mit Titel oder Rolle («Familie Meier», «Gründerin Frieda»): Der Name muss in den Angaben stehen, sonst ist er erfunden. */
const PERSON_RE = /\b(?:Familie|Herr|Herrn|Frau|Gründer|Gründerin|Inhaber|Inhaberin|Geschäftsführer|Geschäftsführerin)\s+(\p{Lu}[\p{Ll}-]+)/gu;

/**
 * Prüfung, die nur dieses Werkzeug kennt: genau drei Varianten mit drei verschiedenen Stilen («varianten»), keine Ziffer
 * und kein Zahlwort ab «zwanzig», das nicht in den Angaben steht («zahl»), kein Superlativ über den Betrieb («wertung») und
 * kein Name einer Person mit Titel, der nicht in den Angaben steht («erfunden», zum Beispiel «Familie Meier» als Referenz).
 * Die Liste «streichen» zitiert die Website; sie zählt für Superlative und Namen nicht, für Zahlen schon (ein Zitat trägt
 * nur Zahlen, die auf der Website stehen). Gibt den Grund oder null zurück.
 */
export function checkPositionierungOutput(output: PositionierungOutput, input: PositionierungInput): string | null {
  const stile = new Set(output.varianten.map((v) => v.stil));
  if (stile.size !== STIL_KEYS.length) return "varianten";
  const known = knownNumbers(input);
  const texts = [output.kernsatz, output.fuerWen, output.wasAnders, ...output.beweise, ...output.varianten.map((v) => v.satz), ...output.streichen, output.naechsterSchritt];
  for (const n of numbersIn(texts.join("\n"))) if (!known.has(n)) return "zahl";
  const eigene = collectStrings(withoutKeys(output, NEGATIVE_KEYS)).join("\n");
  const allowed = collectStrings(withoutKeys(input, ["funde"])).join("\n").toLowerCase();
  for (const m of eigene.matchAll(SUPERLATIV_RE)) if (!allowed.includes(m[0].toLowerCase())) return "wertung";
  for (const m of eigene.matchAll(PERSON_RE)) if (!allowed.includes(m[1].toLowerCase())) return "erfunden";
  return null;
}

const INSTRUCTION = `Schreib die Positionierung eines Schweizer KMU aus dem Text seiner Website und den Angaben dazu.
- Positionierung heisst: Für wen ist der Betrieb da, was macht er, und was macht er anders als andere in der Region. Konkret, belegbar, aus Sicht der Kundschaft. Keine Superlative, keine Eigenschaftswörter ohne Beleg (nicht «kompetent», «zuverlässig», «hochwertig»).
- Nimm, was der Website-Text, die Überschriften, «unterscheidung» und «beweise» hergeben. «funde» sind die Lücken, die der Check gefunden hat; der Entwurf schliesst sie.
- Nenne Ort und Region des Betriebs («ort», «kanton»), wo es passt. Fehlt der Ort, schreib [Ort].
- «kernsatz»: ein Satz, der sagt, für wen, was und was anders. Du-Form oder neutral, nie «wir sind».
- «fuerWen»: die Kundschaft, so genau wie die Angaben es erlauben (Art, Lage, Situation), ein bis zwei Sätze.
- «wasAnders»: der Unterschied zu anderen Betrieben der Branche, zwei bis drei Sätze. Fehlt ein echter Unterschied in den Angaben, schreib, welcher aus dem Text naheliegt, und kennzeichne ihn als [zu prüfen].
- «beweise»: zwei bis fünf Belege, nur aus den Angaben (Jahre, Zahlen, Referenzen, Ausbildungen, Mitgliedschaften). Fehlen Belege, schreib Platzhalter in eckigen Klammern, zum Beispiel [Anzahl Projekte pro Jahr] oder [Name einer Referenz].
- «varianten»: genau drei Fassungen des Kernsatzes mit den Stilen «kurz» (höchstens zwölf Wörter), «konkret» (mit Ort und einem Beleg) und «persoenlich» (in der Ich- oder Wir-Form der Inhaberin oder des Inhabers). Jeder Stil genau einmal.
- «streichen»: zwei bis sechs Stellen der Website, die nichts sagen (Allgemeinplätze, Eigenschaftswörter ohne Beleg, Sätze über «uns» statt über die Kundschaft). Zitiere kurz und wörtlich, wie es auf der Website steht, oder beschreib das Muster («Eigenschaftswörter ohne Beleg wie kompetent und zuverlässig»). Ein wörtliches Zitat darf Wörter und Zeichen enthalten, die du selbst nicht verwenden darfst («ganzheitlich», «Jetzt anfragen!»); in einem beschriebenen Muster nicht.
- «naechsterSchritt»: was die Person auf der Startseite zuerst ändert, ein bis drei Sätze, konkret (welche Stelle, welcher Satz).
- Zahlen nur, wenn sie wörtlich in den Angaben oder im Text der Website stehen; auch Zahlwörter wie «zwanzig», «hundert» oder «tausend» zählen dazu. Die Zahlen in «funde» («0 von 20») sind Punkte des Checks, keine Angaben des Betriebs. Fehlt eine Zahl, lass sie weg oder setz einen Platzhalter in eckigen Klammern.
- Keine Namen von Personen oder Referenzen, die nicht in den Angaben stehen; setz [Name einer Referenz].
- Keine Superlative über den Betrieb («der beste», «der günstigste»), ausser sie stehen wörtlich in den Angaben.
Form: {"kernsatz": "…", "fuerWen": "…", "wasAnders": "…", "beweise": ["…", "…"], "varianten": [{"stil": "kurz", "satz": "…"}, {"stil": "konkret", "satz": "…"}, {"stil": "persoenlich", "satz": "…"}], "streichen": ["…", "…"], "naechsterSchritt": "…"}`;

export const positionierungGenerator = defineGenerator({
  slug: "positionierung",
  input: positionierungInput,
  output: positionierungOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben, Website-Text und Funde des Checks", i),
  // Eine Antwort an der Obergrenze des Schemas hat rund 1'200 bis 1'400 Token, eine typische 410 bis 480: 1'400 trägt sie ganz.
  maxTokens: 1400,
  temperature: 0.4,
  normalize: normalizePositionierung,
  // Zitate der Website unter «streichen» sind Beispiele für Floskeln und dürfen Wörter der Sperrliste enthalten.
  negativeKeys: NEGATIVE_KEYS,
  purposeRules: false,
  check: checkPositionierungOutput,
});

export { positionierungGenerator as generator };
export default positionierungGenerator;
