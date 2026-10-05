import { z } from "zod";
import { typoCH } from "@/lib/ch";
import { dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";

// Generator des Werkzeugs «Vereins-Kommunikationskonzept» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser
// und auf dem Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Formular, dem Firmenprofil und
// (wenn vorhanden) dem gespeicherten Stand der Anspruchsgruppen-Analyse; die Route /api/generate prüft Eingabe und
// Antwort mit denselben Schemas. Spec: specs/vereins-kommunikation.md

export const ENTWICKLUNG_KEYS = ["waechst", "stabil", "schrumpft"] as const;
export type EntwicklungKey = (typeof ENTWICKLUNG_KEYS)[number];

/** So steht die Entwicklung im Formular, im Dokument und in der Nutzernachricht an die KI. */
export const ENTWICKLUNG_LABELS: Record<EntwicklungKey, string> = {
  waechst: "wächst",
  stabil: "stabil",
  schrumpft: "schrumpft",
};

export const ZIEL_KEYS = ["mitglieder", "nachwuchs", "helfer", "sponsoren", "sichtbarkeit"] as const;
export type ZielKey = (typeof ZIEL_KEYS)[number];

export const ZIEL_LABELS: Record<ZielKey, string> = {
  mitglieder: "Mitglieder gewinnen",
  nachwuchs: "Nachwuchs",
  helfer: "Helferinnen und Helfer",
  sponsoren: "Sponsoren",
  sichtbarkeit: "Sichtbarkeit in der Gemeinde",
};

export const KANAL_KEYS = ["website", "instagram", "facebook", "whatsapp", "newsletter", "gemeindeblatt", "aushang", "lokalpresse"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];

/** Namen der Kanäle, wie sie im Formular, im Dokument und im Kanalplan der KI stehen. */
export const KANAL_LABELS: Record<KanalKey, string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp-Gruppen",
  newsletter: "Newsletter oder Mail",
  gemeindeblatt: "Gemeindeblatt oder Anzeiger",
  aushang: "Aushang",
  lokalpresse: "Lokalpresse",
};

export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"] as const;

export const LIMITS = {
  verein: 120,
  ort: 120,
  kanton: 40,
  zweckMin: 20,
  zweck: 400,
  mitgliederMax: 100000,
  anlaesse: 8,
  anlass: 80,
  /** Mindestlänge eines Anlassnamens im Formular: Die Antwort der KI verlangt mindestens drei Zeichen (Schema `kalenderEintrag`). */
  anlassMin: 3,
  wer: 80,
  stundenMax: 200,
  budgetMax: 1000000,
  gruppen: 12,
  gruppe: 60,
} as const;

export const gruppeSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.gruppe),
  interesse: z.number().int().min(1).max(5),
  einfluss: z.number().int().min(1).max(5),
});
export type Gruppe = z.infer<typeof gruppeSchema>;

export const anlassSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.anlass),
  monat: z.number().int().min(1).max(12),
});
export type Anlass = z.infer<typeof anlassSchema>;

export const vereinInput = z.object({
  verein: z.string().trim().min(1).max(LIMITS.verein),
  ort: z.string().trim().max(LIMITS.ort),
  kanton: z.string().trim().max(LIMITS.kanton),
  zweck: z.string().trim().min(LIMITS.zweckMin).max(LIMITS.zweck),
  mitglieder: z.number().int().min(1).max(LIMITS.mitgliederMax),
  entwicklung: z.enum(ENTWICKLUNG_KEYS),
  ziele: z.array(z.enum(ZIEL_KEYS)).min(1).max(ZIEL_KEYS.length),
  anlaesse: z.array(anlassSchema).max(LIMITS.anlaesse),
  kanaele: z.array(z.enum(KANAL_KEYS)).max(KANAL_KEYS.length),
  wer: z.string().trim().max(LIMITS.wer),
  stundenProMonat: z.number().int().min(0).max(LIMITS.stundenMax),
  /** CHF pro Jahr; 0: kein Budget angegeben. */
  budget: z.number().int().min(0).max(LIMITS.budgetMax),
  gruppen: z.array(gruppeSchema).max(LIMITS.gruppen),
});
export type VereinInput = z.infer<typeof vereinInput>;

export const zielSchema = z.object({
  ziel: z.string().min(10).max(120),
  messgroesse: z.string().min(5).max(80),
});
export type Ziel = z.infer<typeof zielSchema>;

export const zielgruppeSchema = z.object({
  name: z.string().min(3).max(60),
  erwartung: z.string().min(10).max(200),
});
export type Zielgruppe = z.infer<typeof zielgruppeSchema>;

