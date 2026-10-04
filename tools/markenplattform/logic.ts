import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile, ProfileKey } from "@/lib/profile";
import type { PageRead } from "@/lib/read";
import { ANREDE_KEYS, LIMITS, markenInput, markenOutput, type AnredeKey, type MarkenInput, type MarkenOutput } from "./generator";

// Markenplattform: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Die Website liest /api/read (lib/read-client.ts), den Entwurf macht /api/generate über generator.ts. Hier stehen
// Anreden, Vorschläge aus dem Profil, Eingabeprüfung, Eingabe für die KI, Dokument, CRM-Texte, Profil-Ergänzung und
// der gespeicherte Stand. Spec: specs/markenplattform.md

export const SLUG = "markenplattform";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

export const ANREDEN: { key: AnredeKey; label: string }[] = [
  { key: "du", label: "Du" },
  { key: "sie", label: "Sie" },
];

export function isAnrede(value: unknown): value is AnredeKey {
  return typeof value === "string" && (ANREDE_KEYS as readonly string[]).includes(value);
}

export function anredeLabel(key: AnredeKey): string {
  return ANREDEN.find((a) => a.key === key)?.label ?? key;
}

/** Zeichen eines Textes, wie die Anzeige sie zählt (je Zeichen, nicht je Byte). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---- Eingabe -----------------------------------------------------------------------------------

export type ProfileFields = Pick<Profile, "firma" | "branche" | "ort" | "website" | "positionierung" | "primaersegment">;

/** Was die Person im Formular tippt. `websiteLesen` null: noch nicht angefasst, dann gilt der Vorschlag aus dem Profil. */
export type FormValues = {
  wofuer: string;
  woerterKundschaft: string;
  nie: string;
  anrede: AnredeKey | "";
  websiteLesen: boolean | null;
};

export const EMPTY_FORM: FormValues = { wofuer: "", woerterKundschaft: "", nie: "", anrede: "", websiteLesen: null };

const oneLine = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const multiLine = (s: string | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** Grobe Prüfung im Browser; der Server prüft mit normalizeUrl noch einmal (keine IP, kein internes Netz). Vorbild: ideen-aus-website. */
export function looksLikeWebsite(website: string | undefined): boolean {
  const s = (website ?? "").trim();
  if (!s || s.length > 300 || /\s/.test(s)) return false;
  const host = s.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
  return /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?::\d{1,5})?$/u.test(host);
}

/** Host ohne «www.» für die Anzeige; bei kaputter Adresse die Eingabe selbst. */
export function hostOf(website: string | undefined): string {
  const s = (website ?? "").trim();
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return s;
  }
}

/** Vorschlag für «Website lesen»: an, wenn im Profil eine brauchbare Adresse steht. */
export function websiteLesenVorschlag(profile: Pick<Profile, "website">): boolean {
  return looksLikeWebsite(profile.website);
}

/** Was aus dem Profil als Hinweiszeile erscheint und als Feld mitgeht: Positionierung und Primärsegment, gekürzt. */
export function profilHinweise(profile: Pick<Profile, "positionierung" | "primaersegment">): { positionierung: string; zielgruppe: string } {
  return { positionierung: oneLine(profile.positionierung, LIMITS.positionierung), zielgruppe: oneLine(profile.primaersegment, LIMITS.zielgruppe) };
}

/** Das Formular mit dem Vorschlag aus dem Profil, solange die Checkbox nicht angefasst wurde. */
export function withVorschlag(form: FormValues, profile: Pick<Profile, "website">): FormValues & { websiteLesen: boolean } {
  return { ...form, websiteLesen: form.websiteLesen ?? websiteLesenVorschlag(profile) };
}

/** Meldet, warum es nicht losgehen kann, in der Reihenfolge des Formulars. null: in Ordnung. Der Server prüft mit demselben Schema noch einmal. */
export function inputProblem(fields: Pick<ProfileFields, "firma" | "website">, form: FormValues): string | null {
  if (!oneLine(fields.firma, LIMITS.betrieb)) return "Gib den Namen deines Betriebs an.";
  const wofuer = multiLine(form.wofuer, LIMITS.wofuer + 1);
  if (wofuer.length < LIMITS.wofuerMin) return `Sag in mindestens ${LIMITS.wofuerMin} Zeichen, wofür dein Betrieb steht.`;
  if (wofuer.length > LIMITS.wofuer) return `Der Text zu deinem Betrieb ist zu lang. Es sind höchstens ${LIMITS.wofuer} Zeichen möglich.`;
  const woerter = oneLine(form.woerterKundschaft, LIMITS.woerterKundschaft + 1);
  if (!woerter) return "Nenne drei Wörter, mit denen deine Kundschaft dich beschreiben soll.";
  if (woerter.length > LIMITS.woerterKundschaft) return `Die drei Wörter sind zu lang. Es sind höchstens ${LIMITS.woerterKundschaft} Zeichen möglich.`;
  if (multiLine(form.nie, LIMITS.nie + 1).length > LIMITS.nie) return `Die Angabe, was du nie sagen würdest, ist zu lang. Es sind höchstens ${LIMITS.nie} Zeichen möglich.`;
  if (!isAnrede(form.anrede)) return "Wähle die Anrede: Du oder Sie.";
  if (form.websiteLesen === true && !looksLikeWebsite(fields.website)) {
    return "Für «Website lesen» brauchen wir eine gültige Adresse, zum Beispiel malerei-keller.ch. Oder nimm das Häkchen weg.";
  }
  return null;
}

