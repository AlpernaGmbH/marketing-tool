import { z } from "zod";
import { brandHits } from "@/lib/brand-rules";
import { typoCH } from "@/lib/ch";
import { dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";
import { BEITRAEGE_KEYS, KANAL_KEYS, KANAL_LABELS, kanalKey, type BeitraegeKey, type KanalKey } from "@/tools/inhalte-saeulen/generator";

// Generator des Werkzeugs «Inhaltsstrategie» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem
// Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Formular und dem Firmenprofil; die Route
// /api/generate prüft Eingabe und Antwort mit denselben Schemas. Die Kanalliste und die Zahl der Beiträge pro Woche
// sind dieselben wie bei «Themensäulen». Spec: specs/inhalte-strategie.md

export { BEITRAEGE_KEYS, KANAL_KEYS, KANAL_LABELS, kanalKey };
export type { BeitraegeKey, KanalKey };

export const ORGANISATIONSTYPEN = ["kmu", "verein"] as const;
export type Organisationstyp = (typeof ORGANISATIONSTYPEN)[number];

export const ZIEL_KEYS = ["anfragen", "bekanntheit", "bindung", "fachkraefte"] as const;
export type ZielKey = (typeof ZIEL_KEYS)[number];

/** Wofür der Inhalt da sein soll, je Typ. Die Werte sind für beide Typen gleich, die Wörter nicht. */
export const ZIEL_LABELS: Record<Organisationstyp, Record<ZielKey, string>> = {
  kmu: {
    anfragen: "Anfragen und Aufträge",
    bekanntheit: "Bekanntheit in der Region",
    bindung: "Stammkundschaft binden",
    fachkraefte: "Fachkräfte und Lernende finden",
  },
  verein: {
    anfragen: "Mitglieder gewinnen",
    bekanntheit: "Anlässe füllen",
    bindung: "Sponsoren finden",
    fachkraefte: "Freiwillige finden",
  },
};

/** Die drei Monate des Plans, in dieser Reihenfolge. */
export const MONATE = ["Monat 1", "Monat 2", "Monat 3"] as const;
export type Monat = (typeof MONATE)[number];

export const MIN_SAEULEN_ANGABE = 3;
export const MAX_SAEULEN = 5;

export const LIMITS = {
  betrieb: 120,
  branche: 120,
  ort: 80,
  angebotMin: 20,
  angebot: 800,
  besonders: 400,
  zielgruppe: 200,
  saeuleMin: 3,
  saeule: 40,
  saeulen: MAX_SAEULEN,
  positionierung: 600,
  tonalitaet: 200,
} as const;

/** Name für den Vergleich: Schweizer Schreibweise wie in der bereinigten Antwort, klein, Leerraum zu einem Leerzeichen. */
export function normName(s: string): string {
  return typoCH(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Angegebene Säulen sind in Ordnung, wenn es keine gibt oder drei bis fünf mit verschiedenen Namen (ohne Gross/Klein).
 * Die Antwort verlangt mindestens drei Säulen, darum sind ein oder zwei angegebene Säulen nicht möglich.
 */
export function saeulenGueltig(saeulen: readonly string[]): boolean {
  if (saeulen.length === 0) return true;
  if (saeulen.length < MIN_SAEULEN_ANGABE || saeulen.length > MAX_SAEULEN) return false;
  return new Set(saeulen.map(normName)).size === saeulen.length;
}

export const strategieInput = z
  .object({
    betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
    organisationstyp: z.enum(ORGANISATIONSTYPEN),
    branche: z.string().trim().max(LIMITS.branche),
    ort: z.string().trim().max(LIMITS.ort),
    ziel: z.enum(ZIEL_KEYS),
    angebot: z.string().trim().min(LIMITS.angebotMin).max(LIMITS.angebot),
    besonders: z.string().trim().max(LIMITS.besonders),
    zielgruppe: z.string().trim().max(LIMITS.zielgruppe),
    saeulen: z.array(z.string().trim().min(LIMITS.saeuleMin).max(LIMITS.saeule)).max(LIMITS.saeulen),
    kanaele: z.array(z.enum(KANAL_KEYS)).min(1).max(KANAL_KEYS.length),
    beitraegeProWoche: z.enum(BEITRAEGE_KEYS),
    positionierung: z.string().trim().max(LIMITS.positionierung),
    tonalitaet: z.string().trim().max(LIMITS.tonalitaet),
  })
  .refine((i) => saeulenGueltig(i.saeulen), { message: "Säulen: keine oder drei bis fünf mit verschiedenen Namen", path: ["saeulen"] });
export type StrategieInput = z.infer<typeof strategieInput>;

export const zielSchema = z.object({
  ziel: z.string().min(10).max(140),
  /** In Worten: was der Betrieb selbst zählt oder beobachtet. Keine erfundene Zahl. */
  messgroesse: z.string().min(10).max(140),
});
export type Ziel = z.infer<typeof zielSchema>;

export const zielgruppeSchema = z.object({
  name: z.string().min(3).max(60),
  bedarf: z.string().min(30).max(260),
});
export type Zielgruppe = z.infer<typeof zielgruppeSchema>;

export const saeuleSchema = z.object({
  name: z.string().min(3).max(40),
  rolle: z.string().min(30).max(260),
});
export type Saeule = z.infer<typeof saeuleSchema>;

export const kanalrolleSchema = z.object({
  kanal: z.string().min(3).max(40),
  rolle: z.string().min(30).max(220),
  formate: z.array(z.string().min(3).max(40)).min(1).max(3),
});
export type Kanalrolle = z.infer<typeof kanalrolleSchema>;

export const planMonatSchema = z.object({
  monat: z.enum(MONATE),
  schwerpunkt: z.string().min(20).max(200),
  aufgaben: z.array(z.string().min(10).max(160)).min(3).max(5),
});
export type PlanMonat = z.infer<typeof planMonatSchema>;

export const strategieOutput = z.object({
  kernbotschaft: z.string().min(40).max(240),
  ziele: z.array(zielSchema).min(2).max(3),
  zielgruppen: z.array(zielgruppeSchema).min(1).max(3),
  saeulen: z.array(saeuleSchema).min(3).max(5),
  kanalrollen: z.array(kanalrolleSchema).min(1).max(6),
  rhythmus: z.object({ satz: z.string().min(40).max(300) }),
  plan90: z.array(planMonatSchema).length(3),
  messung: z.array(z.string().min(20).max(200)).min(3).max(5),
  niemals: z.array(z.string().min(10).max(160)).min(2).max(4),
});
export type StrategieOutput = z.infer<typeof strategieOutput>;

export { numbersIn };

// ---- Prüfungen ---------------------------------------------------------------------------------

/** Welcher gewählte Kanal steckt hinter diesem Namen? Name oder Schlüssel, ohne Gross/Klein, Bindestrich und Leerzeichen. */
export function gewaehlterKanal(name: string, kanaele: readonly KanalKey[]): KanalKey | null {
  const k = kanalKey(name);
  return kanaele.find((key) => kanalKey(KANAL_LABELS[key]) === k || kanalKey(key) === k) ?? null;
}

const ZAHLWOERTER: Record<BeitraegeKey, RegExp> = {
  // «ein Beitrag», «einen festen Beitrag», «einmal»: «ein» allein wäre zu locker.
  "1": /\beinmal\b|\bein(?:e|en|em|er)?\s+(?:\p{L}+\s+){0,2}(?:beitrag|beitrags|post|posting)/iu,
  "2": /\bzwei(?:mal)?\b/iu,
  "3": /\bdrei(?:mal)?\b/iu,
  "5": /\b(?:fünf|fuenf)(?:mal)?\b/iu,
};

/** Nennt der Satz die Zahl der Beiträge pro Woche, als Ziffer oder als Wort? */
export function nenntBeitraege(satz: string, n: BeitraegeKey): boolean {
  return numbersIn(satz).includes(n) || ZAHLWOERTER[n].test(satz);
}

/** Alle Texte der Angaben, aus denen Ziffern stammen dürfen. */
export function knownText(input: StrategieInput): string {
  return [
    input.betrieb,
    input.branche,
    input.ort,
    input.angebot,
    input.besonders,
    input.zielgruppe,
    ...input.saeulen,
    input.positionierung,
    input.tonalitaet,
    input.beitraegeProWoche,
  ].join("\n");
}

/** Alle Texte der Antwort, in fester Reihenfolge. Das Feld «monat» («Monat 1» bis «Monat 3») gehört nicht dazu. */
export function outputTexts(o: StrategieOutput): string[] {
  return [
    o.kernbotschaft,
    ...o.ziele.flatMap((z) => [z.ziel, z.messgroesse]),
    ...o.zielgruppen.flatMap((z) => [z.name, z.bedarf]),
    ...o.saeulen.flatMap((s) => [s.name, s.rolle]),
    ...o.kanalrollen.flatMap((k) => [k.kanal, k.rolle, ...k.formate]),
    o.rhythmus.satz,
    ...o.plan90.flatMap((p) => [p.schwerpunkt, ...p.aufgaben]),
    ...o.messung,
    ...o.niemals,
  ];
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null, in dieser Reihenfolge:
 * «kanal»: ein Kanal in den Kanalrollen ist nicht gewählt (Vergleich über Name oder Schlüssel, klein, ohne Bindestrich),
 * oder ein gewählter Kanal fehlt oder kommt doppelt vor;
 * «saeule»: sind Säulen angegeben, stimmen die Namen in der Antwort nicht in Anzahl und Schreibweise (klein) damit überein;
 * «plan»: der Plan hat nicht «Monat 1», «Monat 2», «Monat 3» in dieser Reihenfolge;
 * «rhythmus»: der Satz nennt die Zahl der Beiträge pro Woche nicht;
 * «zahl»: eine Ziffernfolge in einem Text der Antwort steht nicht in den Angaben (die Zahl der Beiträge zählt dazu);
 * «sperrliste»: ein Text trifft eine harte Regel der Sperrliste (lib/brand-rules.ts).
 */
export function checkStrategie(output: StrategieOutput, input: StrategieInput): string | null {
  const zugeordnet = output.kanalrollen.map((k) => gewaehlterKanal(k.kanal, input.kanaele));
  if (zugeordnet.some((k) => k === null) || new Set(zugeordnet).size !== input.kanaele.length || zugeordnet.length !== input.kanaele.length) return "kanal";

  if (input.saeulen.length > 0) {
    const gewollt = input.saeulen.map(normName).sort();
    const geliefert = output.saeulen.map((s) => normName(s.name)).sort();
    if (gewollt.length !== geliefert.length || gewollt.some((n, i) => n !== geliefert[i])) return "saeule";
  }

  if (output.plan90.some((p, i) => p.monat !== MONATE[i])) return "plan";

  if (!nenntBeitraege(output.rhythmus.satz, input.beitraegeProWoche)) return "rhythmus";

  const texte = outputTexts(output);
  const known = new Set(numbersIn(knownText(input)));
  for (const n of numbersIn(texte.join("\n"))) if (!known.has(n)) return "zahl";

  for (const t of texte) if (brandHits(t).some((h) => h.level === "hart")) return "sperrliste";
  return null;
}

// ---- Aufgabe an die KI -------------------------------------------------------------------------

const INSTRUCTION = `Schreib eine Inhaltsstrategie für einen Schweizer Betrieb oder Verein aus den Angaben. Sie ist ein Dokument von zwei bis drei Seiten: wofür der Inhalt da ist, für wen, in welchen Themen, auf welchem Kanal mit welcher Rolle, in welchem Rhythmus, woran man merkt, ob es wirkt, und was in den ersten drei Monaten passiert.
- Anrede: Bei «organisationstyp» kmu sprichst du den Betrieb mit Du an, wo du ihn ansprichst, zum Beispiel bei Aufgaben im Plan («Richte … ein»). Bei verein schreibst du in der Wir-Form des Vereins und mit Vereinsbegriffen wie Mitglieder, Vorstand, Anlässe, Helferinnen und Helfer, Sponsoren statt Kundschaft und Aufträge.
- Grundlage sind die Angaben: «betrieb», «organisationstyp», «branche», «ort», «ziel» (wofür der Inhalt da sein soll), «angebot» (Angebot und häufige Fragen), «besonders» (was den Betrieb besonders macht), «zielgruppe», «saeulen», «kanaele» (Namen der gewählten Kanäle), «beitraegeProWoche» und, falls vorhanden, «positionierung» und «tonalitaet» als Hintergrund, den du nicht wörtlich wiederholst. Leere Angaben füllst du nicht mit Erfundenem. Jede Aussage kommt aus «angebot», «besonders», «ort» oder «ziel»; keine Ratschläge, die auf jeden Betrieb passen.
- «kernbotschaft»: 40 bis 240 Zeichen, ein Satz, der sagt, wofür der Betrieb steht und was die Kundschaft davon hat. Er passt zu «ziel» und «besonders». Keine Werbesprache.
- «ziele»: 2 bis 3 Ziele, die zu «ziel» passen. «ziel»: ein Satz, 10 bis 140 Zeichen. «messgroesse»: 10 bis 140 Zeichen, in Worten, was der Betrieb selbst zählt oder beobachtet, zum Beispiel Anfragen über das Kontaktformular oder Anrufe nach einem Beitrag. Keine Zahl und kein Vergleichswert: Die Richtwerte legt die Person selbst fest.
- «zielgruppen»: 1 bis 3 Gruppen mit «name» (3 bis 60 Zeichen) und «bedarf» (30 bis 260 Zeichen), was die Gruppe vom Inhalt braucht. Ist «zielgruppe» angegeben, ist sie sinngemäss die erste Gruppe.
- «saeulen»: Sind in «saeulen» Namen angegeben, übernimm genau diese, in gleicher Anzahl und in gleicher Schreibweise im Feld «name». Sind keine angegeben, schlag 3 bis 5 Säulen vor, die aus «angebot» und «besonders» kommen; ein Name ist ein kurzer Begriff von 3 bis 40 Zeichen. «rolle»: 30 bis 260 Zeichen, wofür die Säule im Inhalt da ist und wen sie anspricht. Schlägst du Säulen vor, zeigt mindestens eine die Region und die Menschen; fehlt der Ort, schreib den Platzhalter [Ort].
- «kanalrollen»: genau eine Zeile je Kanal in «kanaele», nicht mehr und nicht weniger. «kanal»: der Name des Kanals genau so, wie er in «kanaele» steht. «rolle»: 30 bis 220 Zeichen, was dieser Kanal in der Strategie leistet, zum Beispiel gefunden werden, Vertrauen aufbauen oder Anfragen annehmen. «formate»: 1 bis 3 Formate, je 3 bis 40 Zeichen, die zum Kanal passen, zum Beispiel Foto, Kurzvideo oder Text mit Bild.
- «rhythmus.satz»: 40 bis 300 Zeichen, ein Satz, der die Zahl der Beiträge pro Woche aus «beitraegeProWoche» nennt und sagt, wie sie sich auf Säulen und Kanäle verteilen.
- «plan90»: genau drei Einträge, in dieser Reihenfolge: «monat» ist «Monat 1», dann «Monat 2», dann «Monat 3». «schwerpunkt»: 20 bis 200 Zeichen. «aufgaben»: 3 bis 5 Aufgaben, je 10 bis 160 Zeichen. Der erste Monat baut auf (Säulen festlegen, erste Beiträge, Rhythmus einüben), der zweite wiederholt und verbessert (was gut ankam, öfter; was nicht, anders), der dritte prüft und passt an (Messgrössen ansehen, Säulen und Rhythmus anpassen). Schreib «Monat 1» bis «Monat 3» nur im Feld «monat», im Text sagst du «im ersten Monat».
- «messung»: 3 bis 5 Punkte, je 20 bis 200 Zeichen, woran man merkt, ob es wirkt. Jeder Punkt nennt, was gezählt oder beobachtet wird und wo man es findet, zum Beispiel in der Statistik des Kanals oder in der Frage «Wie hast du von uns erfahren?». Keine Zahlen, keine Vergleichswerte.
- «niemals»: 2 bis 4 Dinge, die nicht in diese Strategie gehören, je 10 bis 160 Zeichen, mit kurzem Grund.
- Schweizer Bezug: Ort, Region, Jahreszeit, lokale Anlässe. Kennst du einen Namen oder Anlass nicht, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Anlass in deiner Gemeinde].
- Keine Rechts- und Datenschutzaussagen, keine Versprechen über Reichweite, Umsatz oder Mitgliederzahlen. Schreib so, dass Kundschaft es versteht: keine Fachwörter aus dem Marketing, keine englischen Wörter, wo ein deutsches reicht.
- Ziffern nur, wenn sie wörtlich in den Angaben stehen (dazu zählt die Zahl der Beiträge pro Woche). Alles andere schreib als Wort, zum Beispiel «drei Monate» statt «90 Tage». Keine Jahreszahlen.
- Halte die Texte kurz: Jede Zelle ist ein bis zwei Sätze, damit die Antwort in die Obergrenze passt.
Form: {"kernbotschaft": "…", "ziele": [{"ziel": "…", "messgroesse": "…"}], "zielgruppen": [{"name": "…", "bedarf": "…"}], "saeulen": [{"name": "…", "rolle": "…"}], "kanalrollen": [{"kanal": "Instagram", "rolle": "…", "formate": ["…"]}], "rhythmus": {"satz": "…"}, "plan90": [{"monat": "Monat 1", "schwerpunkt": "…", "aufgaben": ["…", "…", "…"]}, {"monat": "Monat 2", "schwerpunkt": "…", "aufgaben": ["…", "…", "…"]}, {"monat": "Monat 3", "schwerpunkt": "…", "aufgaben": ["…", "…", "…"]}], "messung": ["…", "…", "…"], "niemals": ["…", "…"]}`;

/** Die Angaben für die Nutzernachricht: Ziel und Kanäle als Wörter des Formulars statt als Schlüssel. */
export function promptData(i: StrategieInput) {
  return {
    betrieb: i.betrieb,
    organisationstyp: i.organisationstyp,
    branche: i.branche,
    ort: i.ort,
    ziel: ZIEL_LABELS[i.organisationstyp][i.ziel],
    angebot: i.angebot,
    besonders: i.besonders,
    zielgruppe: i.zielgruppe,
    saeulen: i.saeulen,
    kanaele: i.kanaele.map((k) => KANAL_LABELS[k]),
    beitraegeProWoche: i.beitraegeProWoche,
    positionierung: i.positionierung,
    tonalitaet: i.tonalitaet,
  };
}

export const strategieGenerator = defineGenerator({
  slug: "inhalte-strategie",
  input: strategieInput,
  output: strategieOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Betrieb", promptData(i)),
  maxTokens: 2200,
  temperature: 0.5,
  check: checkStrategie,
});

export { strategieGenerator as generator };
export default strategieGenerator;
