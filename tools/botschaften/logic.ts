import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { ANREDE_KEYS, KANAL_KEYS, LIMITS, botschaftenInput, botschaftenOutput, type AnredeKey, type BotschaftenInput, type BotschaftenOutput, type KanalKey } from "./generator";

// Kernbotschaften: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts; hier stehen Labels, Vorschlag aus dem Profil, Eingabeprüfung,
// Dokument, CRM-Texte und der gespeicherte Stand. Spec: specs/botschaften.md

export const SLUG = "botschaften";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

/** Zeichen eines Textes, wie Google und Instagram sie zählen (je Zeichen, nicht je Byte). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---- Anrede und Kanäle ---------------------------------------------------------------------------

export const ANREDEN: { key: AnredeKey; label: string }[] = [
  { key: "du", label: "Du: wir duzen unsere Kundschaft" },
  { key: "sie", label: "Sie: wir siezen unsere Kundschaft" },
];

export function isAnrede(value: unknown): value is AnredeKey {
  return typeof value === "string" && (ANREDE_KEYS as readonly string[]).includes(value);
}

/** «Du» oder «Sie» für Dokument und CRM. */
export function anredeLabel(key: AnredeKey): string {
  return key === "du" ? "Du" : "Sie";
}

export type KanalInfo = { key: KanalKey; label: string; copyLabel: string; max: number };

export const KANAELE: KanalInfo[] = [
  { key: "website", label: "Website", copyLabel: "Website-Text kopieren", max: 240 },
  { key: "googleProfil", label: "Google-Unternehmensprofil", copyLabel: "Google-Text kopieren", max: 300 },
  { key: "instagram", label: "Instagram", copyLabel: "Instagram-Text kopieren", max: 200 },
  { key: "offerteOderMail", label: "Offerte oder Mail", copyLabel: "Offerten-Text kopieren", max: 400 },
];

export const TELEFON: { label: string; copyLabel: string; max: number } = { label: "Telefonsatz", copyLabel: "Telefonsatz kopieren", max: 200 };

export function isKanalKey(value: unknown): value is KanalKey {
  return typeof value === "string" && (KANAL_KEYS as readonly string[]).includes(value);
}

export function kanalLabel(key: KanalKey): string {
  return KANAELE.find((k) => k.key === key)?.label ?? key;
}

/** «118 von 240 Zeichen» für die Anzeige neben dem Kopieren-Knopf. */
export function zeichenLabel(text: string, max: number): string {
  return `${charCount(text)} von ${max} Zeichen`;
}

// ---- Eingabe -------------------------------------------------------------------------------------

export type ProfileFields = Pick<Profile, "firma" | "branche" | "ort" | "positionierung" | "primaersegment" | "personas" | "zielgruppen">;

/** Was die Person im Formular tippt. Die Anrede ist leer, bis sie gewählt ist. */
export type FormValues = { zielgruppe: string; angebot: string; wirkung: string; beweise: string; anrede: AnredeKey | "" };

export const EMPTY_FORM: FormValues = { zielgruppe: "", angebot: "", wirkung: "", beweise: "", anrede: "" };

const oneLine = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const multiLine = (s: string | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, max);

/** Vorschlag für «Für wen?»: das Primärsegment, sonst die erste Zielgruppe aus dem Profil, sonst leer. */
export function zielgruppeVorschlag(profile: Pick<Profile, "primaersegment" | "zielgruppen">): string {
  const primaer = oneLine(profile.primaersegment, LIMITS.zielgruppe);
  if (primaer) return primaer;
  const erste = profile.zielgruppen?.[0]?.name;
  return oneLine(typeof erste === "string" ? erste : "", LIMITS.zielgruppe);
}

