import { z } from "zod";
import { dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";

// Generator des Werkzeugs «Ideen aus deiner Website» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und
// auf dem Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus lib/read.ts (Startseite) und dem
// Firmenprofil; die Route /api/generate prüft Eingabe und Antwort mit denselben Schemas.

export const KANAL_KEYS = ["instagram", "linkedin", "google", "newsletter", "website"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];

export const FORMAT_KEYS = ["foto", "reel", "text", "story", "karussell", "kurzvideo"] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

/** Wie READ_MAX_CHARS in lib/read.ts; hier wiederholt, damit der Browser-Teil kein Server-Modul lädt. */
export const MAX_TEXT_CHARS = 8_000;
/**
 * Wie MIN_READ_CHARS in lib/read.ts: Weniger lesbarer Text ist keine Grundlage für Ideen (die Seite lädt ihren Inhalt erst per
 * JavaScript oder versteckt ihn hinter einer Cookie-Wand); die KI würde aus Titel und Beschreibung Scheinwerte schreiben.
 * Der Browser prüft strenger (isThinPage in logic.ts: 300 Zeichen) und fragt die KI dann gar nicht erst.
 */
export const MIN_TEXT_CHARS = 150;
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
  text: z.string().trim().min(MIN_TEXT_CHARS).max(MAX_TEXT_CHARS),
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

export { numbersIn };

// ---- Quelle: Jede Idee geht von der Website aus ---------------------------------------------------------

const fold = (s: string): string => s.toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/\p{M}/gu, "");
/** Wörter mit mindestens vier Buchstaben, klein und ohne Akzente; Ziffern und Satzzeichen trennen. */
const tokens = (s: string): string[] => fold(s).split(/[^\p{L}]+/u).filter((w) => w.length >= 4);
/** Wortanfang für den Vergleich: fünf Buchstaben («Fassade» und «Fassaden»), kürzere Wörter ganz. */
const stem = (w: string): string => (w.length >= 5 ? w.slice(0, 5) : w);

/**
 * Wörter ohne Aussage über die Quelle: Funktionswörter und das, was jede Idee sagt (Kanal, Format, «Beitrag», «Bild», «zeigen»).
 * Sie zählen nicht als Treffer in der Website, auch wenn die Seite sie zufällig enthält.
 */
const LEER = new Set([
  // Funktionswörter und Allerweltswörter (vier Buchstaben ganz, längere als Wortanfang aus fünf)
  "oder", "auch", "noch", "dazu", "dass", "mehr", "eine", "kein", "sehr", "wenn", "dann", "denn", "aber", "sind", "wird", "dies", "jede", "alle", "hier", "gibt", "kann", "soll", "zeit", "jahr",
  "einem", "einen", "einer", "eines", "diese", "unser", "ihnen", "ihre", "damit", "dafur", "dabei", "haben", "werde", "wurde", "viele", "welch", "gross", "heute", "erste", "jahre",
  // was jede Idee über Kanal, Format und Beitrag sagt
  "wort", "satz", "satze", "idee", "ideen", "text", "texte", "foto", "fotos", "bild", "bilde", "reel", "reels", "video", "story", "stori", "karus", "kurze", "kurzv", "beitr", "hinwe", "zeige", "zeigt", "stell",
  "insta", "linke", "googl", "newsl", "websi", "webse", "start", "seite", "kunde", "kundi", "kunds",
]);

/** Wörter, die in deutscher Prosa oft und in Französisch, Italienisch und Englisch nie vorkommen (ohne Akzente). */
const DEUTSCH = new Set([
  "und", "der", "die", "das", "ist", "wir", "fur", "mit", "von", "auf", "bei", "nicht", "eine", "sind", "zum", "zur", "dem", "den", "auch", "oder", "unser", "unsere", "ihre", "haben", "werden",
  "nach", "uber", "ein", "einen", "einem", "einer", "sie", "wird", "kann", "gibt", "mehr", "wenn", "alle", "aus", "als", "wie", "nur", "noch", "dann", "dass", "hier", "bitte", "ihr", "ihnen",
]);

