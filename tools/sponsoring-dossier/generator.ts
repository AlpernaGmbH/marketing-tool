import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";
import { hasDuForm } from "@/tools/markenplattform/generator";

// Generator des Werkzeugs «Sponsoring-Dossier» (Klasse C mit freiwilligem KI-Teil, docs/TOOL-BAUEN.md Abschnitt 4).
// Läuft im Browser und auf dem Server: nur zod, Strings und reine Funktionen. Die KI schreibt drei Absätze für das
// Dossier; das Dossier selbst entsteht ohne KI in logic.ts. Die Route /api/generate prüft Eingabe und Antwort mit
// denselben Schemas. Kontaktdaten, Referenzen, Website und Vereinsfarbe gehören nicht zur Eingabe: Sie bleiben im Browser.

export const LIMITS = {
  verein: 120,
  ort: 120,
  stichworteMin: 10,
  stichworte: 600,
  zielgruppeMin: 10,
  zielgruppe: 300,
  zahlenMax: 8,
  zahlLabel: 60,
  zahlWert: 1_000_000_000,
  paketeMin: 1,
  paketeMax: 3,
  paketName: 40,
  paketPreisMin: 50,
  paketPreisMax: 100_000,
  leistungenMax: 12,
  leistung: 120,
} as const;

export const sponsoringInput = z.object({
  verein: z.string().trim().min(1).max(LIMITS.verein),
  ort: z.string().trim().max(LIMITS.ort),
  stichworte: z.string().trim().min(LIMITS.stichworteMin).max(LIMITS.stichworte),
  zielgruppe: z.string().trim().min(LIMITS.zielgruppeMin).max(LIMITS.zielgruppe),
  zahlen: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(LIMITS.zahlLabel),
        wert: z.number().int().min(0).max(LIMITS.zahlWert),
      }),
    )
    .max(LIMITS.zahlenMax),
  pakete: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(LIMITS.paketName),
        preis: z.number().int().min(LIMITS.paketPreisMin).max(LIMITS.paketPreisMax),
        leistungen: z.array(z.string().trim().min(1).max(LIMITS.leistung)).min(1).max(LIMITS.leistungenMax),
      }),
    )
    .min(LIMITS.paketeMin)
    .max(LIMITS.paketeMax),
});
export type SponsoringInput = z.infer<typeof sponsoringInput>;

export const sponsoringOutput = z.object({
  portraet: z.string().min(150).max(600),
  warum: z.string().min(120).max(500),
  dank: z.string().min(80).max(300),
});
export type SponsoringOutput = z.infer<typeof sponsoringOutput>;
export const KI_KEYS = ["portraet", "warum", "dank"] as const satisfies readonly (keyof SponsoringOutput)[];

export { hasDuForm, numbersIn };

/** Alle Angaben, aus denen der Entwurf Zahlen nehmen darf: Texte, Zahlen der Kennzahlen, Preise, Leistungen. */
function angabenText(input: SponsoringInput): string {
  return [
    input.verein,
    input.ort,
    input.stichworte,
    input.zielgruppe,
    ...input.zahlen.map((z) => `${z.label} ${z.wert}`),
    ...input.pakete.flatMap((p) => [p.name, String(p.preis), ...p.leistungen]),
  ].join("\n");
}

/**
 * Rechtliche Wörter: Steuern, Abzüge, Spenden, Gemeinnützigkeit, Verträge, Gesetze. Das Dossier macht keine Rechtsaussagen
 * (CLAUDE.md, Harte Regel 8): Wer ein Sponsoring von der Steuer abziehen kann, sagt keine KI. Die Schritte des Dossiers («Vertrag auf
 * Papier») stehen als fester Text in logic.ts, nicht in der Antwort der KI.
 */
export const RECHT_RE = /steuer(?!t\b|te[nmrs]?\b|ung)|abzug|abzüg|abzieh|absetz|spende|gemeinnütz|vertrag|rechtlich|gesetz(?!t)|bescheinig/iu;

/** Wirkungsversprechen und Superlative: «sicher mehr Kundschaft», «Rendite», «der beste Sponsor der Region». */
export const WIRKUNG_RE =
  /(?<![\p{L}])(?:sicher(?:lich)?\s+(?:mehr|neue|höhere|zusätzliche)|(?:mehr|neue|zusätzliche)\s+(?:kundschaft|kunden|aufträge|umsatz|anfragen)|rendite|umsatzsteigerung|umsatzplus|beste[nrms]?|grösste[nrms]?|schönste[nrms]?|einzigartig\p{L}*|unschlagbar\p{L}*|sensationell\p{L}*|erstklassig\p{L}*)(?![\p{L}])/iu;

/** Wendungen, die wie ein Superlativ aussehen und keiner sind: «mit bestem Dank», «der grösste Teil». */
const KEIN_SUPERLATIV_RE = /(?<![\p{L}])(?:beste[nm]?\s+(?:dank|grüss\p{L}*)|grösste[nrms]?\s+(?:teil|mehrheit))(?![\p{L}])/giu;

