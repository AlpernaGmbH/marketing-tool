import { z } from "zod";
import { dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";

// Generator des Werkzeugs «Themensäulen» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem
// Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Formular und dem Firmenprofil; die Route
// /api/generate prüft Eingabe und Antwort mit denselben Schemas.

export const KANAL_KEYS = ["instagram", "facebook", "linkedin", "google", "newsletter", "website"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];

/** Namen der Kanäle, wie sie im Formular, im Dokument und im Wochenplan der KI stehen. */
export const KANAL_LABELS: Record<KanalKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  google: "Google-Beitrag",
  newsletter: "Newsletter",
  website: "Website",
};

export const BEITRAEGE_KEYS = ["1", "2", "3", "5"] as const;
export type BeitraegeKey = (typeof BEITRAEGE_KEYS)[number];

export const ZIEL_KEYS = ["vertrauen", "sichtbarkeit", "anfragen", "bindung"] as const;
export type ZielKey = (typeof ZIEL_KEYS)[number];

export const TAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export type Tag = (typeof TAGE)[number];

export const MIN_SAEULEN = 4;
export const MAX_SAEULEN = 5;
/** So weit darf die Summe der Anteile von 100 abweichen (Rundung der KI). */
export const ANTEIL_TOLERANZ = 2;

export const LIMITS = {
  betrieb: 120,
  branche: 120,
  ort: 80,
  positionierung: 600,
  primaersegment: 200,
  persona: 60,
  personas: 5,
  angebotMin: 20,
  angebot: 800,
  alltag: 400,
} as const;

export const saeulenInput = z.object({
  betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
  branche: z.string().trim().max(LIMITS.branche),
  ort: z.string().trim().max(LIMITS.ort),
  positionierung: z.string().trim().max(LIMITS.positionierung),
  primaersegment: z.string().trim().max(LIMITS.primaersegment),
  personas: z.array(z.string().trim().min(1).max(LIMITS.persona)).max(LIMITS.personas),
  angebot: z.string().trim().min(LIMITS.angebotMin).max(LIMITS.angebot),
  alltag: z.string().trim().max(LIMITS.alltag),
  kanaele: z.array(z.enum(KANAL_KEYS)).min(1).max(KANAL_KEYS.length),
  beitraegeProWoche: z.enum(BEITRAEGE_KEYS),
});
export type SaeulenInput = z.infer<typeof saeulenInput>;

export const saeuleSchema = z.object({
  name: z.string().min(3).max(40),
  beschreibung: z.string().min(40).max(300),
  ziel: z.enum(ZIEL_KEYS),
  beispiele: z.array(z.string().min(10).max(160)).min(3).max(5),
  /** Anteil an allen Beiträgen in Prozent; die KI darf die Zahl auch als Text liefern («30»). */
  anteil: z.coerce.number().int().min(10).max(50),
});
export type Saeule = z.infer<typeof saeuleSchema>;

export const wochenplanEintrag = z.object({
  tag: z.enum(TAGE),
  saeule: z.string().min(3).max(40),
  kanal: z.string().min(3).max(40),
});
export type WochenplanEintrag = z.infer<typeof wochenplanEintrag>;

export const saeulenOutput = z.object({
  saeulen: z.array(saeuleSchema).min(MIN_SAEULEN).max(MAX_SAEULEN),
  rhythmus: z.object({
    satz: z.string().min(40).max(300),
    wochenplan: z.array(wochenplanEintrag).min(1).max(5),
  }),
  niemals: z.array(z.string().min(10).max(160)).min(2).max(4),
});
export type SaeulenOutput = z.infer<typeof saeulenOutput>;

export { numbersIn };

/** Kanalname für den Vergleich: klein, ohne Bindestrich und Leerzeichen («Google-Beitrag» und «Google Beitrag» sind gleich). */
export function kanalKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «anteil»: die Anteile summieren nicht auf 100 (± ANTEIL_TOLERANZ);
 * «wochenplan»: der Wochenplan hat nicht genau so viele Einträge wie Beiträge pro Woche;
 * «kanal»: ein Eintrag im Wochenplan nennt einen Kanal, der nicht gewählt ist (Vergleich über Name oder Schlüssel, klein);
 * «zahl»: eine Ziffer in Name, Beschreibung, Beispielen, Rhythmus-Satz oder «niemals», die nicht in den Angaben steht
 * (die Zahl der Beiträge pro Woche zählt zu den Angaben).
 */