/**
 * Ist der Text deutsch? Deutsche Prosa besteht zu mindestens einem Zehntel aus solchen Wörtern. Die Prüfung der Quelle gilt nur dort: Eine
 * französische oder englische Seite, aus der die KI deutsche Ideen schreibt, teilt keine Wörter mit ihnen, und das ist kein Fehler.
 */
export function istDeutsch(text: string): boolean {
  const words = fold(text).split(/[^\p{L}]+/u).filter(Boolean);
  const deutsch = words.filter((w) => DEUTSCH.has(w)).length;
  return words.length >= 15 && deutsch >= 3 && deutsch / words.length >= 0.1;
}

type Quelle = { keys: Set<string>; vier: Set<string>; vorne: Set<string> };

/** Die Wörter der Website (Titel, Beschreibung, Überschriften, Text) als Wortanfänge, für den Vergleich mit den Ideen. */
function quelleOf(input: IdeenInput): Quelle {
  const q: Quelle = { keys: new Set(), vier: new Set(), vorne: new Set() };
  for (const w of tokens([input.title, input.description, ...input.headings, input.text].join("\n"))) {
    q.keys.add(stem(w));
    if (w.length === 4) q.vier.add(w);
    else q.vorne.add(w.slice(0, 4));
  }
  return q;
}

const inQuelle = (w: string, q: Quelle): boolean => q.keys.has(stem(w)) || (w.length === 4 ? q.vorne.has(w) : q.vier.has(w.slice(0, 4)));

/** Wie viele verschiedene Wörter des Textes auf der Website stehen. Der eigene Name, die Branche und der Ort des Betriebs zählen nicht. */
function treffer(text: string, q: Quelle, eigene: Set<string>): number {
  const found = new Set<string>();
  for (const w of tokens(text)) {
    const k = stem(w);
    if (LEER.has(k) || LEER.has(w) || eigene.has(k)) continue;
    if (inQuelle(w, q)) found.add(k);
  }
  return found.size;
}

/**
 * Wie viele Themen und Ideen von der Website ausgehen. Ein Thema braucht ein Wort der Seite, eine Idee zwei verschiedene in Titel,
 * Inhalt und erstem Satz. Treffer, die nur der Name, die Branche oder der Ort des Betriebs sind, und Wörter wie «Beitrag» oder «Bild» zählen nicht.
 */
export function quelleBewertung(output: IdeenOutput, input: IdeenInput): { themen: number; ideen: number } {
  const q = quelleOf(input);
  const eigene = new Set(tokens([input.betrieb, input.branche, input.ort].join(" ")).map(stem));
  return {
    themen: output.themen.filter((t) => treffer(t, q, eigene) >= 1).length,
    ideen: output.ideen.filter((i) => treffer(`${i.titel} ${i.worum} ${i.hook}`, q, eigene) >= 2).length,
  };
}

/**
 * Prüfung, die nur dieses Werkzeug kennt: keine Ziffer, die nicht in den Angaben steht (Betrieb, Branche, Ort, Host,
 * Titel, Beschreibung, Überschriften, Text der Website), jede Idee nur für einen gewählten Kanal, und die Ideen gehen von der
 * Website aus: mindestens zwei von drei Themen und mindestens die Hälfte der Ideen tragen Wörter, die auf der Seite stehen
 * (quelleBewertung). Ideen über Leistungen, die dort nicht vorkommen («Hundesalon»), und Allerweltsideen («Teamausflug») fallen auf.
 * Das gilt nur für deutsche Seiten (istDeutsch). Gibt den Grund zurück («zahl», «kanal», «erfunden») oder null.
 */