/** Namen der Personas aus dem Profil: ohne Leere, ohne Doppel, höchstens LIMITS.personas à LIMITS.personaName Zeichen. */
export function personaNamen(profile: Pick<Profile, "personas">): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of profile.personas ?? []) {
    const name = oneLine(typeof p?.name === "string" ? p.name : "", LIMITS.personaName);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= LIMITS.personas) break;
  }
  return out;
}

/** Was aus dem Profil als Hintergrund mitgeht und auf der Seite als Hinweis steht. Leer, wo nichts da ist. */
export type ProfilHinweise = { positionierung: string; primaersegment: string; personas: string[] };

export function profilHinweise(profile: Pick<Profile, "positionierung" | "primaersegment" | "personas">): ProfilHinweise {
  return {
    positionierung: multiLine(profile.positionierung, LIMITS.positionierung),
    primaersegment: oneLine(profile.primaersegment, LIMITS.primaersegment),
    personas: personaNamen(profile),
  };
}

/**
 * Namen der Profil-Teile, die an die KI gehen, für den Satz vor dem Knopf («dazu Positionierung und Persona-Namen aus
 * deinem Profil»). Das Primärsegment zählt nur, wenn es nicht wörtlich im Feld «Für wen?» steht (siehe toInput).
 */
export function hinweisNamen(hinweise: ProfilHinweise, zielgruppe = ""): string[] {
  const out: string[] = [];
  if (hinweise.positionierung) out.push("Positionierung");
  if (hinweise.primaersegment && hinweise.primaersegment.toLowerCase() !== oneLine(zielgruppe, LIMITS.zielgruppe).toLowerCase()) out.push("Primärsegment");
  if (hinweise.personas.length > 0) out.push("Persona-Namen");
  return out;
}

