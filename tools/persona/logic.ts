import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import {
  ALTERSGRUPPE_KEYS,
  MAX_ANGEBOT_CHARS,
  MAX_FREITEXT_CHARS,
  MAX_ZIELGRUPPE_CHARS,
  MIN_ANGEBOT_CHARS,
  ROLLE_KEYS,
  altersgruppeLabel,
  personaInput,
  personaOutput,
  rolleLabel,
  type AltersgruppeKey,
  type PersonaInput,
  type PersonaOutput,
  type RolleKey,
} from "./generator";

// Persona-Generator: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts; hier stehen Labels, Vorschlag aus dem Profil, Eingabeprüfung,
// Dokument, CRM-Texte, Profil-Ergänzung und der gespeicherte Stand. Spec: specs/persona.md

export const SLUG = "persona";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

/** Höchstens so viele Personas im Firmenprofil (lib/profile.ts: personas max 10). */
export const MAX_PERSONAS = 10;

export { ALTERSGRUPPEN, ROLLEN, altersgruppeLabel, rolleLabel } from "./generator";

export function isAltersgruppe(value: unknown): value is AltersgruppeKey {
  return typeof value === "string" && (ALTERSGRUPPE_KEYS as readonly string[]).includes(value);
}

export function isRolle(value: unknown): value is RolleKey {
  return typeof value === "string" && (ROLLE_KEYS as readonly string[]).includes(value);
}

// ---- Eingabe -----------------------------------------------------------------------------------

export type ProfileFields = Pick<Profile, "firma" | "branche" | "ort">;

/** Was die Person im Formular tippt. Altersgruppe und Rolle sind leer, bis sie gewählt sind. */
export type PersonaForm = {
  zielgruppe: string;
  angebot: string;
  altersgruppe: AltersgruppeKey | "";
  rolle: RolleKey | "";
  situation: string;
  fragen: string;
};

export const EMPTY_FORM: PersonaForm = { zielgruppe: "", angebot: "", altersgruppe: "", rolle: "", situation: "", fragen: "" };

