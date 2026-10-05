import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { ANREDEN, anredeFromProfile, anredeLabel, isAnrede, type Anrede } from "@/tools/bewertungs-kit/logic";
import {
  LAENGE_KEYS,
  LIMITS,
  PLATZHALTER,
  bewertungInput,
  bewertungOutput,
  type BewertungInput,
  type BewertungOutput,
  type LaengeKey,
  type Variante,
} from "./generator";

// Bewertungsantwort mit KI: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts; hier stehen Labels, Vorschläge aus dem Profil, Eingabeprüfung,
// die feste Vorlage für den Fall, dass die KI nicht antwortet, Dokument, CRM-Texte und der gespeicherte Stand.
// Spec: specs/bewertungsantwort.md

export const SLUG = "bewertungsantwort";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe die Antwort, bevor du sie veröffentlichst.";
export const VORLAGE_HINWEIS = "Die KI ist gerade nicht erreichbar; hier eine feste Vorlage.";
export const VORLAGE_ZUSATZ = "Passe sie an die Bewertung an, bevor du sie veröffentlichst.";
/** Ausgabe fürs CRM, wenn statt eines KI-Entwurfs die feste Vorlage erscheint. */
export const VORLAGE_AUSGABE = "Vorlage (ohne KI)";

export { ANREDEN, PLATZHALTER, anredeFromProfile, anredeLabel, isAnrede };
export type { Anrede };

/** Zeichen eines Textes, wie die Felder sie zählen (je Zeichen, nicht je Byte). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---- Länge und Sterne ----------------------------------------------------------------------------

export const LAENGEN: { key: LaengeKey; label: string; hint: string }[] = [
  { key: "kurz", label: "Kurz", hint: "zwei bis drei Sätze" },
  { key: "mittel", label: "Mittel", hint: "ein kurzer Absatz" },
];

export function isLaenge(value: unknown): value is LaengeKey {
  return typeof value === "string" && (LAENGE_KEYS as readonly string[]).includes(value);
}

export function laengeLabel(key: LaengeKey): string {
  return LAENGEN.find((l) => l.key === key)?.label ?? key;
}

export const STERNE = [1, 2, 3, 4, 5] as const;

/** «1 Stern», «3 Sterne». */
export function sterneLabel(n: number): string {
  return `${n} ${n === 1 ? "Stern" : "Sterne"}`;
}

/** Bei 1 bis 3 Sternen antwortet die Person auf Kritik: Bedauern und ein Gesprächsangebot. */
export function istKritik(sterne: number): boolean {
  return sterne <= 3;
}

export const kopierLabel = (index: number): string => `Variante ${index + 1} kopieren`;
export const varianteTitel = (v: Variante, index: number): string => `Variante ${index + 1}: ${v.ton}`;

// ---- Text und Profil -----------------------------------------------------------------------------

const squash = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const oneLine = (s: string | undefined, max: number) => squash(s).slice(0, max);
const multiLine = (s: string | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, max);

/**
 * Kürzt einen Text auf höchstens `max` Zeichen an einer Wortgrenze, ohne Satzzeichen am Ende. Was schon passt, bleibt.
 * Dient dazu, Regeln und Werte aus dem Profil in die Grenzen dieses Werkzeugs zu bringen.
 */
export function shorten(text: string, max: number): string {
  const t = squash(text);
  if (t.length <= max) return t;
  let cut = t.slice(0, max);
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1);
  const space = cut.lastIndexOf(" ");
  const base = space >= max / 2 ? cut.slice(0, space) : cut;
  return base.replace(/[\s,;:–-]+$/u, "");
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map(squash).filter(Boolean) : [];

/** Ohne Doppel (Gross- und Kleinschreibung zählt nicht), in der Reihenfolge des Profils. */
function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ProfileFields = Pick<Profile, "firma" | "marke">;

