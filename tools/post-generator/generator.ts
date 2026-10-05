import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";

// Generator des Werkzeugs «Post-Generator» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem
// Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Formular und dem Firmenprofil; die Route
// /api/generate prüft Eingabe und Antwort mit denselben Schemas.

export const PLATTFORM_KEYS = ["instagram", "linkedin", "facebook", "google"] as const;
export type PlattformKey = (typeof PLATTFORM_KEYS)[number];

export const FORMAT_KEYS = ["geschichte", "liste", "meinung", "fachtipp"] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

export const ZIEL_KEYS = ["kommentar", "nachricht", "profil", "link", "speichern"] as const;
export type ZielKey = (typeof ZIEL_KEYS)[number];

export const ANREDE_KEYS = ["du", "sie"] as const;
export type AnredeKey = (typeof ANREDE_KEYS)[number];

export const LIMITS = {
  betrieb: 120,
  branche: 120,
  ort: 120,
  ideeMin: 20,
  idee: 600,
  saeule: 60,
  positionierung: 600,
  werte: 5,
  wert: 40,
  tonalitaet: 400,
  vermeiden: 10,
  vermeidenWort: 40,
  persona: 200,
  hookMin: 10,
  hook: 160,
  hauptteilMin: 80,
  hauptteil: 1200,
  ctaMin: 10,
  cta: 160,
  hinweis: 200,
} as const;

/** Obergrenze des Hauptteils je Plattform in Zeichen (Richtwert von Alperna, keine Statistik). */
export const HAUPTTEIL_MAX: Record<PlattformKey, number> = { instagram: 900, linkedin: 1200, facebook: 900, google: 1200 };

/** Google-Beitrag: Der ganze Text (Hook, Hauptteil, Aufforderung) bleibt unter dieser Grenze. Gleicher Wert wie im Caption-Baukasten. */
export const GOOGLE_GRENZE = 1500;

export const postInput = z.object({
  betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
  branche: z.string().trim().max(LIMITS.branche),
  ort: z.string().trim().max(LIMITS.ort),
  idee: z.string().trim().min(LIMITS.ideeMin).max(LIMITS.idee),
  plattform: z.enum(PLATTFORM_KEYS),
  format: z.enum(FORMAT_KEYS),
  ziel: z.enum(ZIEL_KEYS),
  saeule: z.string().trim().max(LIMITS.saeule),
  anrede: z.enum(ANREDE_KEYS),
  emojis: z.boolean(),
  positionierung: z.string().trim().max(LIMITS.positionierung),
  werte: z.array(z.string().trim().min(1).max(LIMITS.wert)).max(LIMITS.werte),
  tonalitaet: z.string().trim().max(LIMITS.tonalitaet),
  vermeiden: z.array(z.string().trim().min(1).max(LIMITS.vermeidenWort)).max(LIMITS.vermeiden),
  persona: z.string().trim().max(LIMITS.persona),
});
export type PostInput = z.infer<typeof postInput>;

export const postOutput = z.object({
  /** Zwei verschiedene Varianten für den ersten Satz. */
  hooks: z.array(z.string().min(LIMITS.hookMin).max(LIMITS.hook)).length(2),
  hauptteil: z.string().min(LIMITS.hauptteilMin).max(LIMITS.hauptteil),
  cta: z.string().min(LIMITS.ctaMin).max(LIMITS.cta),
  /** Ein Satz, was zur Idee noch fehlt; fehlt das Feld oder ist es leer, gibt es keinen Hinweis. */
  hinweis: z.string().max(LIMITS.hinweis).optional(),
});
export type PostOutput = z.infer<typeof postOutput>;

export { numbersIn };

// ---- Prüfung ---------------------------------------------------------------------------------------

const charCount = (s: string): number => Array.from(s).length;

/** Text für den Vergleich: klein, ohne Satzzeichen, Leerraum zusammengezogen. */
const vergleich = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Emoji-Bereiche: Piktogramme, Emoji mit Bildform, Flaggen (Regional Indicators) und das Tastenkappen-Zeichen. */
export const EMOJI_RE = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F1E6}-\u{1F1FF}]|⃣/u;