export const kanalEintrag = z.object({
  kanal: z.string().min(3).max(40),
  zweck: z.string().min(10).max(160),
  rhythmus: z.string().min(3).max(60),
  /** Leer, wenn die Angaben niemanden nennen. */
  verantwortlich: z.string().max(60),
});
export type KanalEintrag = z.infer<typeof kanalEintrag>;

export const kalenderEintrag = z.object({
  /** Die KI darf die Zahl auch als Text liefern («6»). */
  monat: z.coerce.number().int().min(1).max(12),
  anlass: z.string().min(3).max(80),
  kommunikation: z.string().min(10).max(200),
});
export type KalenderEintrag = z.infer<typeof kalenderEintrag>;

export const rolleSchema = z.object({
  rolle: z.string().min(3).max(60),
  aufgaben: z.string().min(10).max(200),
  /** Die KI darf die Zahl auch als Text liefern («2»). */
  stundenProMonat: z.coerce.number().int().min(0).max(LIMITS.stundenMax),
});
export type Rolle = z.infer<typeof rolleSchema>;

export const vereinOutput = z.object({
  ausgangslage: z.string().min(120).max(700),
  ziele: z.array(zielSchema).min(2).max(5),
  zielgruppen: z.array(zielgruppeSchema).min(2).max(6),
  kernbotschaft: z.string().min(30).max(200),
  kanalplan: z.array(kanalEintrag).min(2).max(8),
  jahreskalender: z.array(kalenderEintrag).min(0).max(12),
  rollen: z.array(rolleSchema).min(1).max(5),
  erfolgsmessung: z.array(z.string().min(10).max(160)).min(2).max(5),
});
export type VereinOutput = z.infer<typeof vereinOutput>;

export { numbersIn };

// ---- Prüfungen ---------------------------------------------------------------------------------

