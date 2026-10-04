import { z } from "zod";
import { dataPrompt, defineGenerator } from "@/lib/generator";

// Generator des ICP-Builders (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem Server: nur zod,
// Strings und reine Funktionen. Die Angaben kommen aus dem Firmenprofil (Grunddaten) und fünf Feldern des Formulars;
// die Route /api/generate prüft Eingabe und Antwort mit denselben Schemas.

export const LIMITS = {
  angebot: { min: 20, max: 800 },
  besteKunden: { min: 20, max: 800 },
  einzugsgebiet: { max: 120 },
  auftrag: { max: 200 },
  nichtPassend: { max: 600 },
} as const;

export const MIN_KRITERIEN = 6;
export const MAX_KRITERIEN = 8;
export const MIN_PUNKTE = 1;
export const MAX_PUNKTE = 3;
/** Obergrenze der Summe aller Gewichte; mit 8 Kriterien zu 3 Punkten genau erreicht. */
export const MAX_PUNKTE_SUMME = 24;

export const icpInput = z.object({
  betrieb: z.string().trim().min(1).max(120),
  branche: z.string().trim().max(120),
  ort: z.string().trim().max(120),
  kanton: z.string().trim().max(120),
  /** Label-Text der Grösse («1 bis 9 Mitarbeitende»), nicht der Wert aus dem Profil. */
  groesse: z.string().trim().max(120),
  angebot: z.string().trim().min(LIMITS.angebot.min).max(LIMITS.angebot.max),
  besteKunden: z.string().trim().min(LIMITS.besteKunden.min).max(LIMITS.besteKunden.max),
  einzugsgebiet: z.string().trim().max(LIMITS.einzugsgebiet.max),
  auftrag: z.string().trim().max(LIMITS.auftrag.max),
  nichtPassend: z.string().trim().max(LIMITS.nichtPassend.max),
});
export type IcpInput = z.infer<typeof icpInput>;

const punkt = z.string().min(10).max(160);

export const kriteriumSchema = z.object({
  kriterium: z.string().min(5).max(90),
  punkte: z.number().int().min(MIN_PUNKTE).max(MAX_PUNKTE),
  warum: z.string().min(10).max(160),
});
export type Kriterium = z.infer<typeof kriteriumSchema>;

export const icpOutput = z.object({
  segmentName: z.string().min(5).max(60),
  beschreibung: z.string().min(80).max(500),
  merkmale: z.array(punkt).min(4).max(7),
  ausloeser: z.array(punkt).min(3).max(5),
  einwaende: z.array(punkt).min(2).max(4),
  signale: z.array(punkt).min(3).max(6),
  nichtIdeal: z.array(punkt).min(2).max(4),
  punktekarte: z.array(kriteriumSchema).min(MIN_KRITERIEN).max(MAX_KRITERIEN),
});
export type IcpOutput = z.infer<typeof icpOutput>;

/** Ziffernfolgen in einem Text, ohne Trennzeichen und ohne Listenmarken («1. Punkt»). Vorbild: tools/ideen-aus-website/generator.ts. */
export function numbersIn(text: string): string[] {
  const withoutListMarks = text.replace(/^\s*\d+[.)]\s+/gm, "");
  return (withoutListMarks.match(/\d+(?:[.,'’  ]\d+)*/g) ?? []).map((n) => n.replace(/[.,'’  ]/g, ""));
}

/** Summe der Gewichte der Punktekarte: die Punktzahl, die eine Anfrage höchstens erreicht. */
export function punkteSumme(output: Pick<IcpOutput, "punktekarte">): number {
  return output.punktekarte.reduce((sum, k) => sum + k.punkte, 0);
}

/** Alle Texte eines Entwurfs; die Punkte der Punktekarte sind Zahlen im JSON und zählen hier nicht. */
export function outputTexts(output: IcpOutput): string[] {
  return [
    output.segmentName,
    output.beschreibung,
    ...output.merkmale,
    ...output.ausloeser,
    ...output.einwaende,
    ...output.signale,
    ...output.nichtIdeal,
    ...output.punktekarte.flatMap((k) => [k.kriterium, k.warum]),
  ];
}

