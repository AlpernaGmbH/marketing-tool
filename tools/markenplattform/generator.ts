import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn, withoutKeys } from "@/lib/generator";

// Generator der Markenplattform (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem Server:
// nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Firmenprofil (Betrieb, Branche, Ort, Positionierung,
// Primärsegment), dem Formular und, wenn gewünscht, dem Text der Startseite (lib/read.ts). Die Route /api/generate prüft
// Eingabe und Antwort mit denselben Schemas. Spec: specs/markenplattform.md

export const ANREDE_KEYS = ["du", "sie"] as const;
export type AnredeKey = (typeof ANREDE_KEYS)[number];

/** Feldgrenzen, an einer Stelle für Schema, Formular und Prüfung. Grenzen sind Richtwerte dieses Werkzeugs, keine Statistik. */
export const LIMITS = {
  betrieb: 120,
  branche: 120,
  ort: 80,
  positionierung: 600,
  zielgruppe: 200,
  wofuerMin: 20,
  wofuer: 600,
  woerterKundschaft: 120,
  nie: 400,
  /** Weniger als beim Lesen der Seite (8'000): Der Ton zeigt sich in den ersten Absätzen. */
  websiteText: 4_000,
  headings: 20,
  heading: 200,
} as const;

export const markenInput = z.object({
  betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
  branche: z.string().trim().max(LIMITS.branche),
  ort: z.string().trim().max(LIMITS.ort),
  positionierung: z.string().trim().max(LIMITS.positionierung),
  zielgruppe: z.string().trim().max(LIMITS.zielgruppe),
  wofuer: z.string().trim().min(LIMITS.wofuerMin).max(LIMITS.wofuer),
  woerterKundschaft: z.string().trim().min(1).max(LIMITS.woerterKundschaft),
  nie: z.string().trim().max(LIMITS.nie),
  anrede: z.enum(ANREDE_KEYS),
  websiteText: z.string().max(LIMITS.websiteText),
  headings: z.array(z.string().max(LIMITS.heading)).max(LIMITS.headings),
});
export type MarkenInput = z.infer<typeof markenInput>;

const satz = (min: number, max: number) => z.string().min(min).max(max);
const wort = () => z.string().min(1).max(40);

export const markenOutput = z.object({
  versprechen: satz(30, 240),
  werte: z.array(z.object({ name: satz(3, 40), satz: satz(20, 200) })).min(3).max(5),
  persoenlichkeit: z.array(satz(3, 40)).min(3).max(5),
  tonalitaet: z.object({
    so: satz(40, 400),
    nichtSo: satz(40, 400),
    beispielSatz: satz(20, 240),
  }),
  woerter: z.object({
    verwenden: z.array(wort()).min(5).max(10),
    vermeiden: z.array(wort()).min(5).max(10),
  }),
  geschichte: satz(120, 600),
  bewertungsregeln: z.array(satz(20, 200)).min(3).max(5),
  heutigerTon: z.string().max(400),
});
export type MarkenOutput = z.infer<typeof markenOutput>;

export { numbersIn };

/** Die Du-Formen als Anrede an die Kundschaft (mit Endungen), ohne Gross/Klein, an Wortgrenzen. */
const DU_RE = /(?:^|[^\p{L}])(?:du|dich|dir|dein(?:e|em|en|er|es)?)(?=$|[^\p{L}])/iu;

/** true, wenn der Satz die Kundschaft mit «du», «dich», «dir» oder «dein» anspricht. */
export function hasDuForm(text: string): boolean {
  return DU_RE.test(text);
}

/**
 * Unter diesen Schlüsseln nennt die KI, was zum Betrieb nicht passt: «woerter.vermeiden» (Werbewörter, Anglizismen) und
 * «tonalitaet.nichtSo» (was der Betrieb nicht tut, auch als Zitat der «nie»-Angabe). Sie sind Beispiele, kein Text des Betriebs.
 */
export const NEGATIVE_KEYS = ["vermeiden", "nichtSo"] as const;