const oneLine = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const multiLine = (s: string | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** Vorschlag für «Für wen ist das Angebot?»: das Primärsegment, sonst die erste Zielgruppe aus dem Profil, sonst leer. */
export function zielgruppeVorschlag(profile: Pick<Profile, "primaersegment" | "zielgruppen">): string {
  const primaer = oneLine(profile.primaersegment, MAX_ZIELGRUPPE_CHARS);
  if (primaer) return primaer;
  const erste = profile.zielgruppen?.[0]?.name;
  return oneLine(typeof erste === "string" ? erste : "", MAX_ZIELGRUPPE_CHARS);
}

/** Das Formular mit dem Vorschlag aus dem Profil, solange die Zielgruppe leer ist. */
export function withVorschlag(form: PersonaForm, profile: Pick<Profile, "primaersegment" | "zielgruppen">): PersonaForm {
  return form.zielgruppe.trim() ? form : { ...form, zielgruppe: zielgruppeVorschlag(profile) };
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. Der Server prüft mit demselben Schema noch einmal. */
export function inputProblem(fields: ProfileFields, form: PersonaForm): string | null {
  if (!oneLine(fields.firma, 120)) return "Gib den Namen deines Betriebs an.";
  const zielgruppe = oneLine(form.zielgruppe, MAX_ZIELGRUPPE_CHARS + 1);
  if (!zielgruppe) return "Sag, für wen das Angebot ist, zum Beispiel «Hausbesitzer in Gossau».";
  if (zielgruppe.length > MAX_ZIELGRUPPE_CHARS) return `Die Zielgruppe ist zu lang. Es sind höchstens ${MAX_ZIELGRUPPE_CHARS} Zeichen möglich.`;
  const angebot = form.angebot.trim();
  if (angebot.length < MIN_ANGEBOT_CHARS) return `Beschreib dein Angebot für diese Gruppe in mindestens ${MIN_ANGEBOT_CHARS} Zeichen.`;
  if (angebot.length > MAX_ANGEBOT_CHARS) return `Das Angebot ist zu lang. Es sind höchstens ${MAX_ANGEBOT_CHARS} Zeichen möglich.`;
  if (!isAltersgruppe(form.altersgruppe)) return "Wähle eine Altersgruppe.";
  if (!isRolle(form.rolle)) return "Wähle eine Rolle.";
  if (form.situation.trim().length > MAX_FREITEXT_CHARS) return `Die Situation ist zu lang. Es sind höchstens ${MAX_FREITEXT_CHARS} Zeichen möglich.`;
  if (form.fragen.trim().length > MAX_FREITEXT_CHARS) return `Die Fragen sind zu lang. Es sind höchstens ${MAX_FREITEXT_CHARS} Zeichen möglich.`;
  return null;
}

/** Eingabe des Generators aus Profil und Formular. null, wenn Altersgruppe oder Rolle fehlen (vorher inputProblem). */
export function toInput(fields: ProfileFields, form: PersonaForm): PersonaInput | null {
  if (!isAltersgruppe(form.altersgruppe) || !isRolle(form.rolle)) return null;
  const candidate: PersonaInput = {
    betrieb: oneLine(fields.firma, 120),
    branche: oneLine(fields.branche, 120),
    ort: oneLine(fields.ort, 80),
    zielgruppe: oneLine(form.zielgruppe, MAX_ZIELGRUPPE_CHARS),
    angebot: multiLine(form.angebot, MAX_ANGEBOT_CHARS),
    altersgruppe: form.altersgruppe,
    rolle: form.rolle,
    situation: multiLine(form.situation, MAX_FREITEXT_CHARS),
    fragen: multiLine(form.fragen, MAX_FREITEXT_CHARS),
  };
  const parsed = personaInput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Das Formular, wie es zu einer Eingabe gehört (nach dem Neuladen bleibt es gefüllt). */
export function formFromInput(input: PersonaInput): PersonaForm {
  return { zielgruppe: input.zielgruppe, angebot: input.angebot, altersgruppe: input.altersgruppe, rolle: input.rolle, situation: input.situation, fragen: input.fragen };
}

/** Freitext mit Absätzen auf eine Zeile: Zeilenumbrüche werden zu « / ». */
const flat = (s: string) => s.replace(/\s*\n+\s*/g, " / ");

/** Die Angaben fürs CRM, eine je Zeile; das Wichtigste zuerst, der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: PersonaInput): string {
  return [
    `Zielgruppe: ${input.zielgruppe}`,
    `Betrieb: ${input.betrieb}`,
    input.branche ? `Branche: ${input.branche}` : "",
    input.ort ? `Ort: ${input.ort}` : "",
    `Altersgruppe: ${altersgruppeLabel(input.altersgruppe)}`,
    `Rolle: ${rolleLabel(input.rolle)}`,
    `Angebot: ${flat(input.angebot)}`,
    input.situation ? `Situation: ${flat(input.situation)}` : "",
    input.fragen ? `Fragen: ${flat(input.fragen)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ----------------------------------------------------------------------------------

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. Ohne Eingabe (kaputter Stand) stehen die Facts auf «keine Angabe». */
export function toDocument(output: PersonaOutput, input: PersonaInput | null): DocumentModel {
  const an = output.soSprichstDuSieAn;
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Zielgruppe", value: input?.zielgruppe || "keine Angabe" },
        { label: "Altersgruppe", value: input ? altersgruppeLabel(input.altersgruppe) : "keine Angabe" },
        { label: "Rolle", value: input ? rolleLabel(input.rolle) : "keine Angabe" },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "paragraph", text: output.kurz },
    { type: "heading", level: 1, text: "Alltag" },
    { type: "paragraph", text: output.alltag },
    { type: "heading", level: 1, text: "Ziele" },
    { type: "list", items: output.ziele },
    { type: "heading", level: 1, text: "Sorgen" },
    { type: "list", items: output.sorgen },
    { type: "heading", level: 1, text: "Wo sie sucht und liest" },
    { type: "list", items: output.informationswege },
    { type: "heading", level: 1, text: "Einwände" },
    { type: "list", items: output.einwaende },
    { type: "heading", level: 1, text: "So sprichst du sie an" },
    {
      type: "facts",
      items: [
        { label: "Ton", value: an.ton },
        { label: "Wörter, die ankommen", value: an.woerter.join(", ") },
        { label: "Wörter, die abschrecken", value: an.vermeiden.join(", ") },
      ],
    },
    { type: "heading", level: 1, text: "Fiktives Zitat" },
    { type: "paragraph", text: `«${output.zitat}»` },
  ];
  return {
    title: `Persona: ${output.name}`,
    subtitle: input ? `Eine erfundene Person aus der Zielgruppe «${input.zielgruppe}» von ${input.betrieb}` : "Eine erfundene Person aus deiner Zielgruppe",
    filename: `persona-${safeFilename(output.name, "entwurf")}`,
    blocks,
  };
}

/** Die Blöcke für den Bildschirm: ohne den KI-Hinweis, den die Karte selbst zeigt. PDF, Word und Copy behalten ihn. */
export function screenBlocks(doc: DocumentModel): DocBlock[] {
  return doc.blocks.filter((b) => !(b.type === "paragraph" && b.text === KI_HINWEIS));
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: PersonaOutput, input: PersonaInput | null): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Profil --------------------------------------------------------------------------------------

export type PersonaEntry = { name: string; zielgruppe: string; kurz: string };
/** Bestehende Einträge können aus anderen Werkzeugen stammen und andere Felder tragen. */
export type ProfilePatch = { personas?: ({ name: string } & Record<string, unknown>)[] };

/**
 * Was der Generator ins Firmenprofil schreibt (writesProfile: personas), nur nach einem frisch erzeugten Entwurf:
 * die Persona wird angehängt; gleicher Name (ohne Gross/Klein) ersetzt den alten Eintrag; mehr als MAX_PERSONAS
 * verdrängt den ältesten. Andere Felder der Einträge bleiben, wie sie sind.
 */
export function profilePatch(profile: Pick<Profile, "personas">, output: PersonaOutput, input: PersonaInput): ProfilePatch {
  const entry: PersonaEntry = { name: output.name.trim(), zielgruppe: input.zielgruppe, kurz: output.kurz };
  const existing = (profile.personas ?? []).filter((p) => typeof p?.name === "string");
  const key = entry.name.toLowerCase();
  const index = existing.findIndex((p) => p.name.trim().toLowerCase() === key);
  const personas = index >= 0 ? existing.map((p, i) => (i === index ? { ...p, ...entry } : p)) : [...existing, entry];
  return { personas: personas.slice(-MAX_PERSONAS) };
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type PersonaState = { v: 1; form: PersonaForm; input: PersonaInput | null; output: PersonaOutput | null };

export const EMPTY_STATE: PersonaState = { v: 1, form: EMPTY_FORM, input: null, output: null };

function parseForm(raw: unknown): PersonaForm {
  if (typeof raw !== "object" || raw === null) return EMPTY_FORM;
  const r = raw as Partial<Record<keyof PersonaForm, unknown>>;
  // Etwas länger als erlaubt bleibt stehen, damit die Meldung «zu lang» beim nächsten Klick kommt; Riesiges fällt weg.
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : "");
  return {
    zielgruppe: text(r.zielgruppe),
    angebot: text(r.angebot),
    altersgruppe: isAltersgruppe(r.altersgruppe) ? r.altersgruppe : "",
    rolle: isRolle(r.rolle) ? r.rolle : "",
    situation: text(r.situation),
    fragen: text(r.fragen),
  };
}

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand, ein kaputter Entwurf fällt allein weg. */
export function parseState(raw: unknown): PersonaState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<PersonaState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = personaInput.safeParse(r.input);
  const output = personaOutput.safeParse(r.output);
  return {
    v: 1,
    form: parseForm(r.form),
    input: input.success ? input.data : null,
    output: output.success ? output.data : null,
  };
}
