import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator } from "@/lib/generator";

// Generator des Werkzeugs «Nutzenversprechen» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf
// dem Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Formular und dem Firmenprofil; die
// Route /api/generate prüft Eingabe und Antwort mit denselben Schemas.

/** Feldgrenze der Beschreibung im Google-Unternehmensprofil (Quelle: die Angabe im Profil selbst, keine Statistik). */
export const GOOGLE_MAX = 750;

export const LIMITS = {
  betrieb: 120,
  branche: 120,
  ort: 80,
  zielgruppe: 200,
  angebotMin: 20,
  angebot: 600,
  problemMin: 20,
  problem: 600,
  ergebnisMin: 10,
  ergebnis: 400,
  beweise: 600,
  positionierung: 600,
} as const;

export const nutzenInput = z.object({
  betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
  branche: z.string().trim().max(LIMITS.branche),
  ort: z.string().trim().max(LIMITS.ort),
  zielgruppe: z.string().trim().min(1).max(LIMITS.zielgruppe),
  angebot: z.string().trim().min(LIMITS.angebotMin).max(LIMITS.angebot),
  problem: z.string().trim().min(LIMITS.problemMin).max(LIMITS.problem),
  ergebnis: z.string().trim().min(LIMITS.ergebnisMin).max(LIMITS.ergebnis),
  beweise: z.string().trim().max(LIMITS.beweise),
  positionierung: z.string().trim().max(LIMITS.positionierung),
});
export type NutzenInput = z.infer<typeof nutzenInput>;

export const bausteineSchema = z.object({
  websiteTitel: z.string().min(20).max(70),
  websiteUntertitel: z.string().min(40).max(160),
  googleBeschreibung: z.string().min(100).max(GOOGLE_MAX),
  instagramBio: z.string().min(30).max(150),
  einSatzAmTelefon: z.string().min(30).max(200),
});
export type Bausteine = z.infer<typeof bausteineSchema>;
export type BausteinKey = keyof Bausteine;
export const BAUSTEIN_KEYS = ["websiteTitel", "websiteUntertitel", "googleBeschreibung", "instagramBio", "einSatzAmTelefon"] as const satisfies readonly BausteinKey[];

export const nutzenOutput = z.object({
  kurz: z.string().min(20).max(90),
  mittel: z.string().min(60).max(220),
  lang: z.string().min(150).max(600),
  nutzen: z.array(z.string().min(10).max(160)).min(3).max(5),
  beweise: z.array(z.string().min(10).max(200)).min(1).max(4),
  bausteine: bausteineSchema,
});
export type NutzenOutput = z.infer<typeof nutzenOutput>;

/** Ziffernfolgen in einem Text, ohne Trennzeichen und ohne Listenmarken («1. Punkt»). Vorbild: tools/ideen-aus-website/generator.ts. */
export function numbersIn(text: string): string[] {
  const withoutListMarks = text.replace(/^\s*\d+[.)]\s+/gm, "");
  return (withoutListMarks.match(/\d+(?:[.,'’  ]\d+)*/g) ?? []).map((n) => n.replace(/[.,'’  ]/g, ""));
}

/**
 * Prüfung, die nur dieses Werkzeug kennt: keine Ziffer, die nicht in den Angaben steht (Betrieb, Branche, Ort,
 * Zielgruppe, Angebot, Problem, Ergebnis, Beweise, Positionierung), und die Google-Beschreibung höchstens
 * GOOGLE_MAX Zeichen. Gibt den Grund zurück («zahl», «google») oder null.
 */
export function checkNutzen(output: NutzenOutput, input: NutzenInput): string | null {
  if (Array.from(output.bausteine.googleBeschreibung).length > GOOGLE_MAX) return "google";
  const known = new Set(numbersIn(Object.values(input).join("\n")));
  for (const n of numbersIn(collectStrings(output).join("\n"))) if (!known.has(n)) return "zahl";
  return null;
}

const INSTRUCTION = `Schreib das Nutzenversprechen eines Schweizer KMU aus den Angaben.
- Aus Kundensicht: Sag, was die Kundschaft («zielgruppe») vom Betrieb hat, nicht, was der Betrieb über sich denkt. Konkret, ohne Superlative, ohne Werbesprache.
- Nenne Ort und Region des Betriebs («ort»), wo es passt. Fehlt der Ort, schreib den Platzhalter [Ort].
- Ziffern nur, wenn sie wörtlich in den Angaben stehen. Sonst schreib die Zahl als Wort oder lass sie weg.
- «kurz»: ein Satz für die Kopfzeile, 20 bis 90 Zeichen. «mittel»: zwei Sätze, 60 bis 220 Zeichen. «lang»: ein Absatz, 150 bis 600 Zeichen. Alle drei sagen dasselbe, nur ausführlicher.
- «nutzen»: 3 bis 5 Punkte, je 10 bis 160 Zeichen, jeder beginnt mit «Du bekommst» oder «Du hast» und beschreibt das Ergebnis aus «ergebnis» und «angebot» aus Sicht der Kundschaft.
- «beweise»: 1 bis 4 Punkte, je 10 bis 200 Zeichen, ausschliesslich aus «beweise» und den übrigen Angaben (Jahre, Referenzen, Garantie, Zahl der Projekte). Steht dort nichts Belegbares, schreib genau einen Punkt mit einem Platzhalter in eckigen Klammern, zum Beispiel [Zahl der Projekte seit der Gründung].
- «bausteine»: fertige Texte je Kanal. «websiteTitel»: Titel der Startseite, 20 bis 70 Zeichen, mit Angebot und Ort. «websiteUntertitel»: ein Satz unter dem Titel, 40 bis 160 Zeichen. «googleBeschreibung»: Beschreibung für das Google-Unternehmensprofil in der Wir-Form, 100 bis ${GOOGLE_MAX} Zeichen, mit Angebot, Ort und Kundschaft, ohne Link. «instagramBio»: 30 bis 150 Zeichen, kurze Zeilen, ohne Hashtags, ohne Emojis. «einSatzAmTelefon»: ein Satz, mit dem die Inhaberin am Telefon sagt, was der Betrieb für die Kundschaft tut, 30 bis 200 Zeichen, Wir-Form.
- Nimm die Positionierung («positionierung») als Hintergrund, wenn sie da ist; wiederhole sie nicht wörtlich.
Form: {"kurz": "…", "mittel": "…", "lang": "…", "nutzen": ["…"], "beweise": ["…"], "bausteine": {"websiteTitel": "…", "websiteUntertitel": "…", "googleBeschreibung": "…", "instagramBio": "…", "einSatzAmTelefon": "…"}}`;

export const nutzenGenerator = defineGenerator({
  slug: "nutzenversprechen",
  input: nutzenInput,
  output: nutzenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Angebot", i),
  maxTokens: 1300,
  temperature: 0.5,
  check: checkNutzen,
});

export { nutzenGenerator as generator };
export default nutzenGenerator;
