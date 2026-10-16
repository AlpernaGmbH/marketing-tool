import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";
import { splitSentences } from "@/tools/caption-baukasten/logic";
import { containsWord } from "@/tools/post-generator/generator";
import { FELDER, KI_MIN, MAX_SAETZE, type FeldKey } from "./logic";

// Generator des Werkzeugs «Story-Post-Builder», Weg «ki» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4): Die Person gibt zu sechs
// Fragen Stichworte oder Sätze an, die KI formuliert daraus Sätze, ohne etwas dazuzuerfinden. Läuft im Browser und auf dem Server:
// nur zod, Strings und reine Funktionen. Die Route /api/generate prüft Eingabe und Antwort mit denselben Schemas.

export const ANREDE_KEYS = ["du", "sie"] as const;

export const LIMITS = {
  betrieb: 120,
  branche: 120,
  ort: 120,
  tonalitaet: 400,
  vermeiden: 10,
  vermeidenWort: 40,
} as const;

const MAX = Object.fromEntries(FELDER.map((f) => [f.key, f.max])) as Record<FeldKey, number>;
const MIN = Object.fromEntries(FELDER.map((f) => [f.key, f.min])) as Record<FeldKey, number>;

/** Eingabe: Stichworte genügen (KI_MIN Zeichen), das freiwillige Feld darf leer sein. */
const feldIn = (key: FeldKey, pflicht: boolean) => {
  const base = z.string().trim().max(MAX[key]);
  return pflicht ? base.min(KI_MIN) : base;
};

export const storyInput = z.object({
  betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
  branche: z.string().trim().max(LIMITS.branche),
  ort: z.string().trim().max(LIMITS.ort),
  anrede: z.enum(ANREDE_KEYS),
  tonalitaet: z.string().trim().max(LIMITS.tonalitaet),
  vermeiden: z.array(z.string().trim().min(1).max(LIMITS.vermeidenWort)).max(LIMITS.vermeiden),
  felder: z.object({
    ausgangslage: feldIn("ausgangslage", true),
    problem: feldIn("problem", true),
    wendepunkt: feldIn("wendepunkt", true),
    ergebnis: feldIn("ergebnis", true),
    lehre: feldIn("lehre", true),
    bezug: feldIn("bezug", false),
  }),
});
export type StoryInput = z.infer<typeof storyInput>;

/** Ausgabe: je Feld die ausformulierten Sätze (Pflichtfelder mindestens so lang wie von Hand), «bezug» leer, wenn die Person nichts angab. */
const feldOut = (key: FeldKey, pflicht: boolean) => (pflicht ? z.string().min(MIN[key]).max(MAX[key]) : z.string().max(MAX[key]));

export const storyOutput = z.object({
  ausgangslage: feldOut("ausgangslage", true),
  problem: feldOut("problem", true),
  wendepunkt: feldOut("wendepunkt", true),
  ergebnis: feldOut("ergebnis", true),
  lehre: feldOut("lehre", true),
  bezug: feldOut("bezug", false),
});
export type StoryOutput = z.infer<typeof storyOutput>;

export { numbersIn };

// ---- Prüfung ---------------------------------------------------------------------------------------

const norm = (s: string): string => s.normalize("NFC").toLowerCase();
const words = (s: string): string[] => norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);
/** Gemeinsamer Wortanfang von fünf Buchstaben zählt als dasselbe Wort («Fassade» und «Fassaden»). */
const stamm = (w: string): string => w.slice(0, 5);

/** Der Text nennt mindestens ein Wort der Angabe (so bleibt er an den Stichworten, statt etwas Neues zu erzählen). */
export function nenntAngabe(text: string, angabe: string): boolean {
  const ziel = words(angabe).map(stamm);
  if (ziel.length === 0) return true;
  const stammen = new Set(words(text).map(stamm));
  return ziel.some((w) => stammen.has(w));
}

/** du, dich, dir und alle Formen von dein als ganzes Wort. */
const DU_RE = /(?<![\p{L}\p{N}])(?:du|dich|dir|dein\p{L}*)(?![\p{L}\p{N}])/iu;