/** Werte der Marke aus dem Profil (marke.werte), höchstens 5 à 40 Zeichen. Leer, wo nichts steht. */
export function profilWerte(profile: Pick<Profile, "marke">): string[] {
  return unique(stringList(profile.marke?.werte).map((w) => shorten(w, LIMITS.wert)).filter(Boolean)).slice(0, LIMITS.werte);
}

/** Zu vermeidende Wörter (marke.woerter.vermeiden), höchstens 10. Was länger als 40 Zeichen ist, ist kein Wort und fällt weg. */
export function profilVermeiden(profile: Pick<Profile, "marke">): string[] {
  const woerter = profile.marke?.woerter as Record<string, unknown> | undefined;
  return unique(stringList(woerter?.vermeiden).filter((w) => w.length <= LIMITS.wort)).slice(0, LIMITS.vermeiden);
}

/** Alle Regeln aus dem Profil (marke.bewertungsregeln), bereinigt, in voller Länge. */
export function profilRegeln(profile: Pick<Profile, "marke">): string[] {
  return stringList(profile.marke?.bewertungsregeln);
}

/** Vorschlag für die drei Felder «Regel 1» bis «Regel 3»: die ersten drei Regeln des Profils, auf 120 Zeichen gekürzt. */
export function regelnVorschlag(profile: Pick<Profile, "marke">): string[] {
  return profilRegeln(profile)
    .slice(0, LIMITS.regeln)
    .map((r) => shorten(r, LIMITS.regel));
}

/** Was aus dem Profil als Hintergrund mitgeht und auf der Seite als Hinweis steht. */
export type ProfilHinweise = { werte: string[]; vermeiden: string[] };

export function profilHinweise(profile: Pick<Profile, "marke">): ProfilHinweise {
  return { werte: profilWerte(profile), vermeiden: profilVermeiden(profile) };
}

/** «Aus deinem Profil geht mit: Werte: A, B; zu vermeidende Wörter: X, Y.» Leer, wenn nichts da ist. */
export function hinweisText(hinweise: ProfilHinweise): string {
  const teile = [
    hinweise.werte.length > 0 ? `Werte: ${hinweise.werte.join(", ")}` : "",
    hinweise.vermeiden.length > 0 ? `zu vermeidende Wörter: ${hinweise.vermeiden.join(", ")}` : "",
  ].filter(Boolean);
  return teile.length > 0 ? `Aus deinem Profil geht mit: ${teile.join("; ")}.` : "";
}

/** Namen der Profil-Teile für den Satz vor dem Knopf («dazu Werte und zu vermeidende Wörter aus deinem Profil»). */
export function hinweisNamen(hinweise: ProfilHinweise): string[] {
  return [hinweise.werte.length > 0 ? "Werte" : "", hinweise.vermeiden.length > 0 ? "zu vermeidende Wörter" : ""].filter(Boolean);
}

// ---- Eingabe -------------------------------------------------------------------------------------

/** Was die Person im Formular tippt. Sterne und Anrede sind leer, bis sie gewählt sind. */
export type FormValues = {
  bewertung: string;
  sterne: number | null;
  anrede: Anrede | "";
  laenge: LaengeKey;
  unterschrift: string;
  regeln: string[];
};

export const EMPTY_FORM: FormValues = { bewertung: "", sterne: null, anrede: "", laenge: "kurz", unterschrift: "", regeln: [] };