export type PageLike = Pick<PageRead, "host" | "headings" | "text">;

/** Eingabe des Generators aus Profil, Formular und gelesener Seite (null: keine Website). null, wenn die Anrede fehlt (vorher inputProblem). */
export function toInput(fields: ProfileFields, form: FormValues, page: PageLike | null): MarkenInput | null {
  if (!isAnrede(form.anrede)) return null;
  const hinweise = profilHinweise(fields);
  const candidate: MarkenInput = {
    betrieb: oneLine(fields.firma, LIMITS.betrieb),
    branche: oneLine(fields.branche, LIMITS.branche),
    ort: oneLine(fields.ort, LIMITS.ort),
    positionierung: hinweise.positionierung,
    zielgruppe: hinweise.zielgruppe,
    wofuer: multiLine(form.wofuer, LIMITS.wofuer),
    woerterKundschaft: oneLine(form.woerterKundschaft, LIMITS.woerterKundschaft),
    nie: multiLine(form.nie, LIMITS.nie),
    anrede: form.anrede,
    websiteText: page ? oneLine(page.text, LIMITS.websiteText) : "",
    headings: page
      ? page.headings
          .map((h) => oneLine(h, LIMITS.heading))
          .filter(Boolean)
          .slice(0, LIMITS.headings)
      : [],
  };
  const parsed = markenInput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». `website` ist der Host der gelesenen Seite oder leer. */
export function toForm(input: MarkenInput | null, website = ""): FormValues {
  if (!input) return EMPTY_FORM;
  return { wofuer: input.wofuer, woerterKundschaft: input.woerterKundschaft, nie: input.nie, anrede: input.anrede, websiteLesen: website !== "" };
}

/** Die Eingabe, wie sie im Browser bleibt: ohne den Text der Website (die Überschriften bleiben). */
export function storedInput(input: MarkenInput): MarkenInput {
  return { ...input, websiteText: "" };
}

/** Freitext mit Absätzen auf eine Zeile: Zeilenumbrüche werden zu « / ». */
const flat = (s: string) => s.replace(/\s*\n+\s*/g, " / ");

/** Die Angaben fürs CRM, eine je Zeile; das Wichtigste zuerst, der Server kürzt auf 1'900 Zeichen. Nicht der Text der Website. */
export function eingabeText(input: MarkenInput): string {
  return [
    `Betrieb: ${input.betrieb}`,
    input.branche ? `Branche: ${input.branche}` : "",
    input.ort ? `Ort: ${input.ort}` : "",
    `Anrede: ${anredeLabel(input.anrede)}`,
    `Wofür der Betrieb steht: ${flat(input.wofuer)}`,
    `Drei Wörter: ${input.woerterKundschaft}`,
    input.nie ? `Nie: ${flat(input.nie)}` : "",
    input.zielgruppe ? `Primärsegment: ${input.zielgruppe}` : "",
    input.positionierung ? `Positionierung: ${input.positionierung}` : "",
    `Website gelesen: ${input.websiteText || input.headings.length > 0 ? "ja" : "nein"}`,
    input.headings.length > 0 ? `Überschriften: ${input.headings.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Entwurf -----------------------------------------------------------------------------------

/** «heutigerTon» gibt es nur mit gelesener Website; sonst wird das Feld geleert, bevor der Entwurf gespeichert wird. */
export function normalizeOutput(output: MarkenOutput, websiteGelesen: boolean): MarkenOutput {
  return websiteGelesen ? output : { ...output, heutigerTon: "" };
}

// ---- Dokument ----------------------------------------------------------------------------------

export const ABSCHNITTE = {
  versprechen: "Versprechen",
  werte: "Werte",
  persoenlichkeit: "Persönlichkeit",
  tonalitaet: "Tonalität",
  woerter: "Wörter",
  geschichte: "Geschichte",
  bewertungsregeln: "Antworten auf Bewertungen",
  heutigerTon: "Heutiger Ton deiner Website",
} as const;

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. Ohne Eingabe (kaputter Stand) stehen die Facts auf «keine Angabe». */
export function toDocument(output: MarkenOutput, input: Pick<MarkenInput, "betrieb" | "ort" | "anrede"> | null): DocumentModel {
  const betrieb = input?.betrieb || "";
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Betrieb", value: betrieb ? (input?.ort ? `${betrieb}, ${input.ort}` : betrieb) : "keine Angabe" },
        { label: "Anrede der Kundschaft", value: input ? anredeLabel(input.anrede) : "keine Angabe" },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: ABSCHNITTE.versprechen },
    { type: "paragraph", text: output.versprechen },
    { type: "heading", level: 1, text: ABSCHNITTE.werte },
    { type: "list", items: output.werte.map((w) => `${w.name}: ${w.satz}`) },
    { type: "heading", level: 1, text: ABSCHNITTE.persoenlichkeit },
    { type: "paragraph", text: output.persoenlichkeit.join(", ") },
    { type: "heading", level: 1, text: ABSCHNITTE.tonalitaet },
    {
      type: "facts",
      items: [
        { label: "So schreiben wir", value: output.tonalitaet.so },
        { label: "So nicht", value: output.tonalitaet.nichtSo },
        { label: "Beispielsatz", value: output.tonalitaet.beispielSatz },
      ],
    },
    { type: "heading", level: 1, text: ABSCHNITTE.woerter },
    { type: "heading", level: 2, text: "Verwenden" },
    { type: "list", items: output.woerter.verwenden },
    { type: "heading", level: 2, text: "Vermeiden" },
    { type: "list", items: output.woerter.vermeiden },
    { type: "heading", level: 1, text: ABSCHNITTE.geschichte },
    { type: "paragraph", text: output.geschichte },
    { type: "heading", level: 1, text: ABSCHNITTE.bewertungsregeln },
    { type: "list", items: output.bewertungsregeln },
  ];
  if (output.heutigerTon.trim()) {
    blocks.push({ type: "heading", level: 1, text: ABSCHNITTE.heutigerTon }, { type: "paragraph", text: output.heutigerTon });
  }
  return {
    title: "Markenplattform",
    subtitle: betrieb ? `Für ${betrieb}` : "Für deinen Betrieb",
    firma: betrieb || undefined,
    filename: `markenplattform-${safeFilename(betrieb, "betrieb")}`,
    blocks,
  };
}

/** Blöcke für den Bildschirm: ohne den KI-Hinweis, den die Karte selbst über dem Entwurf zeigt. PDF, Word und Copy behalten ihn. */
export function viewBlocks(doc: DocumentModel): DocBlock[] {
  return doc.blocks.filter((b) => !(b.type === "paragraph" && b.text === KI_HINWEIS));
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: MarkenOutput, input: Pick<MarkenInput, "betrieb" | "ort" | "anrede"> | null): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Profil ------------------------------------------------------------------------------------

export type ProfilePatch = Partial<Record<ProfileKey, unknown>>;

/** Hat das Profil schon eine Marke mit Werten? Dann bleibt sie, wie sie ist (Harte Regel 10). */
export function hatMarke(profile: Pick<Profile, "marke">): boolean {
  const werte = profile.marke?.werte;
  return Array.isArray(werte) && werte.some((w) => typeof w === "string" && w.trim() !== "");
}

/**
 * Was das Werkzeug ins Firmenprofil schreibt (writesProfile: marke), nur nach einem frisch erzeugten Entwurf und nur,
 * wenn das Profil noch keine Marke mit Werten hat. Andere Schlüssel in «marke» bleiben. Leeres Objekt: nichts schreiben.
 */
export function profilePatch(profile: Pick<Profile, "marke">, output: MarkenOutput, input: Pick<MarkenInput, "anrede">): ProfilePatch {
  if (hatMarke(profile)) return {};
  return {
    marke: {
      ...(profile.marke ?? {}),
      werte: output.werte.map((w) => w.name),
      persoenlichkeit: { eigenschaften: output.persoenlichkeit },
      tonalitaet: { so: output.tonalitaet.so, nichtSo: output.tonalitaet.nichtSo, anrede: input.anrede },
      woerter: { verwenden: output.woerter.verwenden, vermeiden: output.woerter.vermeiden },
      bewertungsregeln: output.bewertungsregeln,
    },
  };
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

/** `website`: Host der gelesenen Startseite oder leer. Die Eingabe steht ohne den Text der Website. */
export type MarkenState = { v: 1; input: MarkenInput | null; output: MarkenOutput | null; website: string };

export const EMPTY_STATE: MarkenState = { v: 1, input: null, output: null, website: "" };

/** Liest den gespeicherten Stand; bei kaputten Daten oder falscher Version gilt der leere Stand. Ein kaputter Entwurf fällt allein weg, die Eingabe bleibt. */
export function parseState(raw: unknown): MarkenState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<MarkenState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = markenInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = markenOutput.safeParse(r.output);
  return {
    v: 1,
    input: input.data,
    output: output.success ? output.data : null,
    website: typeof r.website === "string" ? r.website.slice(0, 200) : "",
  };
}