/** Ein Hashtag: «#» vor einem Buchstaben, einer Ziffer oder einem Unterstrich, am Anfang oder nach einem Leerzeichen. */
export const HASHTAG_RE = /(?:^|[\s(])#[\p{L}\p{N}_]/u;

/** du, dich, dir und alle Formen von dein (deine, deinem, deinen, deiner, deines) als ganzes Wort. */
export const DU_RE = /(?<![\p{L}\p{N}])(?:du|dich|dir|dein\p{L}*)(?![\p{L}\p{N}])/iu;

/** Endungen, mit denen ein Adjektiv oder Nomen noch als dasselbe Wort gilt («günstig»: günstige, günstigen, günstigere, günstigsten). */
const ENDUNGEN = "e|en|em|er|es|s|n|ere|eren|erem|erer|eres|ste|sten|stem|ster|stes|st";

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Kommt das Wort im Text vor? Ganzes Wort ohne Gross- und Kleinschreibung, mit den üblichen Endungen
 * («günstig» findet «günstige», «günstigen» und «günstigsten»); mehrere Wörter dürfen durch beliebigen Leerraum getrennt sein.
 */
export function containsWord(text: string, word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  const body = w.split(/\s+/).map(escapeRe).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?:${ENDUNGEN})?(?![\\p{L}\\p{N}])`, "iu").test(text);
}

/**
 * Wörter aus dem Profil, die der Beitrag meiden muss. Steht ein Wort in der Idee der Person, gilt es nicht: Sie hat es
 * selbst geschrieben, und der Beitrag darf darauf aufbauen.
 */
export function vermeidenWoerter(input: Pick<PostInput, "vermeiden" | "idee">): string[] {
  return input.vermeiden.filter((w) => w.trim() !== "" && !containsWord(input.idee, w));
}

/** Länge des Google-Beitrags mit einer Hook-Variante: einfache Zeilenumbrüche, keine Leerzeilen. */
export function googleLaenge(hook: string, hauptteil: string, cta: string): number {
  return charCount([hook, hauptteil.replace(/\n{2,}/g, "\n"), cta].join("\n"));
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «hooks»: die beiden Hooks sind (bis auf Gross- und Kleinschreibung und Satzzeichen) gleich;
 * «laenge»: der Hauptteil ist länger als die Plattform erlaubt, oder der Google-Beitrag mit einem der Hooks länger als 1'500 Zeichen;
 * «zahl»: eine Ziffernfolge in irgendeinem Text, die nicht in den Angaben steht;
 * «emoji»: ein Emoji, obwohl die Person keine erlaubt hat;
 * «hashtag»: ein Hashtag (die Person schreibt sie selbst);
 * «anrede»: bei Sie ein du, dich, dir oder dein in Hook, Hauptteil oder Aufforderung;
 * «vermeiden»: ein Wort aus den zu vermeidenden Wörtern.
 */
export function checkPost(output: PostOutput, input: PostInput): string | null {
  const [a, b] = output.hooks;
  if (vergleich(a) === vergleich(b)) return "hooks";

  if (charCount(output.hauptteil) > HAUPTTEIL_MAX[input.plattform]) return "laenge";
  if (input.plattform === "google" && output.hooks.some((h) => googleLaenge(h, output.hauptteil, output.cta) > GOOGLE_GRENZE)) return "laenge";

  const known = new Set(numbersIn(collectStrings(input).join("\n")));
  const texte = collectStrings(output);
  for (const n of numbersIn(texte.join("\n"))) if (!known.has(n)) return "zahl";

  if (!input.emojis && texte.some((t) => EMOJI_RE.test(t))) return "emoji";
  if (texte.some((t) => HASHTAG_RE.test(t))) return "hashtag";

  if (input.anrede === "sie" && [...output.hooks, output.hauptteil, output.cta].some((t) => DU_RE.test(t))) return "anrede";

  const meiden = vermeidenWoerter(input);
  if (meiden.some((w) => texte.some((t) => containsWord(t, w)))) return "vermeiden";
  return null;
}

const INSTRUCTION = `Schreib einen Beitrag für das Social-Media-Konto eines Schweizer Betriebs oder Vereins aus der Idee in «idee». Der Beitrag spricht aus Sicht des Betriebs («betrieb»), meist in der Wir-Form, und ist so konkret, dass niemand fragen muss, was gemeint war.
- «plattform»: instagram, linkedin, facebook oder google (Beitrag im Google-Unternehmensprofil). Schreib so, wie man dort liest: kurze Zeilen auf Instagram, sachlich und mit Praxis auf LinkedIn, nah und lokal auf Facebook, ruhig und ohne Leerzeilen auf Google.
- «format»: geschichte = eine kleine Szene aus dem Alltag mit Anfang, Wendung und Schluss. liste = drei bis fünf Punkte, jeder auf einer eigenen Zeile und mit «- » am Zeilenanfang. meinung = eine klare Haltung, begründet aus der Praxis des Betriebs. fachtipp = ein Rat, den die Kundschaft sofort umsetzen kann, mit dem Grund dahinter.
- «hooks»: genau zwei verschiedene Varianten für den ersten Satz, je 10 bis 160 Zeichen. Die erste ist eine Frage, die zweite eine Aussage. Beide führen in denselben Hauptteil und sind ohne ihn verständlich. Der Hook nennt, worum es geht; er lockt nicht mit Versprechen.
- «hauptteil»: 80 bis 1200 Zeichen ohne Hook und ohne Aufforderung. Die Absätze sind durch eine Leerzeile getrennt (im JSON zwei Zeilenumbrüche). Länge: bei instagram und facebook höchstens 900 Zeichen, bei linkedin und google höchstens 1200 Zeichen. Bei google keine Leerzeilen, nur einfache Zeilenumbrüche, und Hook, Hauptteil und Aufforderung zusammen höchstens 1500 Zeichen.
- «cta»: eine Aufforderung am Ende, 10 bis 160 Zeichen, nach «ziel». kommentar = lädt zu einem Kommentar ein und stellt dafür eine konkrete Frage. nachricht = lädt ein, dem Betrieb eine Nachricht zu schreiben. profil = lädt ein, das Profil zu besuchen. link = verweist auf den Link; schreib dafür den Platzhalter [Link] und nie eine Adresse. speichern = lädt ein, den Beitrag zu speichern, damit man später darauf zurückkommt.
- Anrede nach «anrede»: du = Du-Form (du, dir, dein), sie = Sie-Form (Sie, Ihnen, Ihr). Sie gilt für Hooks, Hauptteil und Aufforderung. Bei sie steht nirgends du, dich, dir oder dein.
- Emojis nach «emojis»: false = kein Emoji und kein Smiley. true = höchstens drei im ganzen Beitrag, passend zum Inhalt, keines im Hook; die feste Regel «keine Emojis» gilt dann nicht.
- Keine Hashtags und kein Zeichen #. Die Person ergänzt sie selbst.
- Hintergrund, wenn er da ist: «tonalitaet» (so schreibt der Betrieb), «werte», «positionierung», «persona» (wer den Beitrag liest) und «saeule» (das Themenfeld des Beitrags). Nimm sie als Haltung, wiederhole sie nicht wörtlich. Wörter aus «vermeiden» kommen nirgends vor, auch nicht in anderer Wortform.
- Nutze Ort («ort») und Alltag des Betriebs, wo es zur Idee passt. Erfinde nichts zur Idee dazu. Fehlt etwas Wichtiges wie ein Datum, ein Name oder ein Preis, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Datum des Anlasses].
- Ziffern nur, wenn sie wörtlich in den Angaben stehen. Sonst schreib die Zahl als Wort oder lass sie weg. Nummern wie «1.» am Zeilenanfang einer Liste sind erlaubt.
- «hinweis»: ein Satz, höchstens 200 Zeichen, ohne Anrede, was zur Idee noch fehlt, damit der Beitrag besser wird, zum Beispiel «Ein Foto der fertigen Fassade würde den Beitrag stärken.». Fehlt nichts, schreib eine leere Zeichenkette "".
Form: {"hooks": ["…", "…"], "hauptteil": "…", "cta": "…", "hinweis": "…"}`;

export const postGenerator = defineGenerator({
  slug: "post-generator",
  input: postInput,
  output: postOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Beitrag", i),
  maxTokens: 1200,
  temperature: 0.6,
  check: checkPost,
  allowEmoji: (i) => i.emojis,
});

export { postGenerator as generator };
export default postGenerator;