/** Name für den Vergleich: klein, Leerraum zu einem Leerzeichen, Schweizer Schreibweise wie in der bereinigten Antwort. */
export function normName(s: string): string {
  return typoCH(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Kanalname für den Vergleich: klein, ohne Bindestrich, Leerzeichen und Satzzeichen. */
export function kanalKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Weitere Schreibweisen, unter denen die KI einen gewählten Kanal nennen darf (neben Name und Schlüssel). */
const KANAL_ALIASE: Record<KanalKey, readonly string[]> = {
  website: ["Webseite", "Homepage"],
  instagram: [],
  facebook: [],
  whatsapp: ["WhatsApp", "WhatsApp-Gruppe"],
  newsletter: ["Newsletter", "Mail", "E-Mail"],
  gemeindeblatt: ["Gemeindeblatt", "Anzeiger"],
  aushang: [],
  lokalpresse: ["Lokalzeitung"],
};

/** Alle Schreibweisen eines Kanals, schon im Vergleichsformat (`kanalKey`). */
export function kanalNamen(key: KanalKey): string[] {
  return [KANAL_LABELS[key], key, ...KANAL_ALIASE[key]].map(kanalKey);
}

/** Der Zusatz, mit dem die KI einen Kanal markiert, der in den Angaben nicht steht. */
export const NEU_RE = /\s*\(neu\)\s*$/i;
export const MAX_NEUE_KANAELE = 2;

/** Nennt `name` einen der gewählten Kanäle (ohne Gross/Klein, Bindestrich und Leerzeichen)? */
export function istGewaehlterKanal(name: string, kanaele: readonly KanalKey[]): boolean {
  const k = kanalKey(name);
  return kanaele.some((key) => kanalNamen(key).includes(k));
}

/** Summe der Stunden aller Rollen. */
export function stundenSumme(rollen: readonly Pick<Rolle, "stundenProMonat">[]): number {
  return rollen.reduce((acc, r) => acc + r.stundenProMonat, 0);
}

/** Alle Texte der Angaben, aus denen Ziffern stammen dürfen. */
export function knownText(input: VereinInput): string {
  return [
    input.verein,
    input.ort,
    input.kanton,
    input.zweck,
    String(input.mitglieder),
    String(input.stundenProMonat),
    String(input.budget),
    input.wer,
    ...input.anlaesse.map((a) => a.name),
    ...input.gruppen.map((g) => `${g.name} ${g.interesse} ${g.einfluss}`),
  ].join("\n");
}

/** Alle Texte der Antwort, in fester Reihenfolge (die Zahlenfelder «monat» und «stundenProMonat» gehören nicht dazu). */
export function outputTexts(o: VereinOutput): string[] {
  return [
    o.ausgangslage,
    ...o.ziele.flatMap((z) => [z.ziel, z.messgroesse]),
    ...o.zielgruppen.flatMap((z) => [z.name, z.erwartung]),
    o.kernbotschaft,
    ...o.kanalplan.flatMap((k) => [k.kanal, k.zweck, k.rhythmus, k.verantwortlich]),
    ...o.jahreskalender.flatMap((e) => [e.anlass, e.kommunikation]),
    ...o.rollen.flatMap((r) => [r.rolle, r.aufgaben]),
    ...o.erfolgsmessung,
  ];
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null, in dieser Reihenfolge:
 * «zahl»: eine Ziffernfolge in der Antwort steht nicht in den Angaben (Verein, Ort, Kanton, Zweck, Mitglieder, Stunden,
 * Budget, wer, Anlassnamen, Anspruchsgruppen);
 * «stunden»: die Stunden der Rollen ergeben zusammen mehr als die angegebenen Stunden pro Monat;
 * «kalender»: ein Eintrag im Jahreskalender nennt einen Anlass, den es in den Angaben nicht gibt (Name ohne Gross/Klein,
 * gleicher Monat);
 * «kanal»: ein Kanal im Kanalplan steht nicht in den Angaben und trägt nicht den Zusatz «(neu)», oder es sind mehr als
 * zwei neue Kanäle.
 */
export function checkVerein(output: VereinOutput, input: VereinInput): string | null {
  const known = new Set(numbersIn(knownText(input)));
  for (const n of numbersIn(outputTexts(output).join("\n"))) if (!known.has(n)) return "zahl";

  if (stundenSumme(output.rollen) > input.stundenProMonat) return "stunden";

  const anlaesse = input.anlaesse.map((a) => `${a.monat}|${normName(a.name)}`);
  for (const e of output.jahreskalender) if (!anlaesse.includes(`${e.monat}|${normName(e.anlass)}`)) return "kalender";

  let neu = 0;
  for (const k of output.kanalplan) {
    if (NEU_RE.test(k.kanal)) neu += 1;
    else if (!istGewaehlterKanal(k.kanal, input.kanaele)) return "kanal";
  }
  if (neu > MAX_NEUE_KANAELE) return "kanal";
  return null;
}

// ---- Aufgabe an die KI -------------------------------------------------------------------------

const INSTRUCTION = `Schreib ein Kommunikationskonzept für einen Schweizer Verein. Es ist nüchtern und eignet sich als Vorlage für die Generalversammlung. Wo du den Vorstand direkt ansprichst, gilt die Du-Form.
- Grundlage sind die Angaben: «verein», «ort», «kanton», «zweck», «mitglieder», «entwicklung», «ziele» (was der Verein erreichen will), «anlaesse» (Name, Monat als Zahl 1 bis 12 und Monatsname), «kanaele» (Kanäle, die heute laufen), «wer» (wer die Kommunikation macht), «stundenProMonat», «budget» (CHF pro Jahr, 0 heisst: kein Budget angegeben) und, falls vorhanden, «gruppen» (Anspruchsgruppen mit Interesse und Einfluss von 1 bis 5). Erfinde nichts, was nicht in den Angaben steht. Erfinde keinen Vereinsnamen: Nenn den Verein so, wie er in «verein» steht.
- «ausgangslage»: 120 bis 700 Zeichen. Was der Verein ist, wie viele Mitglieder er hat und wohin sich die Zahl entwickelt, welche Kanäle heute laufen, wie viel Zeit und Budget es gibt. Sachlich, ohne Urteil von aussen.
- «ziele»: 2 bis 5 Ziele, die zu den gewählten «ziele» passen. «ziel» ist ein Satz (10 bis 120 Zeichen). «messgroesse» (5 bis 80 Zeichen) sagt, was der Verein selbst zählt: Mitglieder, Anmeldungen, Helferinnen und Helfer, Besucher. Keine Benchmarks, keine Vergleichszahlen. Brauchst du eine Zielzahl, schreib den Platzhalter [Zielzahl].
- «zielgruppen»: 2 bis 6 Gruppen, je «name» (3 bis 60 Zeichen) und «erwartung» (was die Gruppe vom Verein wissen will, 10 bis 200 Zeichen). Sind «gruppen» angegeben, bilden sie die Zielgruppen: Nimm zuerst die mit hohem Interesse oder hohem Einfluss (Wert 4 oder 5) und schreib den Namen so, wie er in «gruppen» steht. Fehlen «gruppen», leite drei bis fünf Zielgruppen aus Zweck und Zielen ab, zum Beispiel Mitglieder, Eltern, Gemeinde, Sponsoren.
- «kernbotschaft»: ein Satz von 30 bis 200 Zeichen, den jedes Vorstandsmitglied weitersagen kann. Er sagt, wofür der Verein steht und wen er einlädt. Keine Werbesprache.
- «kanalplan»: 2 bis 6 Zeilen, eine je Kanal aus «kanaele» (bei vielen Kanälen die wichtigsten). «kanal» (3 bis 40 Zeichen) nennt den Kanal so, wie er in «kanaele» steht, zum Beispiel «WhatsApp-Gruppen» oder «Gemeindeblatt oder Anzeiger». Du darfst höchstens zwei Kanäle vorschlagen, die nicht in «kanaele» stehen; schreib dann «(neu)» ans Ende des Namens, zum Beispiel «Instagram (neu)». Hat der Verein weniger als zwei Kanäle, schlag so viele vor, dass es zwei Zeilen sind. «zweck»: wofür der Kanal dient (10 bis 160 Zeichen). «rhythmus»: in Worten, zum Beispiel «wöchentlich» oder «vor jedem Anlass» (höchstens 60 Zeichen). «verantwortlich»: eine Rolle oder eine Person aus «wer» (höchstens 60 Zeichen); ist nichts bekannt, bleibt es leer. Der Aufwand passt zu «stundenProMonat».
- «jahreskalender»: höchstens eine Zeile je Anlass aus «anlaesse» und ausschliesslich mit diesen Anlässen. «anlass» steht genau so wie in den Angaben, «monat» ist dieselbe Zahl wie in den Angaben. «kommunikation»: was vor, während und nach dem Anlass kommuniziert wird (10 bis 200 Zeichen). Sind keine Anlässe angegeben, ist die Liste leer.
- «rollen»: 1 bis 5 Rollen mit «rolle» (Bezeichnung, 3 bis 60 Zeichen), «aufgaben» (was die Rolle in der Kommunikation tut, 10 bis 200 Zeichen) und «stundenProMonat» (ganze Zahl). Die Stunden aller Rollen zusammen sind höchstens so viele wie «stundenProMonat» aus den Angaben. Sind es 0 Stunden, steht bei jeder Rolle 0. Die Stunden stehen nur in diesem Feld, nicht im Text.
- «erfolgsmessung»: 2 bis 5 Grössen, die der Verein selbst zählt, je ein Satz von 10 bis 160 Zeichen: Mitglieder, Anmeldungen, Helferinnen und Helfer, Besucher. Keine Benchmarks aus Statistiken.
- Ziffern nur, wenn sie wörtlich in den Angaben stehen (Mitgliederzahl, Stunden, Budget, Zahlen im Zweck oder in Namen). Alles andere schreib als Wort, zum Beispiel «zweimal im Monat», oder als Platzhalter in eckigen Klammern. Keine Jahreszahlen, keine Daten, keine Prozentwerte.
- Halte die Texte kurz: Jede Zelle ist ein bis zwei Sätze, damit die Antwort in die Obergrenze passt. «monat» und «stundenProMonat» stehen als JSON-Zahlen.
Form: {"ausgangslage": "…", "ziele": [{"ziel": "…", "messgroesse": "…"}], "zielgruppen": [{"name": "…", "erwartung": "…"}], "kernbotschaft": "…", "kanalplan": [{"kanal": "Website", "zweck": "…", "rhythmus": "…", "verantwortlich": ""}], "jahreskalender": [{"monat": 6, "anlass": "…", "kommunikation": "…"}], "rollen": [{"rolle": "…", "aufgaben": "…", "stundenProMonat": 2}], "erfolgsmessung": ["…"]}`;

/** Die Angaben für die Nutzernachricht: Schlüssel werden zu den Wörtern des Formulars, der Monat bekommt seinen Namen dazu. */
export function promptData(i: VereinInput) {
  return {
    verein: i.verein,
    ort: i.ort,
    kanton: i.kanton,
    zweck: i.zweck,
    mitglieder: i.mitglieder,
    entwicklung: ENTWICKLUNG_LABELS[i.entwicklung],
    ziele: i.ziele.map((z) => ZIEL_LABELS[z]),
    anlaesse: i.anlaesse.map((a) => ({ name: a.name, monat: a.monat, monatsname: MONATE[a.monat - 1] })),
    kanaele: i.kanaele.map((k) => KANAL_LABELS[k]),
    wer: i.wer,
    stundenProMonat: i.stundenProMonat,
    budget: i.budget,
    gruppen: i.gruppen,
  };
}

export const vereinGenerator = defineGenerator({
  slug: "vereins-kommunikation",
  input: vereinInput,
  output: vereinOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Verein", promptData(i)),
  maxTokens: 1800,
  temperature: 0.4,
  check: checkVerein,
});

export { vereinGenerator as generator };
export default vereinGenerator;