/** Der erste Treffer der Regel, der nicht wörtlich in den Angaben steht (was die Person selbst schreibt, ist kein Fehler des Entwurfs). */
function fremderTreffer(re: RegExp, texte: string[], angabenLower: string): string | null {
  const global = new RegExp(re.source, `${re.flags}g`);
  for (const t of texte) {
    for (const m of t.matchAll(global)) if (!angabenLower.includes(m[0].toLowerCase())) return m[0];
  }
  return null;
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «zahl»: eine Zahl in einem der drei Absätze, die nicht in den Angaben steht (Ziffern und Zahlwörter ab «zwanzig»; die Zahl der
 * Pakete darf vorkommen);
 * «anrede»: ein du, dich, dir oder dein in einem Absatz (das Dossier richtet sich an Sponsoren, nicht an den Verein);
 * «recht»: eine Rechtsaussage (Steuer, Abzug, Spende, Gemeinnützigkeit, Vertrag, Gesetz), die nicht in den Angaben steht;
 * «wirkung»: ein Wirkungsversprechen oder ein Superlativ («sicher mehr Kundschaft», «der beste Sponsor»), der nicht in den Angaben steht.
 */
export function checkSponsoring(output: SponsoringOutput, input: SponsoringInput): string | null {
  const texte = collectStrings(output);
  const known = new Set([...numbersIn(angabenText(input)), String(input.pakete.length)]);
  for (const n of numbersIn(texte.join("\n"))) if (!known.has(n)) return "zahl";
  if (texte.some((t) => hasDuForm(t))) return "anrede";
  const angaben = angabenText(input).toLowerCase();
  if (fremderTreffer(RECHT_RE, texte, angaben)) return "recht";
  if (fremderTreffer(WIRKUNG_RE, texte.map((t) => t.replace(KEIN_SUPERLATIV_RE, " ")), angaben)) return "wirkung";
  return null;
}

const INSTRUCTION = `Schreib drei Absätze für das Sponsoring-Dossier eines Schweizer Vereins. Das Dossier liest ein Betrieb, der überlegt, den Verein zu unterstützen. Nüchtern, konkret, aus dem Alltag eines Schweizer Vereins: Training, Heimspiele, Dorffest, Vorstand, Freiwillige.
- Die Anrede der Regeln oben (Du-Form) gilt hier nicht. Die Leser sind mögliche Sponsoren: Schreib in der Wir-Form des Vereins oder in der dritten Person («der Verein»). Sprich den Betrieb nie mit du, dich, dir oder dein an. Wenn du den Betrieb ansprichst, dann in der Sie-Form oder neutral («Ihr Betrieb», «Unterstützende Betriebe»).
- «portraet»: 150 bis 600 Zeichen. Wer der Verein ist und was er tut, aus «verein», «ort» und «stichworte». Zahlen aus «zahlen» nur, wenn sie das Bild tragen.
- «warum»: 120 bis 500 Zeichen. Warum ein Sponsoring bei diesem Verein wirkt: Wer erreicht wird (aus «zielgruppe» und «zahlen»), und was die Pakete («pakete») dem Betrieb bieten. Nenne Pakete nur mit Namen, Preis und Leistungen aus den Angaben.
- «dank»: 80 bis 300 Zeichen. Ein Dank an die Betriebe, die den Verein schon unterstützen oder es erwägen, und der Hinweis auf den nächsten Schritt: ein Gespräch mit dem Verein. Keine Namen von Betrieben, keine Zusagen, die nicht in den Angaben stehen.
- Zahlen nur, wenn sie in den Angaben stehen (Zahlen, Preise, Namen, Stichworte, Leistungen), als Ziffer oder als Wort; «fünfzig» oder «hundert» zählen genauso wie 50 oder 100. Die Zahl der Pakete darfst du nennen. Rechne nichts zusammen, runde nichts und leite keine Anteile oder Prozente ab. Sonst lass die Zahl weg oder setz einen Platzhalter.
- Keine Superlative, keine Versprechen über Wirkung oder Reichweite («garantiert», «sicher mehr Kundschaft», «Rendite»). Beschreibe, was der Verein bietet, nicht, was der Betrieb gewinnt.
- Erfinde keine Partner, Sponsoren, Erfolge, Gründungsjahre, Ligen oder Anlässe. Fehlt eine wichtige Angabe, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Gründungsjahr].
- Keine Aussagen über Steuern, Abzüge, Spenden, Gemeinnützigkeit, Verträge oder Gesetze. Der Verein klärt das im Gespräch.
Form: {"portraet": "…", "warum": "…", "dank": "…"}`;

export const sponsoringGenerator = defineGenerator({
  slug: "sponsoring-dossier",
  input: sponsoringInput,
  output: sponsoringOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Verein", i),
  maxTokens: 900,
  temperature: 0.5,
  check: checkSponsoring,
});

export { sponsoringGenerator as generator };
export default sponsoringGenerator;