export function checkSaeulen(output: SaeulenOutput, input: SaeulenInput): string | null {
  const summe = output.saeulen.reduce((acc, s) => acc + s.anteil, 0);
  if (Math.abs(summe - 100) > ANTEIL_TOLERANZ) return "anteil";
  if (output.rhythmus.wochenplan.length !== Number(input.beitraegeProWoche)) return "wochenplan";
  const erlaubt = new Set(input.kanaele.flatMap((k) => [kanalKey(KANAL_LABELS[k]), kanalKey(k)]));
  for (const e of output.rhythmus.wochenplan) if (!erlaubt.has(kanalKey(e.kanal))) return "kanal";
  const known = new Set(
    numbersIn([input.betrieb, input.branche, input.ort, input.positionierung, input.primaersegment, ...input.personas, input.angebot, input.alltag, input.beitraegeProWoche].join("\n")),
  );
  const texte = [
    ...output.saeulen.flatMap((s) => [s.name, s.beschreibung, ...s.beispiele]),
    output.rhythmus.satz,
    ...output.niemals,
  ];
  for (const n of numbersIn(texte.join("\n"))) if (!known.has(n)) return "zahl";
  return null;
}

const INSTRUCTION = `Schreib die Themensäulen eines Schweizer KMU aus den Angaben: ${MIN_SAEULEN} bis ${MAX_SAEULEN} feste Themenfelder, aus denen alle Beiträge des Betriebs kommen.
- Jede Säule kommt konkret aus dem Angebot («angebot») oder aus dem Alltag («alltag») des Betriebs. Keine allgemeinen Säulen wie «Tipps» oder «Branchenwissen» ohne Bezug zum Betrieb.
- Mindestens eine Säule zeigt die Region und die Menschen: Ort, Team, Kundschaft, Anlässe in der Gemeinde. Fehlt der Ort, schreib den Platzhalter [Ort].
- «name»: ein kurzer Begriff, 3 bis 40 Zeichen. «beschreibung»: 40 bis 300 Zeichen, worum es geht und warum es die Kundschaft interessiert. «ziel»: eines von vertrauen, sichtbarkeit, anfragen, bindung.
- «beispiele»: 3 bis 5 fertige Beitragsideen je Säule, je 10 bis 160 Zeichen, so konkret, dass der Betrieb sie diese Woche umsetzen kann. Kennst du einen Namen oder Anlass nicht, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Name der Mitarbeiterin].
- «anteil»: ganze Zahl von 10 bis 50, der Anteil der Säule an allen Beiträgen in Prozent. Die Summe aller Anteile ist genau 100.
- «rhythmus.satz»: 40 bis 300 Zeichen, wie sich die Säulen auf die Woche verteilen, mit der Zahl der Beiträge aus «beitraegeProWoche».
- «rhythmus.wochenplan»: genau so viele Einträge, wie «beitraegeProWoche» sagt (1, 2, 3 oder 5). Je Eintrag «tag» (Montag bis Sonntag), «saeule» (der Name einer Säule aus «saeulen») und «kanal» (der Name eines gewählten Kanals). Die Schlüssel in «kanaele» bedeuten: instagram (Instagram), facebook (Facebook), linkedin (LinkedIn), google (Google-Beitrag), newsletter (Newsletter), website (Website). Schreib in «kanal» den Namen, nicht den Schlüssel. Kanäle, die nicht in «kanaele» stehen, kommen nicht vor.
- «niemals»: 2 bis 4 Beitragsarten, die nicht zu diesem Betrieb passen, je 10 bis 160 Zeichen, mit kurzem Grund.
- Nimm Positionierung («positionierung»), Zielgruppe («primaersegment») und Personas («personas») als Hintergrund, wenn sie da sind; wiederhole sie nicht wörtlich.
- Schreib so, dass Kundschaft es versteht: keine Fachwörter aus dem Marketing, keine englischen Wörter, wo ein deutsches reicht.
- Ziffern nur, wenn sie wörtlich in den Angaben stehen (dazu zählt die Zahl der Beiträge pro Woche). Sonst schreib die Zahl als Wort oder lass sie weg. In «anteil» steht die Zahl als JSON-Zahl, nicht im Text.
Form: {"saeulen": [{"name": "…", "beschreibung": "…", "ziel": "vertrauen", "beispiele": ["…", "…", "…"], "anteil": 30}], "rhythmus": {"satz": "…", "wochenplan": [{"tag": "Montag", "saeule": "…", "kanal": "Instagram"}]}, "niemals": ["…", "…"]}`;

export const saeulenGenerator = defineGenerator({
  slug: "inhalte-saeulen",
  input: saeulenInput,
  output: saeulenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Betrieb", i),
  maxTokens: 1600,
  temperature: 0.5,
  check: checkSaeulen,
});

export { saeulenGenerator as generator };
export default saeulenGenerator;
