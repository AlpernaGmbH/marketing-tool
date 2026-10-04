import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";

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
 * Prüfung, die nur dieses Werkzeug kennt: keine Ziffer in irgendeinem Feld des Entwurfs, die nicht in den Angaben steht
 * (Betrieb, Branche, Ort, Positionierung, Zielgruppe, Wofür, drei Wörter, Nie, Überschriften, Text der Website), und bei
 * Anrede «Sie» kein «du» im Beispielsatz an die Kundschaft. Gibt den Grund zurück («zahl», «anrede») oder null.
 */
export function checkMarke(output: MarkenOutput, input: MarkenInput): string | null {
  if (input.anrede === "sie" && hasDuForm(output.tonalitaet.beispielSatz)) return "anrede";
  const known = new Set(
    numbersIn([input.betrieb, input.branche, input.ort, input.positionierung, input.zielgruppe, input.wofuer, input.woerterKundschaft, input.nie, ...input.headings, input.websiteText].join("\n")),
  );
  for (const n of numbersIn(collectStrings(output).join("\n"))) if (!known.has(n)) return "zahl";
  return null;
}

const INSTRUCTION = `Schreib die Markenplattform eines Schweizer KMU auf einer Seite: Werte, Persönlichkeit, Tonalität, Wörter, Versprechen, Geschichte und Regeln für Antworten auf Bewertungen. Ruhig und konkret, damit alle im Betrieb gleich schreiben.
- Die Plattform richtet sich an die Inhaberin oder den Inhaber (Du-Form). Nur Sätze an die Kundschaft stehen in der Anrede aus «anrede»: «du» heisst Du-Form, «sie» heisst Sie-Form. Bei «sie» darf kein Satz an die Kundschaft «du», «dich», «dir» oder «dein» enthalten.
- «versprechen»: ein Satz, was die Kundschaft von diesem Betrieb verlässlich bekommt, in der Wir-Form, aus «wofuer» und «positionierung». Keine Superlative, kein Werbeton.
- «werte»: drei bis fünf Werte. «name» ist ein Wort oder zwei, «satz» sagt, was der Wert im Alltag heisst, als beobachtbares Verhalten («Wir rufen am gleichen Tag zurück»), nicht als Schlagwort.
- «persoenlichkeit»: drei bis fünf Eigenschaftswörter aus «woerterKundschaft» und «wofuer», je ein Wort oder zwei.
- «tonalitaet»: «so» sagt in zwei bis vier Sätzen, wie der Betrieb schreibt (Satzlänge, Anrede, Fachwörter, Humor). «nichtSo» sagt, was er nicht tut, aus «nie» und dem Gegenteil von «so». «beispielSatz»: ein Satz an die Kundschaft in diesem Ton und in der gewählten Anrede, zum Beispiel der erste Satz einer Antwort auf eine Anfrage.
- «woerter»: «verwenden» fünf bis zehn Wörter oder kurze Wendungen, die zum Betrieb passen; «vermeiden» fünf bis zehn Wörter, die nicht passen, zum Beispiel Werbewörter, Fachbegriffe, Anglizismen aus der Branche. Nenne dort keine Wörter aus den Regeln oben.
- «geschichte»: ein kurzer Absatz über Herkunft und Haltung des Betriebs. Fakten nur aus den Angaben; für Gründungsjahr, Namen, Orte und Zahlen, die fehlen, schreib Platzhalter in eckigen Klammern, zum Beispiel [Jahr der Gründung] oder [Name der Gründerin].
- «bewertungsregeln»: drei bis fünf Regeln, wie der Betrieb auf Bewertungen bei Google antwortet: auf Lob und auf Kritik, in der gewählten Anrede, mit Dank, ohne Rechtfertigung, mit einem Angebot zum Gespräch. Je ein Satz.
- «heutigerTon»: nur wenn «websiteText» nicht leer ist: zwei bis vier Sätze, wie die Website heute klingt (Anrede, Satzlänge, Wörter) und was sich mit dieser Plattform ändert. Ist «websiteText» leer, ist «heutigerTon» eine leere Zeichenkette.
- Ziffern nur, wenn sie wörtlich in den Angaben stehen. Sonst schreib die Zahl als Wort oder lass sie weg.
- Nimm «branche», «ort» und «zielgruppe» für Beispiele aus dem Alltag des Betriebs; erfinde keine Kundschaft mit Namen.
Form: {"versprechen": "…", "werte": [{"name": "…", "satz": "…"}], "persoenlichkeit": ["…"], "tonalitaet": {"so": "…", "nichtSo": "…", "beispielSatz": "…"}, "woerter": {"verwenden": ["…"], "vermeiden": ["…"]}, "geschichte": "…", "bewertungsregeln": ["…"], "heutigerTon": ""}`;

export const markenGenerator = defineGenerator({
  slug: "markenplattform",
  input: markenInput,
  output: markenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zur Marke", i),
  maxTokens: 1600,
  temperature: 0.5,
  check: checkMarke,
});

export { markenGenerator as generator };
export default markenGenerator;
