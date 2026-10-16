import { z } from "zod";
import { typoCH } from "@/lib/ch";
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

/**
 * Kanalname für den Vergleich: klein, ohne Bindestrich, Leerzeichen und Satzzeichen («Google-Beitrag» und «Google Beitrag»
 * sind gleich). Ein angehängtes «-Kanal», «-Profil», «-Seite», «-Account» oder «-Konto» und der Zusatz «(neu)» fallen weg
 * («Instagram-Kanal»), ein Schrägstrich gilt als «oder».
 */
export function kanalKey(name: string): string {
  return name
    .replace(/\s*\(neu\)\s*$/i, "")
    .replace(/\s*\/\s*/g, " oder ")
    .toLowerCase()
    .replace(/[-\s](?:kanal|profile?|seite|account|konto)$/u, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Name für den Vergleich: Schweizer Schreibweise, klein, Leerraum zu einem Leerzeichen (Säulennamen). */
export function normName(s: string): string {
  return typoCH(s).toLowerCase().replace(/\s+/g, " ").trim();
}

// ---- Form der Antwort vor der Prüfung ------------------------------------------------------------

/** Der Wert aus der Liste, der `v` ohne Gross/Klein und Leerraum gleicht; sonst `v` unverändert. */
function ausListe(v: unknown, liste: readonly string[]): unknown {
  if (typeof v !== "string") return v;
  const k = v.trim().toLowerCase();
  return liste.find((x) => x.toLowerCase() === k) ?? v;
}

/** Eine Anzahl als Zahl: «30» und «30 %» gelten als 30; alles andere bleibt, wie es ist. */
function alsZahl(v: unknown): unknown {
  if (typeof v === "string" && /^\s*\d+(?:[.,]\d+)?\s*%?\s*$/.test(v)) return Number(v.replace("%", "").replace(",", ".").trim());
  return v;
}

/** Die Summe der Anteile, die als Rundung der KI gilt und auf 100 gebracht wird (Grenzen: keine Rundung mehr, sondern ein falscher Entwurf). */
export const ANTEIL_SKALIERUNG = { min: 50, max: 150 } as const;

/**
 * Bringt ganze Zahlen auf die Summe 100, im Verhältnis der Werte (Verfahren des grössten Rests). Gibt die Werte unverändert
 * zurück, wenn die Summe schon 100 ist oder ausserhalb von ANTEIL_SKALIERUNG liegt.
 */
export function aufHundert(anteile: readonly number[]): number[] {
  const summe = anteile.reduce((a, b) => a + b, 0);
  if (summe === 100 || summe < ANTEIL_SKALIERUNG.min || summe > ANTEIL_SKALIERUNG.max) return [...anteile];
  const exakt = anteile.map((a) => (a * 100) / summe);
  const ganz = exakt.map(Math.floor);
  let rest = 100 - ganz.reduce((a, b) => a + b, 0);
  const reihenfolge = exakt.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of reihenfolge) {
    if (rest <= 0) break;
    ganz[i] += 1;
    rest -= 1;
  }
  return ganz;
}

/**
 * Formt die rohe Antwort der KI vor dem Schema: «ziel» und «tag» ohne Gross/Klein («Vertrauen», «montag»), «anteil» als Zahl
 * («30», «30 %») und die Anteile auf die Summe 100 (Rundung der KI: 105, 90, 96 oder 103 sind kein Grund, den Entwurf zu verwerfen).
 */
export function normalizeSaeulen(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...value };
  if (Array.isArray(value.saeulen)) {
    const saeulen = value.saeulen.map((s) => {
      if (typeof s !== "object" || s === null || Array.isArray(s)) return s;
      const r = s as Record<string, unknown>;
      return { ...r, ziel: ausListe(r.ziel, ZIEL_KEYS), anteil: alsZahl(r.anteil) };
    });
    const anteile = saeulen.map((s) => (typeof s === "object" && s !== null ? (s as Record<string, unknown>).anteil : undefined));
    if (anteile.length > 0 && anteile.every((a) => typeof a === "number" && Number.isInteger(a) && a > 0)) {
      const neu = aufHundert(anteile as number[]);
      out.saeulen = saeulen.map((s, i) => ({ ...(s as Record<string, unknown>), anteil: neu[i] }));
    } else {
      out.saeulen = saeulen;
    }
  }
  const rhythmus = value.rhythmus;
  if (typeof rhythmus === "object" && rhythmus !== null && !Array.isArray(rhythmus) && Array.isArray((rhythmus as Record<string, unknown>).wochenplan)) {
    const r = rhythmus as Record<string, unknown>;
    out.rhythmus = {
      ...r,
      wochenplan: (r.wochenplan as unknown[]).map((e) => (typeof e === "object" && e !== null && !Array.isArray(e) ? { ...(e as Record<string, unknown>), tag: ausListe((e as Record<string, unknown>).tag, TAGE) } : e)),
    };
  }
  return out;
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «anteil»: die Anteile summieren nicht auf 100 (± ANTEIL_TOLERANZ; die KI-Antwort wird vorher auf 100 gebracht, normalizeSaeulen);
 * «namedoppelt»: zwei Säulen heissen gleich (ohne Gross/Klein);
 * «wochenplan»: der Wochenplan hat nicht genau so viele Einträge wie Beiträge pro Woche;
 * «saeule»: ein Eintrag im Wochenplan nennt eine Säule, die es unter «saeulen» nicht gibt (Name ohne Gross/Klein);
 * «kanal»: ein Eintrag im Wochenplan nennt einen Kanal, der nicht gewählt ist (Vergleich über Name oder Schlüssel, klein);
 * «zahl»: eine Ziffer in Name, Beschreibung, Beispielen, Rhythmus-Satz oder «niemals», die nicht in den Angaben steht
 * (die Zahl der Beiträge pro Woche zählt zu den Angaben).
 */
export function checkSaeulen(output: SaeulenOutput, input: SaeulenInput): string | null {
  const summe = output.saeulen.reduce((acc, s) => acc + s.anteil, 0);
  if (Math.abs(summe - 100) > ANTEIL_TOLERANZ) return "anteil";
  const namen = output.saeulen.map((s) => normName(s.name));
  if (new Set(namen).size !== namen.length) return "namedoppelt";
  if (output.rhythmus.wochenplan.length !== Number(input.beitraegeProWoche)) return "wochenplan";
  if (output.rhythmus.wochenplan.some((e) => !namen.includes(normName(e.saeule)))) return "saeule";
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

const INSTRUCTION = `Schreib die Themensäulen eines Schweizer KMU aus den Angaben: genau vier oder fünf feste Themenfelder, aus denen alle Beiträge des Betriebs kommen. Drei Säulen sind zu wenig, sechs zu viel. Jede Säule hat einen eigenen Namen.
- Jede Säule kommt konkret aus dem Angebot («angebot») oder aus dem Alltag («alltag») des Betriebs. Keine allgemeinen Säulen wie «Tipps» oder «Branchenwissen» ohne Bezug zum Betrieb.
- Mindestens eine Säule zeigt die Region und die Menschen: Ort, Team, Kundschaft, Anlässe in der Gemeinde. Fehlt der Ort, schreib den Platzhalter [Ort].
- «name»: ein kurzer Begriff, 3 bis 40 Zeichen. «beschreibung»: 40 bis 300 Zeichen, worum es geht und warum es die Kundschaft interessiert. «ziel»: eines von vertrauen, sichtbarkeit, anfragen, bindung.
- «beispiele»: 3 bis 5 fertige Beitragsideen je Säule, je 10 bis 160 Zeichen, so konkret, dass der Betrieb sie diese Woche umsetzen kann. Kennst du einen Namen oder Anlass nicht, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Name der Mitarbeiterin].
- «anteil»: ganze Zahl von 10 bis 50, der Anteil der Säule an allen Beiträgen in Prozent. Die Summe aller Anteile ist genau 100, zum Beispiel 30, 25, 25, 20 bei vier Säulen oder 25, 25, 20, 15, 15 bei fünf.
- «rhythmus.satz»: 40 bis 300 Zeichen, wie sich die Säulen auf die Woche verteilen, mit der Zahl der Beiträge aus «beitraegeProWoche».
- «rhythmus.wochenplan»: genau so viele Einträge, wie «beitraegeProWoche» sagt (1, 2, 3 oder 5). Je Eintrag «tag» (Montag bis Sonntag), «saeule» (genau der Name einer Säule aus «saeulen», so geschrieben wie dort) und «kanal» (der Name eines gewählten Kanals). Die Schlüssel in «kanaele» bedeuten: instagram (Instagram), facebook (Facebook), linkedin (LinkedIn), google (Google-Beitrag), newsletter (Newsletter), website (Website). Schreib in «kanal» den Namen, nicht den Schlüssel. Kanäle, die nicht in «kanaele» stehen, kommen nicht vor.
- «niemals»: 2 bis 4 Beitragsarten, die nicht zu diesem Betrieb passen, je 10 bis 160 Zeichen, mit kurzem Grund.
- Nimm Positionierung («positionierung»), Zielgruppe («primaersegment») und Personas («personas») als Hintergrund, wenn sie da sind; wiederhole sie nicht wörtlich.
- Schreib so, dass Kundschaft es versteht: keine Fachwörter aus dem Marketing, keine englischen Wörter, wo ein deutsches reicht.
- Ziffern nur, wenn sie wörtlich in den Angaben stehen (dazu zählt die Zahl der Beiträge pro Woche). Sonst schreib die Zahl als Wort oder lass sie weg. In «anteil» steht die Zahl als JSON-Zahl, nicht im Text.
Form (hier mit zwei Säulen, du lieferst vier oder fünf): {"saeulen": [{"name": "…", "beschreibung": "…", "ziel": "vertrauen", "beispiele": ["…", "…", "…"], "anteil": 30}, {"name": "…", "beschreibung": "…", "ziel": "anfragen", "beispiele": ["…", "…", "…"], "anteil": 25}], "rhythmus": {"satz": "…", "wochenplan": [{"tag": "Montag", "saeule": "…", "kanal": "Instagram"}]}, "niemals": ["…", "…"]}`;

export const saeulenGenerator = defineGenerator({
  slug: "inhalte-saeulen",
  input: saeulenInput,
  output: saeulenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Betrieb", i),
  maxTokens: 2200,
  temperature: 0.5,
  check: checkSaeulen,
  normalize: normalizeSaeulen,
});

export { saeulenGenerator as generator };
export default saeulenGenerator;
