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

/** Alle Angaben, aus denen der Entwurf Ziffern nehmen darf: Texte, Zahlen der Kennzahlen, Preise, Leistungen. */
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
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «zahl»: eine Ziffernfolge in einem der drei Absätze, die nicht in den Angaben steht;
 * «anrede»: ein du, dich, dir oder dein in einem Absatz (das Dossier richtet sich an Sponsoren, nicht an den Verein).
 */
export function checkSponsoring(output: SponsoringOutput, input: SponsoringInput): string | null {
  const texte = collectStrings(output);
  const known = new Set(numbersIn(angabenText(input)));
  for (const n of numbersIn(texte.join("\n"))) if (!known.has(n)) return "zahl";
  if (texte.some((t) => hasDuForm(t))) return "anrede";
  return null;
}

const INSTRUCTION = `Schreib drei Absätze für das Sponsoring-Dossier eines Schweizer Vereins. Das Dossier liest ein Betrieb, der überlegt, den Verein zu unterstützen. Nüchtern, konkret, aus dem Alltag eines Schweizer Vereins: Training, Heimspiele, Dorffest, Vorstand, Freiwillige.
- Die Anrede der Regeln oben (Du-Form) gilt hier nicht. Die Leser sind mögliche Sponsoren: Schreib in der Wir-Form des Vereins oder in der dritten Person («der Verein»). Sprich den Betrieb nie mit du, dich, dir oder dein an. Wenn du den Betrieb ansprichst, dann in der Sie-Form oder neutral («Ihr Betrieb», «Unterstützende Betriebe»).
- «portraet»: 150 bis 600 Zeichen. Wer der Verein ist und was er tut, aus «verein», «ort» und «stichworte». Zahlen aus «zahlen» nur, wenn sie das Bild tragen.
- «warum»: 120 bis 500 Zeichen. Warum ein Sponsoring bei diesem Verein wirkt: Wer erreicht wird (aus «zielgruppe» und «zahlen»), und was die Pakete («pakete») dem Betrieb bieten. Nenne Pakete nur mit Namen, Preis und Leistungen aus den Angaben.
- «dank»: 80 bis 300 Zeichen. Ein Dank an die Betriebe, die den Verein schon unterstützen oder es erwägen, und der Hinweis auf den nächsten Schritt: ein Gespräch mit dem Verein. Keine Namen von Betrieben, keine Zusagen, die nicht in den Angaben stehen.
- Ziffern nur, wenn sie wörtlich in den Angaben stehen (Zahlen, Preise, Namen, Stichworte). Sonst schreib die Zahl als Wort oder lass sie weg. Rechne nichts zusammen und runde nichts.
- Keine Superlative, keine Versprechen über Wirkung oder Reichweite («garantiert», «sicher mehr Kundschaft»). Beschreibe, was der Verein bietet, nicht, was der Betrieb gewinnt.
- Erfinde keine Partner, Sponsoren, Erfolge, Gründungsjahre, Ligen oder Anlässe. Fehlt eine wichtige Angabe, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Gründungsjahr].
- Keine Aussagen über Steuern, Abzüge oder Verträge.
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