/** Ein Hashtag: «#» vor einem Buchstaben, einer Ziffer oder einem Unterstrich, am Anfang oder nach einem Leerzeichen oder einer Klammer. */
const HASHTAG_RE = /(?<=^|[\s(])#[\p{L}\p{N}_]+/gu;
/** Die Hashtags eines Textes, klein geschrieben. */
export const hashtagsIn = (text: string): string[] => (text.match(HASHTAG_RE) ?? []).map((h) => h.toLowerCase());

/**
 * Anfänge von Wörtern, die etwas bewerten oder ein Gefühl behaupten («beeindruckend», «die Kundin war begeistert»). Die Geschichte
 * erzählt, was geschehen ist; Wertungen und Gefühle schreibt nur die Person selbst. «toll» und «super» zählen nur als ganzes Wort.
 */
const WERTUNG_RE =
  /(?<![\p{L}\p{N}])(?:(beeindruck|grossartig|fantastisch|wunderbar|wunderschön|traumhaft|hervorragend|herausragend|einzigartig|atemberaubend|unglaublich|phänomenal|spektakulär|sensationell|fabelhaft|brillant|genial|perfekt|ausgezeichnet|erstklassig|bemerkenswert|aussergewöhnlich|begeister|zufrieden|glücklich|überglücklich|stolz|dankbar|erleichtert)\p{L}*|(toll|super)(?![\p{L}\p{N}]))/giu;

/** Die wertenden Wörter eines Textes (nur ihr Anfang, klein), die nicht in `eigene` stehen, dem Text der Person. */
export function fremdeWertungen(text: string, eigene: string): string[] {
  const ihr = eigene.toLowerCase();
  const out = new Set<string>();
  for (const m of text.matchAll(WERTUNG_RE)) {
    // Steht der Anfang des Wortes in den Angaben («begeistert» für «begeisterte»), hat die Person es selbst gewählt.
    const anfang = (m[1] ?? m[2]).toLowerCase();
    if (!ihr.includes(anfang)) out.add(anfang);
  }
  return [...out];
}

/** «Herr Meier», «Frau Meier»: ein Name nach der Anrede. «Frau Z.» (nur ein Buchstabe) zählt nicht. */
const ANREDE_NAME_RE = /(?<![\p{L}\p{N}])(?:Herr|Frau)\s+(\p{Lu}\p{L}+)/gu;

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «leer» (ein Pflichtfeld ist leer, oder «bezug» hat Text ohne Angabe), «saetze» (mehr als drei Sätze in einem Feld),
 * «zahl» (Ziffernfolge, die nicht in den Angaben steht), «erfunden» (ein Feld nennt kein Wort seiner Angabe, oder ein Name nach
 * «Herr» oder «Frau», der nicht in den Angaben steht), «platzhalter» (eckige Klammer, die nicht in den Angaben steht),
 * «hashtag» (ein Hashtag, den die Person nicht selbst geschrieben hat), «wertung» (ein wertendes Wort oder behauptetes Gefühl, das
 * nicht in den Angaben steht), «anrede» (bei Sie ein du, dich, dir oder dein),
 * «vermeiden» (ein Wort aus den zu vermeidenden Wörtern, das nicht in den Angaben der Person steht).
 */
export function checkStory(output: StoryOutput, input: StoryInput): string | null {
  for (const f of FELDER) {
    const text = output[f.key].trim();
    const angabe = input.felder[f.key].trim();
    if (f.pflicht && text === "") return "leer";
    if (!f.pflicht && angabe === "" && text !== "") return "leer";
    if (text && splitSentences(text).length > MAX_SAETZE) return "saetze";
  }

  const known = new Set(numbersIn(collectStrings(input).join("\n")));
  for (const n of numbersIn(collectStrings(output).join("\n"))) if (!known.has(n)) return "zahl";

  for (const f of FELDER) {
    const text = output[f.key].trim();
    if (text && !nenntAngabe(text, input.felder[f.key])) return "erfunden";
  }

  const gegeben = new Set(collectStrings(input.felder).flatMap((s) => s.match(/\[[^\]\n]{1,40}\]/g) ?? []));
  for (const s of collectStrings(output)) for (const p of s.match(/\[[^\]\n]{1,40}\]/g) ?? []) if (!gegeben.has(p)) return "platzhalter";

  // Alles, was die Person selbst geschrieben hat: ihre sechs Angaben und die Stammdaten des Betriebs.
  const angaben = collectStrings(input).join("\n");
  const texte = collectStrings(output);
  const eigeneTags = new Set(hashtagsIn(angaben));
  if (texte.some((t) => hashtagsIn(t).some((h) => !eigeneTags.has(h)))) return "hashtag";
  if (texte.some((t) => fremdeWertungen(t, angaben).length > 0)) return "wertung";
  const angabenLower = angaben.toLowerCase();
  for (const t of texte) for (const m of t.matchAll(ANREDE_NAME_RE)) if (!angabenLower.includes(m[1].toLowerCase())) return "erfunden";

  if (input.anrede === "sie" && collectStrings(output).some((t) => DU_RE.test(t))) return "anrede";

  const eigene = collectStrings(input.felder).join("\n");
  const meiden = input.vermeiden.filter((w) => w.trim() !== "" && !containsWord(eigene, w));
  if (meiden.some((w) => collectStrings(output).some((t) => containsWord(t, w)))) return "vermeiden";
  return null;
}