/** «A, B und C» für Aufzählungen im Fliesstext. */
export function joinNamen(namen: string[]): string {
  if (namen.length <= 1) return namen.join("");
  return `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. Der Server prüft mit demselben Schema noch einmal. */
export function inputProblem(fields: Pick<ProfileFields, "firma">, values: FormValues): string | null {
  if (!oneLine(fields.firma, LIMITS.betrieb)) return "Gib den Namen deines Betriebs an.";
  if (!oneLine(values.zielgruppe, LIMITS.zielgruppe)) return "Sag, für wen dein Angebot ist, zum Beispiel «Hausbesitzer in der Region Gossau».";
  if (multiLine(values.angebot, LIMITS.angebot).length < LIMITS.angebotMin) return `Beschreib dein Angebot in mindestens ${LIMITS.angebotMin} Zeichen.`;
  if (multiLine(values.wirkung, LIMITS.wirkung).length < LIMITS.wirkungMin) {
    return `Sag in mindestens ${LIMITS.wirkungMin} Zeichen, was die Kundschaft nach dem Kontakt mit dir denken soll.`;
  }
  if (multiLine(values.beweise, LIMITS.beweise + 1).length > LIMITS.beweise) return `Kürze die Beweise auf ${LIMITS.beweise} Zeichen.`;
  if (!isAnrede(values.anrede)) return "Wähle, ob du deine Kundschaft duzt oder siezt.";
  return null;
}

/**
 * Eingabe des Generators aus Profil und Formular, bereinigt und gekürzt. Das Primärsegment geht nur mit, wenn es nicht
 * wörtlich dem Feld «Für wen?» entspricht; sonst stünde dieselbe Angabe zweimal in den Daten.
 */
export function toInput(fields: ProfileFields, values: FormValues): BotschaftenInput {
  const hinweise = profilHinweise(fields);
  const zielgruppe = oneLine(values.zielgruppe, LIMITS.zielgruppe);
  const primaersegment = hinweise.primaersegment.toLowerCase() === zielgruppe.toLowerCase() ? "" : hinweise.primaersegment;
  return {
    betrieb: oneLine(fields.firma, LIMITS.betrieb),
    branche: oneLine(fields.branche, LIMITS.branche),
    ort: oneLine(fields.ort, LIMITS.ort),
    zielgruppe,
    angebot: multiLine(values.angebot, LIMITS.angebot),
    wirkung: multiLine(values.wirkung, LIMITS.wirkung),
    beweise: multiLine(values.beweise, LIMITS.beweise),
    anrede: isAnrede(values.anrede) ? values.anrede : "sie",
    positionierung: hinweise.positionierung,
    primaersegment,
    personas: hinweise.personas,
  };
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function toForm(input: BotschaftenInput): FormValues {
  return { zielgruppe: input.zielgruppe, angebot: input.angebot, wirkung: input.wirkung, beweise: input.beweise, anrede: input.anrede };
}

/** Die Angaben fürs CRM, eine je Zeile. Der Server kürzt auf 1'900 Zeichen; das Wichtigste steht darum oben. */
export function eingabeText(input: BotschaftenInput): string {
  return [
    `Betrieb: ${input.betrieb}`,
    input.branche ? `Branche: ${input.branche}` : "",
    input.ort ? `Ort: ${input.ort}` : "",
    `Für wen: ${input.zielgruppe}`,
    `Anrede: ${anredeLabel(input.anrede)}`,
    `Angebot: ${input.angebot}`,
    `Soll denken: ${input.wirkung}`,
    input.beweise ? `Beweise: ${input.beweise}` : "",
    input.positionierung ? `Positionierung: ${input.positionierung}` : "",
    input.primaersegment ? `Primärsegment: ${input.primaersegment}` : "",
    input.personas.length > 0 ? `Personas: ${input.personas.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ------------------------------------------------------------------------------------

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(output: BotschaftenOutput, input: BotschaftenInput): DocumentModel {
  const betrieb = input.betrieb || "Dein Betrieb";
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Betrieb", value: input.ort ? `${betrieb}, ${input.ort}` : betrieb },
        { label: "Für wen", value: input.zielgruppe || "keine Angabe" },
        { label: "Anrede", value: anredeLabel(input.anrede) },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: "Hauptbotschaft" },
    { type: "paragraph", text: output.hauptbotschaft },
    { type: "heading", level: 1, text: "Botschaften je Zielgruppe oder Anlass" },
    {
      type: "table",
      header: ["Für", "Botschaft", "Beleg"],
      rows: output.botschaften.map((b) => [b.fuer, b.satz, b.beleg]),
      widths: [1, 2, 2],
    },
    { type: "heading", level: 1, text: "Fassung je Kanal" },
    { type: "facts", items: KANAELE.map((k) => ({ label: k.label, value: output.kanaele[k.key] })) },
    { type: "heading", level: 1, text: "Am Telefon oder am Stand" },
    { type: "paragraph", text: output.telefonsatz },
    { type: "heading", level: 1, text: "Das sagen wir nicht" },
    { type: "list", items: output.nichtSagen },
  ];
  return {
    title: "Kernbotschaften",
    subtitle: `Für ${betrieb}`,
    filename: `botschaften-${safeFilename(betrieb, "betrieb")}`,
    blocks,
  };
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: BotschaftenOutput, input: BotschaftenInput): string {
  return toMarkdown(toDocument(output, input));
}

/** Blöcke für den Bildschirm: ohne den KI-Hinweis, den die Karte selbst über dem Entwurf zeigt. */
export function viewBlocks(doc: DocumentModel): DocBlock[] {
  return doc.blocks.filter((b) => !(b.type === "paragraph" && b.text === KI_HINWEIS));
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type BotschaftenState = { v: 1; input: BotschaftenInput | null; output: BotschaftenOutput | null };

export const EMPTY_STATE: BotschaftenState = { v: 1, input: null, output: null };

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ein Entwurf ohne gültige Eingabe fällt weg. */
export function parseState(raw: unknown): BotschaftenState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<BotschaftenState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = botschaftenInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = botschaftenOutput.safeParse(r.output);
  return { v: 1, input: input.data, output: output.success ? output.data : null };
}