/**
 * Prüfung, die nur dieses Werkzeug kennt: keine Ziffer in den Texten, die nicht in den Angaben steht (auch nicht in
 * «kriterium» und «warum»), und die Summe der Punkte höchstens MAX_PUNKTE_SUMME.
 * Gibt den Grund zurück («zahl», «punkte») oder null.
 */
export function checkIcp(output: IcpOutput, input: IcpInput): string | null {
  const known = new Set(
    numbersIn(
      [input.betrieb, input.branche, input.ort, input.kanton, input.groesse, input.angebot, input.besteKunden, input.einzugsgebiet, input.auftrag, input.nichtPassend].join("\n"),
    ),
  );
  for (const n of numbersIn(outputTexts(output).join("\n"))) if (!known.has(n)) return "zahl";
  if (punkteSumme(output) > MAX_PUNKTE_SUMME) return "punkte";
  return null;
}

const INSTRUCTION = `Schreib ein Idealkundenprofil (ICP) für ein Schweizer KMU aus den Angaben zum Betrieb.
- Sicht des Betriebs: Beschreib die Kundschaft, mit der die Arbeit am besten läuft, die wiederkommt oder weiterempfiehlt. Leite alles aus «angebot», «besteKunden», «auftrag» und «nichtPassend» ab. Konkret, keine allgemeinen Sätze, die auf jeden Betrieb passen.
- «segmentName»: ein kurzer Name für das Segment, so wie der Betrieb es selbst nennen würde, zum Beispiel «Eigentümer älterer Einfamilienhäuser in der Region».
- «beschreibung»: zwei bis vier Sätze, wer diese Kundschaft ist und warum sie zum Betrieb passt.
- «merkmale»: vier bis sieben Punkte, wer sie sind: Art des Betriebs oder Haushalts, Grösse, Situation, Ort oder Region («einzugsgebiet»).
- «ausloeser»: drei bis fünf Punkte, wann sie kaufen: Anlass, Jahreszeit, Ereignis, Auslöser im Alltag.
- «einwaende»: zwei bis vier Punkte, was sie zögern lässt, bevor sie anfragen oder zusagen.
- «signale»: drei bis sechs Punkte, woran der Betrieb eine passende Anfrage erkennt: Wortwahl, Anliegen, Zeitpunkt, Weg der Anfrage.
- «nichtIdeal»: zwei bis vier Punkte, welche Anfragen nicht passen. Nimm «nichtPassend» auf, wenn dort etwas steht.
- «punktekarte»: sechs bis acht Kriterien, mit denen der Betrieb eine neue Anfrage bewertet. «punkte» ist das Gewicht als ganze Zahl 1, 2 oder 3 (3 = entscheidend, 2 = wichtig, 1 = schön zu haben). Nicht alle Kriterien gleich gewichten; höchstens drei Kriterien mit drei Punkten. «warum» begründet das Gewicht in einem Satz.
- Ziffern nur, wenn sie wörtlich in den Angaben stehen (zum Beispiel ein Betrag aus «auftrag»). Fehlende Beträge, Jahre oder Mengen als Wort oder als Platzhalter wie [Betrag] oder [Jahre]. In «kriterium» und «warum» keine Ziffern.
- Sprich den Betrieb mit «du» an, wo es natürlich ist («Du erkennst …»). Keine Fachwörter aus dem Marketing, keine englischen Wörter, wo ein deutsches reicht.
Form: {"segmentName": "…", "beschreibung": "…", "merkmale": ["…"], "ausloeser": ["…"], "einwaende": ["…"], "signale": ["…"], "nichtIdeal": ["…"], "punktekarte": [{"kriterium": "…", "punkte": 3, "warum": "…"}]}`;

export const icpGenerator = defineGenerator({
  slug: "icp-builder",
  input: icpInput,
  output: icpOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Betrieb", i),
  maxTokens: 1400,
  temperature: 0.4,
  check: checkIcp,
});

export { icpGenerator as generator };
export default icpGenerator;