/** Superlative, mit denen der Betrieb von sich spricht («der beste und günstigste Malerbetrieb»). Steht die Wendung in den Angaben, ist sie erlaubt. */
const SUPERLATIV_RE = /\b(?:der|die|das|den|dem)\s+(?:beste|günstigste|billigste|schnellste|erfahrenste|beliebteste)[nrms]?\b/giu;
/** Personen mit Titel oder Rolle («Gründerin Frieda Keller»): Der Name muss in den Angaben stehen, sonst ist er erfunden. */
const PERSON_RE = /\b(?:Familie|Herr|Herrn|Frau|Gründer|Gründerin|Inhaber|Inhaberin|Geschäftsführer|Geschäftsführerin)\s+(\p{Lu}[\p{Ll}-]+)/gu;

/**
 * Bringt die rohe Antwort in Form, bevor das Schema sie prüft: «heutigerTon» gibt es nur mit gelesener Website, und das
 * Modell lässt das Feld dann gern weg oder schreibt null statt der leeren Zeichenkette (MarkenOutput verlangt eine Zeichenkette).
 */
export function normalizeMarke(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, heutigerTon: typeof value.heutigerTon === "string" ? value.heutigerTon : "" };
}

/**
 * Prüfung, die nur dieses Werkzeug kennt: bei Anrede «Sie» kein «du» im Beispielsatz an die Kundschaft («anrede»), keine Ziffer und
 * kein Zahlwort ab «zwanzig» im Entwurf, die nicht in den Angaben stehen (Betrieb, Branche, Ort, Positionierung, Zielgruppe,
 * Wofür, drei Wörter, Nie, Überschriften, Text der Website; «zahl»), kein Superlativ über den Betrieb («wertung») und kein Name
 * einer Person mit Titel, der nicht in den Angaben steht («erfunden»).
 * Die Listen «vermeiden» und «nichtSo» zählen nicht: Zahlen und Wörter sind dort Beispiele für Unpassendes (zum Beispiel «Nr. 1»).
 * Der Name des Betriebs gehört nicht zur Anrede («Dein Malerbetrieb»). Gibt den Grund zurück oder null.
 */
export function checkMarke(output: MarkenOutput, input: MarkenInput): string | null {
  const ohneBetrieb = input.betrieb ? output.tonalitaet.beispielSatz.split(input.betrieb).join(" ") : output.tonalitaet.beispielSatz;
  if (input.anrede === "sie" && hasDuForm(ohneBetrieb)) return "anrede";
  const angaben = [input.betrieb, input.branche, input.ort, input.positionierung, input.zielgruppe, input.wofuer, input.woerterKundschaft, input.nie, ...input.headings, input.websiteText].join("\n");
  const known = new Set(numbersIn(angaben));
  const eigene = collectStrings(withoutKeys(output, NEGATIVE_KEYS)).join("\n");
  for (const n of numbersIn(eigene)) if (!known.has(n)) return "zahl";
  const allowed = angaben.toLowerCase();
  for (const m of eigene.matchAll(SUPERLATIV_RE)) if (!allowed.includes(m[0].toLowerCase())) return "wertung";
  for (const m of eigene.matchAll(PERSON_RE)) if (!allowed.includes(m[1].toLowerCase())) return "erfunden";
  return null;
}