export function checkIdeen(output: IdeenOutput, input: IdeenInput): string | null {
  const known = new Set(numbersIn([input.betrieb, input.branche, input.ort, input.host, input.title, input.description, ...input.headings, input.text].join("\n")));
  const chosen = new Set<string>(input.kanaele);
  for (const idee of output.ideen) {
    if (!chosen.has(idee.kanal)) return "kanal";
    for (const n of numbersIn([idee.titel, idee.worum, idee.hook].join("\n"))) if (!known.has(n)) return "zahl";
  }
  for (const n of numbersIn(output.themen.join("\n"))) if (!known.has(n)) return "zahl";
  if (istDeutsch([input.title, input.description, ...input.headings, input.text].join("\n"))) {
    const quelle = quelleBewertung(output, input);
    if (quelle.themen < 2 || quelle.ideen < Math.ceil(output.ideen.length / 2)) return "erfunden";
  }
  return null;
}

const INSTRUCTION = `Schreib Ideen für Beiträge eines Schweizer KMU aus dem Text seiner Website.
- Nimm nur die Kanäle aus «kanaele». Die Schlüssel bedeuten: instagram (Instagram), linkedin (LinkedIn), google (Beitrag im Google-Unternehmensprofil), newsletter (E-Mail-Newsletter), website (Beitrag oder Blog auf der eigenen Website). Jede Idee hat genau einen dieser Schlüssel als «kanal». Kanäle, die nicht in «kanaele» stehen, kommen nicht vor. Verteile die Ideen auf die gewählten Kanäle.
- Jede Idee geht von einem konkreten Inhalt der Website aus: eine Leistung, ein Angebot, ein Ort, eine Person, ein Projekt, ein Satz. Nenne diesen Inhalt in «worum» mit den Wörtern der Website und sag, was im Beitrag zu sehen oder zu lesen ist. Erfinde keine Leistungen, Angebote oder Anlässe, die nicht im Text stehen. Cookie-Hinweise, Menüpunkte und Fusszeilen sind keine Inhalte der Website.
- «format» ist eines von: foto (ein Bild mit kurzem Text), reel (kurzes Video für Instagram), text (reiner Text), story (Story mit wenigen Worten), karussell (mehrere Bilder zum Blättern), kurzvideo (Video für andere Kanäle). Wähle das Format passend zum Kanal; für google, newsletter und website nur foto oder text.
- «hook» ist der erste Satz des fertigen Beitrags: direkt, konkret, ohne Frage als Floskel. «titel» ist der Arbeitstitel für den Redaktionsplan.
- Schreib so, dass Kundschaft es versteht: keine Fachwörter aus dem Marketing, keine englischen Wörter, wo ein deutsches reicht.
- Schweizer Bezug: Ort und Region des Betriebs, Jahreszeit, lokale Anlässe. Kennst du den Anlass oder den Namen nicht, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Anlass in deiner Gemeinde] oder [Name der Mitarbeiterin].
- Ziffern nur, wenn sie wörtlich im Text der Website stehen. Sonst lass die Zahl weg, auch als Wort («seit über fünfzig Jahren»).
- «themen»: genau drei Themenfelder, die der Text der Website hergibt, je ein kurzer Begriff oder Satzteil.
- Liefere ${MIN_IDEEN} bis ${MAX_IDEEN} Ideen.
Form: {"themen": ["…", "…", "…"], "ideen": [{"titel": "…", "kanal": "instagram", "format": "foto", "worum": "…", "hook": "…"}]}`;

export const ideenGenerator = defineGenerator({
  slug: "ideen-aus-website",
  input: ideenInput,
  output: ideenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben und Text der Website", i),
  // Zwölf Ideen an der Obergrenze des Schemas sind rund 7'700 Zeichen, also gut 2'300 Tokens (3,25 Zeichen je Token).
  maxTokens: 2400,
  temperature: 0.5,
  check: checkIdeen,
});

export { ideenGenerator as generator };
export default ideenGenerator;
