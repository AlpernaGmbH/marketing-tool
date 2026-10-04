import { z } from "zod";
import { dataPrompt, defineGenerator } from "@/lib/generator";

// Generator des Werkzeugs «Ideen aus deiner Website» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und
// auf dem Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus lib/read.ts (Startseite) und dem
// Firmenprofil; die Route /api/generate prüft Eingabe und Antwort mit denselben Schemas.

export const KANAL_KEYS = ["instagram", "linkedin", "google", "newsletter", "website"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];

export const FORMAT_KEYS = ["foto", "reel", "text", "story", "karussell", "kurzvideo"] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

/** Wie READ_MAX_CHARS in lib/read.ts; hier wiederholt, damit der Browser-Teil kein Server-Modul lädt. */
export const MAX_TEXT_CHARS = 8_000;
export const MAX_HEADINGS = 20;
export const MIN_IDEEN = 8;
export const MAX_IDEEN = 12;

export const ideenInput = z.object({
  betrieb: z.string().trim().min(1).max(120),
  branche: z.string().trim().max(120),
  ort: z.string().trim().max(80),
  kanaele: z.array(z.enum(KANAL_KEYS)).min(1).max(KANAL_KEYS.length),
  host: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200),
  description: z.string().trim().max(400),
  headings: z.array(z.string().max(200)).max(MAX_HEADINGS),
  text: z.string().max(MAX_TEXT_CHARS),
});
export type IdeenInput = z.infer<typeof ideenInput>;

export const ideeSchema = z.object({
  titel: z.string().min(5).max(80),
  kanal: z.enum(KANAL_KEYS),
  format: z.enum(FORMAT_KEYS),
  worum: z.string().min(40).max(300),
  hook: z.string().min(10).max(160),
});
export type Idee = z.infer<typeof ideeSchema>;

export const ideenOutput = z.object({
  themen: z.array(z.string().min(5).max(80)).length(3),
  ideen: z.array(ideeSchema).min(MIN_IDEEN).max(MAX_IDEEN),
});
export type IdeenOutput = z.infer<typeof ideenOutput>;

/** Ziffernfolgen in einem Text, ohne Trennzeichen und ohne Listenmarken («1. Punkt»). Vorbild: tools/text-umschreiber/logic.ts. */
export function numbersIn(text: string): string[] {
  const withoutListMarks = text.replace(/^\s*\d+[.)]\s+/gm, "");
  return (withoutListMarks.match(/\d+(?:[.,'’  ]\d+)*/g) ?? []).map((n) => n.replace(/[.,'’  ]/g, ""));
}

/**
 * Prüfung, die nur dieses Werkzeug kennt: keine Ziffer, die nicht in den Angaben steht (Betrieb, Branche, Ort, Host,
 * Titel, Beschreibung, Überschriften, Text der Website), und jede Idee nur für einen gewählten Kanal.
 * Gibt den Grund zurück («zahl», «kanal») oder null.
 */
export function checkIdeen(output: IdeenOutput, input: IdeenInput): string | null {
  const known = new Set(numbersIn([input.betrieb, input.branche, input.ort, input.host, input.title, input.description, ...input.headings, input.text].join("\n")));
  const chosen = new Set<string>(input.kanaele);
  for (const idee of output.ideen) {
    if (!chosen.has(idee.kanal)) return "kanal";
    for (const n of numbersIn([idee.titel, idee.worum, idee.hook].join("\n"))) if (!known.has(n)) return "zahl";
  }
  for (const n of numbersIn(output.themen.join("\n"))) if (!known.has(n)) return "zahl";
  return null;
}

const INSTRUCTION = `Schreib Ideen für Beiträge eines Schweizer KMU aus dem Text seiner Website.
- Nimm nur die Kanäle aus «kanaele». Die Schlüssel bedeuten: instagram (Instagram), linkedin (LinkedIn), google (Beitrag im Google-Unternehmensprofil), newsletter (E-Mail-Newsletter), website (Beitrag oder Blog auf der eigenen Website). Jede Idee hat genau einen dieser Schlüssel als «kanal». Kanäle, die nicht in «kanaele» stehen, kommen nicht vor. Verteile die Ideen auf die gewählten Kanäle.
- Jede Idee geht von einem konkreten Inhalt der Website aus: eine Leistung, ein Angebot, ein Ort, eine Person, ein Projekt, ein Satz. Nenne diesen Inhalt in «worum» und sag, was im Beitrag zu sehen oder zu lesen ist.
- «format» ist eines von: foto (ein Bild mit kurzem Text), reel (kurzes Video für Instagram), text (reiner Text), story (Story mit wenigen Worten), karussell (mehrere Bilder zum Blättern), kurzvideo (Video für andere Kanäle). Wähle das Format passend zum Kanal; für google, newsletter und website nur foto oder text.
- «hook» ist der erste Satz des fertigen Beitrags: direkt, konkret, ohne Frage als Floskel. «titel» ist der Arbeitstitel für den Redaktionsplan.
- Schreib so, dass Kundschaft es versteht: keine Fachwörter aus dem Marketing, keine englischen Wörter, wo ein deutsches reicht.
- Schweizer Bezug: Ort und Region des Betriebs, Jahreszeit, lokale Anlässe. Kennst du den Anlass oder den Namen nicht, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Anlass in deiner Gemeinde] oder [Name der Mitarbeiterin].
- Ziffern nur, wenn sie wörtlich im Text der Website stehen. Sonst schreib die Zahl als Wort oder lass sie weg.
- «themen»: genau drei Themenfelder, die der Text der Website hergibt, je ein kurzer Begriff oder Satzteil.
- Liefere ${MIN_IDEEN} bis ${MAX_IDEEN} Ideen.
Form: {"themen": ["…", "…", "…"], "ideen": [{"titel": "…", "kanal": "instagram", "format": "foto", "worum": "…", "hook": "…"}]}`;

export const ideenGenerator = defineGenerator({
  slug: "ideen-aus-website",
  input: ideenInput,
  output: ideenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben und Text der Website", i),
  maxTokens: 1600,
  temperature: 0.5,
  check: checkIdeen,
});

export { ideenGenerator as generator };
export default ideenGenerator;