const INSTRUCTION = `Schreib die Markenplattform eines Schweizer KMU auf einer Seite: Werte, Persönlichkeit, Tonalität, Wörter, Versprechen, Geschichte und Regeln für Antworten auf Bewertungen. Ruhig und konkret, damit alle im Betrieb gleich schreiben.
- Die Plattform richtet sich an die Inhaberin oder den Inhaber (Du-Form). Nur Sätze an die Kundschaft stehen in der Anrede aus «anrede»: «du» heisst Du-Form, «sie» heisst Sie-Form. Bei «sie» darf kein Satz an die Kundschaft «du», «dich», «dir» oder «dein» enthalten.
- «versprechen»: ein Satz, was die Kundschaft von diesem Betrieb verlässlich bekommt, in der Wir-Form, aus «wofuer» und «positionierung». Keine Superlative, kein Werbeton.
- «werte»: drei bis fünf Werte. «name» ist ein Wort oder zwei, «satz» sagt, was der Wert im Alltag heisst, als beobachtbares Verhalten («Wir rufen am gleichen Tag zurück»), nicht als Schlagwort.
- «persoenlichkeit»: drei bis fünf Eigenschaftswörter aus «woerterKundschaft» und «wofuer», je ein Wort oder zwei.
- «tonalitaet»: «so» sagt in zwei bis vier Sätzen, wie der Betrieb schreibt (Satzlänge, Anrede, Fachwörter, Humor). «nichtSo» sagt, was er nicht tut, aus «nie» und dem Gegenteil von «so»; hier darfst du Wörter der «nie»-Angabe wörtlich nennen, auch wenn du sie selbst nicht verwenden darfst. «beispielSatz»: ein Satz an die Kundschaft in diesem Ton und in der gewählten Anrede, zum Beispiel der erste Satz einer Antwort auf eine Anfrage.
- «woerter»: «verwenden» fünf bis zehn Wörter oder kurze Wendungen, die zum Betrieb passen; «vermeiden» fünf bis zehn Wörter, die nicht passen, zum Beispiel Werbewörter, Fachbegriffe, Anglizismen aus der Branche. Hier dürfen auch Wörter stehen, die du selbst nicht verwenden darfst («innovativ», «ganzheitlich», «Best Practice», «Nr. 1»); nur keine Ausrufezeichen.
- «geschichte»: ein kurzer Absatz über Herkunft und Haltung des Betriebs. Fakten nur aus den Angaben; für Gründungsjahr, Namen, Orte und Zahlen, die fehlen, schreib Platzhalter in eckigen Klammern, zum Beispiel [Jahr der Gründung] oder [Name der Gründerin].
- «bewertungsregeln»: drei bis fünf Regeln, wie der Betrieb auf Bewertungen bei Google antwortet: auf Lob und auf Kritik, in der gewählten Anrede, mit Dank, ohne Rechtfertigung, mit einem Angebot zum Gespräch. Je ein Satz.
- «heutigerTon»: nur wenn «websiteText» nicht leer ist: zwei bis vier Sätze, wie die Website heute klingt (Anrede, Satzlänge, Wörter) und was sich mit dieser Plattform ändert. Ist «websiteText» leer, ist «heutigerTon» eine leere Zeichenkette.
- Zahlen nur, wenn sie wörtlich in den Angaben stehen; auch Zahlwörter wie «zwanzig», «hundert» oder «tausend» zählen dazu. Fehlt eine Zahl, lass sie weg oder setz einen Platzhalter in eckigen Klammern. Keine Namen von Personen, die nicht in den Angaben stehen, und keine Superlative über den Betrieb («der beste», «der günstigste»), ausser sie stehen wörtlich in den Angaben.
- Nimm «branche», «ort» und «zielgruppe» für Beispiele aus dem Alltag des Betriebs; erfinde keine Kundschaft mit Namen.
Form: {"versprechen": "…", "werte": [{"name": "…", "satz": "…"}], "persoenlichkeit": ["…"], "tonalitaet": {"so": "…", "nichtSo": "…", "beispielSatz": "…"}, "woerter": {"verwenden": ["…"], "vermeiden": ["…"]}, "geschichte": "…", "bewertungsregeln": ["…"], "heutigerTon": ""}`;

export const markenGenerator = defineGenerator({
  slug: "markenplattform",
  input: markenInput,
  output: markenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zur Marke", i),
  // Eine Antwort an der Obergrenze des Schemas hat rund 1'700 bis 1'950 Token, eine typische 540 bis 630. 1'600 schnitt volle Antworten ab.
  maxTokens: 1900,
  temperature: 0.5,
  normalize: normalizeMarke,
  // «vermeiden» und «nichtSo» nennen, was nicht passt; die Wörter der Sperrliste sind dort Beispiele.
  negativeKeys: NEGATIVE_KEYS,
  // «Wir wollen jedem Anliegen die gleiche Aufmerksamkeit schenken» ist ein Wert, kein Absichtssatz.
  purposeRules: false,
  check: checkMarke,
});

export { markenGenerator as generator };
export default markenGenerator;
