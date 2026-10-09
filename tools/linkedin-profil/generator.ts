import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";
import { findingsOf } from "@/tools/textcheck/logic";
import { nenntAngabe } from "@/tools/story-post/generator";

// Generator des Werkzeugs «LinkedIn-Profil-Score» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4): Ein Aufruf liefert drei Headline-Vorschläge und einen
// neuen Anfang für den Info-Text, nur aus den Angaben der Person. Der Punktwert kommt nicht von der KI, sondern aus festen Regeln (logic.ts).
// Läuft im Browser und auf dem Server: nur zod, Strings und reine Funktionen. Die Route /api/generate prüft Eingabe und Antwort mit denselben Schemas.

export const LIMITS = {
  betrieb: 120,
  branche: 120,
  zielgruppe: 80,
  headline: 300,
  about: 2600,
  hinweise: 8,
  hinweis: 160,
} as const;
/** Richtwert für die Länge einer Headline; derselbe Wert gilt für die Regeln in logic.ts. */
export const HEADLINE_MAX = 220;
export const INFO_ANFANG = { min: 80, max: 600 } as const;
export const HEADLINES = 3;

export const linkedinInput = z
  .object({
    betrieb: z.string().trim().max(LIMITS.betrieb),
    branche: z.string().trim().max(LIMITS.branche),
    zielgruppe: z.string().trim().max(LIMITS.zielgruppe),
    headline: z.string().trim().max(LIMITS.headline),
    about: z.string().trim().max(LIMITS.about),
    /** Was die festen Regeln bei den eingefügten Texten bemängeln, als kurze Sätze. */
    hinweise: z.array(z.string().trim().min(1).max(LIMITS.hinweis)).max(LIMITS.hinweise),
  })
  .refine((v) => v.headline.length + v.about.length > 0, { message: "Headline oder Info-Text fehlt" });
export type LinkedinInput = z.infer<typeof linkedinInput>;

export const linkedinOutput = z.object({
  headlines: z
    .array(
      z.object({
        text: z.string().trim().min(20).max(HEADLINE_MAX),
        grund: z.string().trim().min(10).max(140),
      }),
    )
    .length(HEADLINES),
  infoAnfang: z.string().trim().min(INFO_ANFANG.min).max(INFO_ANFANG.max),
});
export type LinkedinOutput = z.infer<typeof linkedinOutput>;

// ---- Prüfung -----------------------------------------------------------------------------------

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/** Alle Angaben der Person als ein Text; daraus müssen Wörter und Ziffern der Vorschläge stammen. */
function angabenText(input: LinkedinInput): string {
  return [input.betrieb, input.branche, input.zielgruppe, input.headline, input.about].join("\n");
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «doppelt» (zwei Headlines gleich oder eine gleich der heutigen), «zahl» (Ziffernfolge, die nicht in den Angaben steht),
 * «erfunden» (ein Vorschlag nennt kein Wort der Angaben), «platzhalter» (eckige Klammer, die nicht in den Angaben steht),
 * «ichbin» (der Anfang beginnt mit «Ich bin» oder «Mein Name»), «floskel» (eine Floskel aus dem Regelsatz des Textchecks).
 */
export function checkLinkedin(output: LinkedinOutput, input: LinkedinInput): string | null {
  const heute = norm(input.headline);
  const seen = new Set<string>();
  for (const h of output.headlines) {
    const k = norm(h.text);
    if (seen.has(k) || (heute !== "" && k === heute)) return "doppelt";
    seen.add(k);
  }

  const angaben = angabenText(input);
  const known = new Set(numbersIn(angaben));
  for (const n of numbersIn(collectStrings(output).join("\n"))) if (!known.has(n)) return "zahl";

  const vorschlaege = [...output.headlines.map((h) => h.text), output.infoAnfang];
  if (vorschlaege.some((t) => !nenntAngabe(t, angaben))) return "erfunden";

  const gegeben = new Set((angaben.match(/\[[^\]\n]{1,40}\]/g) ?? []).map(norm));
  for (const s of collectStrings(output)) for (const p of s.match(/\[[^\]\n]{1,40}\]/g) ?? []) if (!gegeben.has(norm(p))) return "platzhalter";

  if (/^[\s"«»'„“”]*(?:ich bin|mein name)(?![\p{L}])/iu.test(output.infoAnfang)) return "ichbin";

  if (findingsOf(vorschlaege.join("\n")).some((f) => f.kind === "floskel")) return "floskel";
  return null;
}

// ---- Aufgabe -----------------------------------------------------------------------------------

const INSTRUCTION = `Du verbesserst Headline und Anfang des Info-Texts eines LinkedIn-Profils eines Schweizer Betriebs, ohne etwas dazuzuerfinden. «headline» und «about» sind die heutigen Texte der Person (einer von beiden kann leer sein), «hinweise» nennt, was nach festen Regeln auffällt.
- Antworte mit genau drei Headline-Vorschlägen (je ein Satz, 20 bis 220 Zeichen, er nennt, wem die Person wobei hilft) und einem neuen Anfang für den Info-Text (zwei bis vier Sätze, 80 bis 600 Zeichen), der mit dem Nutzen für die Kundschaft beginnt und nicht mit «Ich bin» oder «Mein Name».
- Alle Tatsachen stehen in den Angaben (Betrieb, Branche, Zielgruppe, Headline, Info-Text). Erfinde keine Zahlen, Orte, Referenzen oder Auszeichnungen. Ziffern nur, wenn sie wörtlich in den Angaben stehen. Fehlt die Angabe für einen Beleg, lass den Beleg weg. Setz keine Platzhalter in eckigen Klammern, die nicht schon in den Angaben stehen.
- Schreib wie die Person selbst: in der Ich-Form, oder in der Wir-Form, wenn die Angaben so schreiben. Headlines dürfen neutral sein. Im Info-Text sprichst du die Kundschaft mit «du» an, ausser der heutige Text siezt: dann «Sie».
- Die drei Headlines unterscheiden sich im Aufbau (zum Beispiel «Ich helfe … bei …», «… für …: …», eine Aussage mit Beleg) und keine gleicht der heutigen Headline. In «grund» steht je ein kurzer Satz (10 bis 140 Zeichen), was der Vorschlag besser macht.
- Berücksichtige die «hinweise»: Was dort bemängelt wird, machst du besser.
- Keine Floskeln, keine Hashtags, keine Emojis.
Form: {"headlines": [{"text": "…", "grund": "…"}, {"text": "…", "grund": "…"}, {"text": "…", "grund": "…"}], "infoAnfang": "…"}`;

export const linkedinGenerator = defineGenerator({
  slug: "linkedin-profil",
  input: linkedinInput,
  output: linkedinOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum LinkedIn-Profil", i),
  maxTokens: 1100,
  temperature: 0.5,
  check: checkLinkedin,
});

export { linkedinGenerator as generator };
export default linkedinGenerator;