/** Die Regeln des Formulars: bereinigt, ohne Leere, höchstens drei. */
function cleanRegeln(regeln: string[]): string[] {
  return regeln
    .map((r) => oneLine(r, LIMITS.regel))
    .filter(Boolean)
    .slice(0, LIMITS.regeln);
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. Der Server prüft mit demselben Schema noch einmal. */
export function inputProblem(fields: Pick<Profile, "firma">, values: FormValues): string | null {
  if (!oneLine(fields.firma, LIMITS.betrieb)) return "Gib den Namen deines Betriebs an.";
  if (!isAnrede(values.anrede)) return "Wähle, ob du die Person duzt oder siezt.";
  if (!isLaenge(values.laenge)) return "Wähle die Länge der Antwort.";
  const unterschrift = squash(values.unterschrift);
  if (!unterschrift) return "Gib an, wie du die Antwort unterschreibst, zum Beispiel «Ruth Keller, Malerei Keller».";
  if (unterschrift.length > LIMITS.unterschrift) return `Die Unterschrift ist zu lang. Es sind höchstens ${LIMITS.unterschrift} Zeichen möglich.`;
  if (!multiLine(values.bewertung, LIMITS.bewertung + 1)) return "Füge den Text der Bewertung ein.";
  if (multiLine(values.bewertung, LIMITS.bewertung + 1).length > LIMITS.bewertung) {
    return `Die Bewertung ist zu lang. Es sind höchstens 1'500 Zeichen möglich.`;
  }
  if (typeof values.sterne !== "number" || !Number.isInteger(values.sterne) || values.sterne < 1 || values.sterne > 5) {
    return "Wähle die Sterne der Bewertung.";
  }
  for (const [i, r] of values.regeln.entries()) {
    if (squash(r).length > LIMITS.regel) return `Regel ${i + 1} ist zu lang. Es sind höchstens ${LIMITS.regel} Zeichen möglich.`;
  }
  if (values.regeln.filter((r) => squash(r)).length > LIMITS.regeln) return `Es sind höchstens ${LIMITS.regeln} Regeln möglich.`;
  return null;
}

/**
 * Eingabe des Generators aus Profil und Formular, bereinigt und gekürzt. null, wenn sie das Schema nicht erfüllt
 * (zum Beispiel ohne Sterne, ohne Anrede oder ohne Unterschrift); die Prüfung davor (`inputProblem`) nennt den Grund.
 */
export function toInput(profile: ProfileFields, values: FormValues): BewertungInput | null {
  const parsed = bewertungInput.safeParse({
    betrieb: oneLine(profile.firma, LIMITS.betrieb),
    anrede: values.anrede,
    laenge: values.laenge,
    unterschrift: oneLine(values.unterschrift, LIMITS.unterschrift),
    bewertung: multiLine(values.bewertung, LIMITS.bewertung),
    sterne: values.sterne ?? 0,
    regeln: cleanRegeln(values.regeln),
    werte: profilWerte(profile),
    vermeiden: profilVermeiden(profile),
  });
  return parsed.success ? parsed.data : null;
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function toForm(input: BewertungInput): FormValues {
  return {
    bewertung: input.bewertung,
    sterne: input.sterne,
    anrede: input.anrede,
    laenge: input.laenge,
    unterschrift: input.unterschrift,
    regeln: [...input.regeln],
  };
}

/**
 * Die Angaben fürs CRM, eine je Zeile, ohne die Unterschrift (sie steht am Ende jeder Variante der Ausgabe). Der Text der
 * Bewertung steht zuletzt, weil er der längste ist: Der Server kürzt auf 1'900 Zeichen, das Wichtigste steht darum oben.
 */
export function eingabeText(input: BewertungInput): string {
  return [
    `Betrieb: ${input.betrieb}`,
    `Sterne: ${input.sterne}`,
    `Anrede: ${anredeLabel(input.anrede)}`,
    `Länge: ${laengeLabel(input.laenge)}`,
    ...input.regeln.map((r, i) => `Regel ${i + 1}: ${r}`),
    input.werte.length > 0 ? `Werte: ${input.werte.join(", ")}` : "",
    input.vermeiden.length > 0 ? `Zu vermeiden: ${input.vermeiden.join(", ")}` : "",
    `Bewertung: ${input.bewertung}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Feste Vorlage -------------------------------------------------------------------------------

type Ton = [ton: string, text: (p: { firma: string; unterschrift: string }) => string];

const zuFirma = (firma: string) => (firma ? ` zu ${firma}` : "");

const VORLAGEN: Record<"lob" | "kritik", Record<Anrede, [Ton, Ton]>> = {
  lob: {
    du: [
      ["herzlich", ({ unterschrift }) => `Hallo\nDanke für deine Bewertung und für dein Vertrauen. Es freut uns, dass du zufrieden warst. Wir hoffen, dich bald wieder bei uns zu sehen.\nLiebe Grüsse\n${unterschrift}`],
      ["sachlich", ({ firma, unterschrift }) => `Hallo\nVielen Dank für deine Rückmeldung${zuFirma(firma)}. Wir freuen uns, dass es für dich gepasst hat.\nFreundliche Grüsse\n${unterschrift}`],
    ],
    sie: [
      ["herzlich", ({ unterschrift }) => `Guten Tag\nDanke für Ihre Bewertung und für Ihr Vertrauen. Es freut uns, dass Sie zufrieden waren. Wir hoffen, Sie bald wieder bei uns zu sehen.\nFreundliche Grüsse\n${unterschrift}`],
      ["sachlich", ({ firma, unterschrift }) => `Guten Tag\nVielen Dank für Ihre Rückmeldung${zuFirma(firma)}. Wir freuen uns, dass es für Sie gepasst hat.\nFreundliche Grüsse\n${unterschrift}`],
    ],
  },
  kritik: {
    du: [
      ["ruhig", ({ unterschrift }) => `Hallo\nDanke, dass du dir die Zeit für eine Bewertung genommen hast. Es tut uns leid, dass dein Eindruck nicht gut war. Wir möchten verstehen, was passiert ist, und sprechen gern mit dir: ${PLATZHALTER}.\nFreundliche Grüsse\n${unterschrift}`],
      ["sachlich", ({ firma, unterschrift }) => `Hallo\nDanke für deine offene Rückmeldung${zuFirma(firma)}. Wir bedauern, dass es nicht so gelaufen ist, wie du es dir vorgestellt hast. Wir nehmen deine Kritik ernst und besprechen sie gern persönlich mit dir: ${PLATZHALTER}.\nFreundliche Grüsse\n${unterschrift}`],
    ],
    sie: [
      ["ruhig", ({ unterschrift }) => `Guten Tag\nDanke, dass Sie sich die Zeit für eine Bewertung genommen haben. Es tut uns leid, dass Ihr Eindruck nicht gut war. Wir möchten verstehen, was passiert ist, und sprechen gern mit Ihnen: ${PLATZHALTER}.\nFreundliche Grüsse\n${unterschrift}`],
      ["sachlich", ({ firma, unterschrift }) => `Guten Tag\nDanke für Ihre offene Rückmeldung${zuFirma(firma)}. Wir bedauern, dass es nicht so gelaufen ist, wie Sie es sich vorgestellt haben. Wir nehmen Ihre Kritik ernst und besprechen sie gern persönlich mit Ihnen: ${PLATZHALTER}.\nFreundliche Grüsse\n${unterschrift}`],
    ],
  },
};

/**
 * Zwei feste Texte für den Fall, dass die KI nicht antwortet (Ausfall, Tagesgrenze): bei 1 bis 3 Sternen Bedauern mit
 * Gesprächsangebot, bei 4 und 5 Sternen Dank. Neutral, in Du oder Sie, ohne Zahlen und ohne Versprechen. Die Person
 * passt sie an; sie sind kein KI-Entwurf und gehen nicht als solcher ins CRM.
 */
export function fallbackVorlagen(sterne: number, anrede: Anrede, firma: string, unterschrift: string): Variante[] {
  const art = istKritik(sterne) ? "kritik" : "lob";
  const p = { firma: squash(firma), unterschrift: squash(unterschrift) };
  return VORLAGEN[art][anrede].map(([ton, text]) => ({ ton, text: text(p).replace(/\n$/, "") }));
}

// ---- Dokument ------------------------------------------------------------------------------------

/** DocumentModel für den CRM-Text (Markdown). Kein Download: das Werkzeug gibt nur Texte zum Kopieren aus. */
export function toDocument(output: BewertungOutput, input: BewertungInput): DocumentModel {
  const betrieb = input.betrieb || "Dein Betrieb";
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Sterne", value: sterneLabel(input.sterne) },
        { label: "Anrede", value: anredeLabel(input.anrede) },
      ],
    },
    ...output.varianten.flatMap<DocBlock>((v, i) => [
      { type: "heading", level: 1, text: varianteTitel(v, i) },
      { type: "paragraph", text: v.text },
    ]),
  ];
  return {
    title: "Antwort auf eine Bewertung",
    subtitle: `Für ${betrieb}`,
    filename: `bewertungsantwort-${safeFilename(betrieb, "betrieb")}`,
    blocks,
  };
}

/** Der Entwurf als Markdown fürs CRM. */
export function reportMarkdown(output: BewertungOutput, input: BewertungInput): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Profil --------------------------------------------------------------------------------------

export type ProfilePatch = { marke?: Record<string, unknown> };

/**
 * Was das Werkzeug ins Firmenprofil schreibt (writesProfile: marke): die Regeln der Person unter marke.bewertungsregeln.
 * Sie ersetzen, was dort stand; das ist die Absicht der Person. Andere Schlüssel in «marke» bleiben. Eine Regel, die das
 * Formular nur gekürzt zeigte (über 120 Zeichen) und die Person nicht geändert hat, bleibt im Profil in voller Länge.
 * Leeres Objekt: nichts zu schreiben (keine Regeln und keine im Profil, oder nichts hat sich geändert).
 */
export function profilePatch(profile: Pick<Profile, "marke">, regeln: string[]): ProfilePatch {
  const bisher = profilRegeln(profile);
  const gezeigt = regelnVorschlag(profile);
  const neu = cleanRegeln(regeln).map((r) => {
    const j = gezeigt.indexOf(r);
    return j >= 0 ? bisher[j] : r;
  });
  if (neu.length === bisher.length && neu.every((r, i) => r === bisher[i])) return {};
  return { marke: { ...(profile.marke ?? {}), bewertungsregeln: neu } };
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

/**
 * `vorlage`: true, wenn statt eines KI-Entwurfs die feste Vorlage erscheint (KI nicht erreichbar). Dann ist `output` leer;
 * die Vorlage folgt aus der Eingabe (`shownVarianten`) und zählt im Pfad nicht als erledigt.
 */
export type BewertungState = { v: 1; input: BewertungInput | null; output: BewertungOutput | null; vorlage: boolean };

export const EMPTY_STATE: BewertungState = { v: 1, input: null, output: null, vorlage: false };

/** Liest den gespeicherten Stand; bei kaputten Daten oder falscher Version gilt der leere Stand. Ein kaputter Entwurf fällt allein weg, die Eingabe bleibt. */
export function parseState(raw: unknown): BewertungState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<BewertungState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = bewertungInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = bewertungOutput.safeParse(r.output);
  return {
    v: 1,
    input: input.data,
    output: output.success ? output.data : null,
    vorlage: !output.success && r.vorlage === true,
  };
}

/** Die Varianten, die das Ergebnis zeigt: der KI-Entwurf oder die feste Vorlage. null, wenn es nichts zu zeigen gibt. */
export function shownVarianten(state: BewertungState): { varianten: Variante[]; vorlage: boolean } | null {
  if (state.output) return { varianten: state.output.varianten, vorlage: false };
  if (state.vorlage && state.input) {
    const { sterne, anrede, betrieb, unterschrift } = state.input;
    return { varianten: fallbackVorlagen(sterne, anrede, betrieb, unterschrift), vorlage: true };
  }
  return null;
}
