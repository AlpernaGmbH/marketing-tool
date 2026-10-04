import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { BAUSTEIN_KEYS, GOOGLE_MAX, LIMITS, nutzenInput, nutzenOutput, type BausteinKey, type NutzenInput, type NutzenOutput } from "./generator";

// Nutzenversprechen: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts. Spec: specs/nutzenversprechen.md

export const SLUG = "nutzenversprechen";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

/** Zeichen eines Textes, wie Google und Instagram sie zählen (je Zeichen, nicht je Byte). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---- Bausteine -----------------------------------------------------------------------------------

export type BausteinInfo = { key: BausteinKey; label: string; max: number; copyLabel: string; hint?: string };

export const BAUSTEINE: BausteinInfo[] = [
  { key: "websiteTitel", label: "Website-Titel", max: 70, copyLabel: "Website-Titel kopieren" },
  { key: "websiteUntertitel", label: "Website-Untertitel", max: 160, copyLabel: "Website-Untertitel kopieren" },
  { key: "googleBeschreibung", label: "Google-Beschreibung", max: GOOGLE_MAX, copyLabel: "Google-Beschreibung kopieren", hint: "Feldgrenze bei Google" },
  { key: "instagramBio", label: "Instagram-Bio", max: 150, copyLabel: "Instagram-Bio kopieren" },
  { key: "einSatzAmTelefon", label: "Telefonsatz", max: 200, copyLabel: "Telefonsatz kopieren" },
];

export function bausteinLabel(key: BausteinKey): string {
  return BAUSTEINE.find((b) => b.key === key)?.label ?? key;
}

/** «412 von 750 Zeichen» für die Anzeige neben dem Kopieren-Knopf. */
export function zeichenLabel(text: string, max: number): string {
  return `${charCount(text)} von ${max} Zeichen`;
}

// ---- Eingabe -------------------------------------------------------------------------------------

export type ProfileFields = Pick<Profile, "firma" | "branche" | "ort" | "primaersegment" | "zielgruppen" | "positionierung">;

export type FormValues = { zielgruppe: string; angebot: string; problem: string; ergebnis: string; beweise: string };

export const EMPTY_FORM: FormValues = { zielgruppe: "", angebot: "", problem: "", ergebnis: "", beweise: "" };

const clip = (s: string | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, max);