const INSTRUCTION = `Formuliere aus Stichworten zu einer Geschichte aus einem Schweizer Betrieb Sätze für einen Beitrag auf LinkedIn und Instagram. Du ordnest nichts um und erfindest nichts dazu: Du machst aus dem, was die Person in «felder» angibt, lesbare Sätze.
- «felder» hat sechs Teile: ausgangslage (Wo stand der Betrieb, wer war beteiligt?), problem (Was war schwierig oder unklar?), wendepunkt (Was hat den Unterschied gemacht?), ergebnis (Was ist daraus geworden?), lehre (Was nimmt der Betrieb mit?), bezug (eine Frage oder Einladung an die Leserschaft, freiwillig).
- Antworte mit denselben sechs Teilen. Jeder Teil besteht aus ein bis drei Sätzen, 20 bis 400 Zeichen. Jeder Teil nennt die Sache aus seiner Angabe mit denselben Hauptwörtern; er erzählt nichts anderes.
- Alle Tatsachen stehen in den Angaben. Erfinde keine Namen, Orte, Zahlen, Daten, Preise, Zitate, Gefühle oder Folgen. Zahlen nur, wenn sie in den Angaben stehen, auch als Wort («zehn Jahre», «über fünfzig»). Fehlt etwas Wichtiges, lass es weg oder setz nur einen Platzhalter, der schon in den Angaben steht.
- Schreib in der Wir-Form des Betriebs («betrieb»). Ort («ort») und Branche («branche») nur, wo sie schon in den Angaben vorkommen.
- Anrede der Leserschaft nach «anrede»: du = Du-Form (du, dir, dein), sie = Sie-Form (Sie, Ihnen, Ihr). Bei sie steht nirgends du, dich, dir oder dein.
- «ergebnis» beginnt mit einem Satz, der für sich allein als erste Zeile des Beitrags steht: kurz (höchstens 140 Zeichen), mit der Aussage. Er enthält die Wörter der Angabe zum Ergebnis.
- «bezug»: nur, wenn die Angabe nicht leer ist: eine Frage oder Einladung an die Leserschaft in einem Satz. Ist die Angabe leer, ist «bezug» ein leerer String.
- Ton nach «tonalitaet», wenn sie da ist. Wörter aus «vermeiden» kommen nirgends vor.
- Keine Hashtags und kein Zeichen #, keine Emojis, keine Werbesprache.
- Keine Wertungen und keine Gefühle, die nicht in den Angaben stehen: nicht «beeindruckend», «grossartig» oder «perfekt», nicht «die Kundin war begeistert», «zufrieden» oder «stolz». Schreib, was geschehen ist, nicht, wie es wirkt.
- Nenne keine Person mit Herr oder Frau und einem Namen («Frau Meier»), ausser der Name steht in den Angaben.
Form: {"ausgangslage": "…", "problem": "…", "wendepunkt": "…", "ergebnis": "…", "lehre": "…", "bezug": "…"}`;

export const storyGenerator = defineGenerator({
  slug: "story-post",
  input: storyInput,
  output: storyOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zur Geschichte", i),
  maxTokens: 900,
  temperature: 0.4,
  check: checkStory,
});

export { storyGenerator as generator };
export default storyGenerator;