/** Vorschlag für «Für wen?» aus dem Profil: das Primärsegment, sonst die erste Zielgruppe, sonst leer. */
export function zielgruppeVorschlag(profile: Pick<Profile, "primaersegment" | "zielgruppen">): string {
  const primaer = profile.primaersegment?.trim();
  if (primaer) return primaer.slice(0, LIMITS.zielgruppe);
  const erste = profile.zielgruppen?.[0]?.name?.trim();
  return erste ? erste.slice(0, LIMITS.zielgruppe) : "";
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. */
export function inputProblem(fields: Pick<ProfileFields, "firma">, values: FormValues): string | null {
  if (!clip(fields.firma, LIMITS.betrieb)) return "Gib den Namen deines Betriebs an.";
  if (!clip(values.zielgruppe, LIMITS.zielgruppe)) return "Sag, für wen dein Angebot ist, zum Beispiel «Hausbesitzer in der Region Gossau».";
  if (clip(values.angebot, LIMITS.angebot).length < LIMITS.angebotMin) return `Beschreib dein Angebot in mindestens ${LIMITS.angebotMin} Zeichen.`;
  if (clip(values.problem, LIMITS.problem).length < LIMITS.problemMin) return `Beschreib das Problem deiner Kundschaft in mindestens ${LIMITS.problemMin} Zeichen.`;
  if (clip(values.ergebnis, LIMITS.ergebnis).length < LIMITS.ergebnisMin) return `Sag in mindestens ${LIMITS.ergebnisMin} Zeichen, was die Kundschaft danach hat.`;
  if (clip(values.beweise, LIMITS.beweise + 1).length > LIMITS.beweise) return `Kürze die Beweise auf ${LIMITS.beweise} Zeichen.`;
  return null;
}

/** Eingabe des Generators aus Profil und Formular, bereinigt und gekürzt. */
export function toInput(fields: ProfileFields, values: FormValues): NutzenInput {
  return {
    betrieb: clip(fields.firma, LIMITS.betrieb),
    branche: clip(fields.branche, LIMITS.branche),
    ort: clip(fields.ort, LIMITS.ort),
    zielgruppe: clip(values.zielgruppe, LIMITS.zielgruppe),
    angebot: clip(values.angebot, LIMITS.angebot),
    problem: clip(values.problem, LIMITS.problem),
    ergebnis: clip(values.ergebnis, LIMITS.ergebnis),
    beweise: clip(values.beweise, LIMITS.beweise),
    positionierung: clip(fields.positionierung, LIMITS.positionierung),
  };
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function toForm(input: NutzenInput): FormValues {
  return { zielgruppe: input.zielgruppe, angebot: input.angebot, problem: input.problem, ergebnis: input.ergebnis, beweise: input.beweise };
}

/** Die Angaben fürs CRM, eine je Zeile. Der Server kürzt auf 1'900 Zeichen; das Wichtigste steht darum oben. */
export function eingabeText(input: NutzenInput): string {
  return [
    `Betrieb: ${input.betrieb}`,
    input.branche ? `Branche: ${input.branche}` : "",
    input.ort ? `Ort: ${input.ort}` : "",
    `Für wen: ${input.zielgruppe}`,
    `Angebot: ${input.angebot}`,
    `Problem: ${input.problem}`,
    `Ergebnis: ${input.ergebnis}`,
    input.beweise ? `Beweise: ${input.beweise}` : "",
    input.positionierung ? `Positionierung: ${input.positionierung}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ------------------------------------------------------------------------------------

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(output: NutzenOutput, input: NutzenInput): DocumentModel {
  const betrieb = input.betrieb || "Dein Betrieb";
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Betrieb", value: input.ort ? `${betrieb}, ${input.ort}` : betrieb },
        { label: "Für wen", value: input.zielgruppe || "keine Angabe" },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: "Kurz" },
    { type: "paragraph", text: output.kurz },
    { type: "heading", level: 1, text: "Mittel" },
    { type: "paragraph", text: output.mittel },
    { type: "heading", level: 1, text: "Lang" },
    { type: "paragraph", text: output.lang },
    { type: "heading", level: 1, text: "Was die Kundschaft bekommt" },
    { type: "list", items: output.nutzen },
    { type: "heading", level: 1, text: "Beweise" },
    { type: "list", items: output.beweise },
    { type: "heading", level: 1, text: "Textbausteine je Kanal" },
    {
      type: "facts",
      items: BAUSTEINE.map((b) => ({ label: `${b.label} (${charCount(output.bausteine[b.key])} Zeichen)`, value: output.bausteine[b.key] })),
    },
  ];
  return {
    title: "Nutzenversprechen",
    subtitle: `Für ${betrieb}`,
    filename: `nutzenversprechen-${safeFilename(betrieb, "betrieb")}`,
    blocks,
  };
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: NutzenOutput, input: NutzenInput): string {
  return toMarkdown(toDocument(output, input));
}

/** Blöcke für den Bildschirm: ohne den KI-Hinweis, den die Karte selbst über dem Entwurf zeigt. */
export function viewBlocks(doc: DocumentModel): DocBlock[] {
  return doc.blocks.filter((b) => !(b.type === "paragraph" && b.text === KI_HINWEIS));
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type NutzenState = { v: 1; input: NutzenInput | null; output: NutzenOutput | null };

export const EMPTY_STATE: NutzenState = { v: 1, input: null, output: null };

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ein Entwurf ohne gültige Eingabe fällt weg. */
export function parseState(raw: unknown): NutzenState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<NutzenState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = nutzenInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = nutzenOutput.safeParse(r.output);
  return { v: 1, input: input.data, output: output.success ? output.data : null };
}

export { BAUSTEIN_KEYS };
