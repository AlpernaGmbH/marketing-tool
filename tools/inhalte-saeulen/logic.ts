import { pctCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import {
  BEITRAEGE_KEYS,
  KANAL_KEYS,
  KANAL_LABELS,
  LIMITS,
  saeulenInput,
  saeulenOutput,
  type BeitraegeKey,
  type KanalKey,
  type SaeulenInput,
  type SaeulenOutput,
  type ZielKey,
} from "./generator";

// Themensäulen: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts; hier stehen Labels, Vorschläge aus dem Profil, Eingabeprüfung,
// Dokument, CRM-Texte, Profil-Ergänzung und der gespeicherte Stand. Spec: specs/inhalte-saeulen.md

export const SLUG = "inhalte-saeulen";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

export const KANAELE: { key: KanalKey; label: string }[] = KANAL_KEYS.map((key) => ({ key, label: KANAL_LABELS[key] }));

/** Vorbelegung der Kanäle, wenn das Profil keine nennt. */
export const DEFAULT_KANAELE: KanalKey[] = ["instagram", "google"];

export const BEITRAEGE: { key: BeitraegeKey; label: string }[] = [
  { key: "1", label: "1 Beitrag pro Woche" },
  { key: "2", label: "2 Beiträge pro Woche" },
  { key: "3", label: "3 Beiträge pro Woche" },
  { key: "5", label: "5 Beiträge pro Woche" },
];

export const ZIEL_LABELS: Record<ZielKey, string> = {
  vertrauen: "Vertrauen",
  sichtbarkeit: "Sichtbarkeit",
  anfragen: "Anfragen",
  bindung: "Bindung",
};

export function isKanalKey(value: unknown): value is KanalKey {
  return typeof value === "string" && (KANAL_KEYS as readonly string[]).includes(value);
}

export function isBeitraegeKey(value: unknown): value is BeitraegeKey {
  return typeof value === "string" && (BEITRAEGE_KEYS as readonly string[]).includes(value);
}

export function kanalLabel(key: KanalKey): string {
  return KANAL_LABELS[key];
}

export function beitraegeLabel(key: BeitraegeKey): string {
  return BEITRAEGE.find((b) => b.key === key)?.label ?? key;
}

/** Bekannte Kanäle in fester Reihenfolge, ohne Doppel. */
export function normalizeKanaele(kanaele: readonly unknown[]): KanalKey[] {
  return KANAL_KEYS.filter((k) => kanaele.includes(k));
}

// ---- Profil lesen --------------------------------------------------------------------------------

export type ProfileFields = Pick<Profile, "firma" | "branche" | "ort" | "positionierung" | "primaersegment" | "personas" | "kanaele">;

const oneLine = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const multiLine = (s: string | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, max);

/** Wörter, an denen ein Eintrag im Profil als Kanal erkannt wird (Einträge heissen «name» oder «kanal»). */
const KANAL_WOERTER: { key: KanalKey; re: RegExp }[] = [
  { key: "instagram", re: /instagram/i },
  { key: "facebook", re: /facebook/i },
  { key: "linkedin", re: /linkedin/i },
  { key: "google", re: /google/i },
  { key: "newsletter", re: /newsletter|e-?mail/i },
  { key: "website", re: /website|webseite|blog/i },
];

/** Kanäle aus dem Profil (Einträge mit «name» oder «kanal»), als Schlüssel in fester Reihenfolge; leer, wenn keiner passt. */
export function kanaeleAusProfil(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const namen = (profile.kanaele ?? [])
    .map((k) => {
      const r = k as Record<string, unknown>;
      return [r.name, r.kanal].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? "";
    })
    .filter(Boolean);
  const found = new Set<KanalKey>();
  for (const name of namen) for (const { key, re } of KANAL_WOERTER) if (re.test(name)) found.add(key);
  return KANAL_KEYS.filter((k) => found.has(k));
}

/** Vorbelegung der Kanäle: die aus dem Profil, sonst Instagram und Google-Beitrag. */
export function kanaeleVorschlag(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const aus = kanaeleAusProfil(profile);
  return aus.length > 0 ? aus : DEFAULT_KANAELE;
}

/** Namen der Personas aus dem Profil, höchstens LIMITS.personas, je auf LIMITS.persona Zeichen gekürzt. */
export function personaNamen(profile: Pick<Profile, "personas">): string[] {
  return (profile.personas ?? [])
    .map((p) => oneLine(typeof p?.name === "string" ? p.name : "", LIMITS.persona))
    .filter(Boolean)
    .slice(0, LIMITS.personas);
}

// ---- Eingabe -------------------------------------------------------------------------------------

/** Was die Person im Formular angibt. `kanaele` null: noch nicht angefasst, dann gilt der Vorschlag aus dem Profil. */
export type SaeulenForm = {
  angebot: string;
  alltag: string;
  kanaele: KanalKey[] | null;
  beitraegeProWoche: BeitraegeKey | "";
};

export const EMPTY_FORM: SaeulenForm = { angebot: "", alltag: "", kanaele: null, beitraegeProWoche: "" };

/** Die Kanäle, die im Formular gelten: die gewählten, sonst der Vorschlag aus dem Profil. */
export function effectiveKanaele(form: Pick<SaeulenForm, "kanaele">, profile: Pick<Profile, "kanaele">): KanalKey[] {
  return form.kanaele ?? kanaeleVorschlag(profile);
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. Der Server prüft mit demselben Schema noch einmal. */
export function inputProblem(fields: Pick<ProfileFields, "firma">, form: SaeulenForm, kanaele: readonly KanalKey[] = form.kanaele ?? []): string | null {
  if (!oneLine(fields.firma, LIMITS.betrieb)) return "Gib den Namen deines Betriebs an.";
  const angebot = multiLine(form.angebot, LIMITS.angebot + 1);
  if (angebot.length < LIMITS.angebotMin) return `Beschreib dein Angebot und die häufigsten Fragen deiner Kundschaft in mindestens ${LIMITS.angebotMin} Zeichen.`;
  if (angebot.length > LIMITS.angebot) return `Das Angebot ist zu lang. Es sind höchstens ${LIMITS.angebot} Zeichen möglich.`;
  if (multiLine(form.alltag, LIMITS.alltag + 1).length > LIMITS.alltag) return `Der Alltag ist zu lang. Es sind höchstens ${LIMITS.alltag} Zeichen möglich.`;
  if (normalizeKanaele(kanaele).length === 0) return "Wähle mindestens einen Kanal.";
  if (!isBeitraegeKey(form.beitraegeProWoche)) return "Wähle, wie viele Beiträge pro Woche realistisch sind.";
  return null;
}

/** Eingabe des Generators aus Profil und Formular, bereinigt und gekürzt. null, wenn etwas fehlt (vorher inputProblem). */
export function toInput(fields: ProfileFields, form: SaeulenForm, kanaele: readonly KanalKey[] = form.kanaele ?? []): SaeulenInput | null {
  if (!isBeitraegeKey(form.beitraegeProWoche)) return null;
  const candidate: SaeulenInput = {
    betrieb: oneLine(fields.firma, LIMITS.betrieb),
    branche: oneLine(fields.branche, LIMITS.branche),
    ort: oneLine(fields.ort, LIMITS.ort),
    positionierung: multiLine(fields.positionierung, LIMITS.positionierung),
    primaersegment: oneLine(fields.primaersegment, LIMITS.primaersegment),
    personas: personaNamen(fields),
    angebot: multiLine(form.angebot, LIMITS.angebot),
    alltag: multiLine(form.alltag, LIMITS.alltag),
    kanaele: normalizeKanaele(kanaele),
    beitraegeProWoche: form.beitraegeProWoche,
  };
  const parsed = saeulenInput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function formFromInput(input: SaeulenInput): SaeulenForm {
  return { angebot: input.angebot, alltag: input.alltag, kanaele: input.kanaele, beitraegeProWoche: input.beitraegeProWoche };
}

/** Freitext mit Absätzen auf eine Zeile: Zeilenumbrüche werden zu « / ». */
const flat = (s: string) => s.replace(/\s*\n+\s*/g, " / ");

/** Die Angaben fürs CRM, eine je Zeile; das Wichtigste zuerst, der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: SaeulenInput): string {
  return [
    `Betrieb: ${input.betrieb}`,
    input.branche ? `Branche: ${input.branche}` : "",
    input.ort ? `Ort: ${input.ort}` : "",
    `Kanäle: ${input.kanaele.map(kanalLabel).join(", ")}`,
    `Beiträge pro Woche: ${input.beitraegeProWoche}`,
    `Angebot und Fragen: ${flat(input.angebot)}`,
    input.alltag ? `Alltag: ${flat(input.alltag)}` : "",
    input.primaersegment ? `Zielgruppe: ${input.primaersegment}` : "",
    input.personas.length > 0 ? `Personas: ${input.personas.join(", ")}` : "",
    input.positionierung ? `Positionierung: ${flat(input.positionierung)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ------------------------------------------------------------------------------------

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. Ohne Eingabe (kaputter Stand) stehen die Facts auf «keine Angabe». */
export function toDocument(output: SaeulenOutput, input: SaeulenInput | null): DocumentModel {
  const betrieb = input?.betrieb ?? "";
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Betrieb", value: !betrieb ? "keine Angabe" : input?.ort ? `${betrieb}, ${input.ort}` : betrieb },
        { label: "Kanäle", value: input ? input.kanaele.map(kanalLabel).join(", ") : "keine Angabe" },
        { label: "Beiträge pro Woche", value: input ? input.beitraegeProWoche : "keine Angabe" },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
  ];
  output.saeulen.forEach((s, i) => {
    blocks.push(
      { type: "heading", level: 1, text: `${i + 1}. ${s.name}` },
      { type: "paragraph", text: s.beschreibung },
      { type: "list", items: s.beispiele },
      // pctCH mit Standard-Dezimalen: pctCH(30) → «30 %» (mit 0 Dezimalen würde die Endnull wegfallen).
      { type: "paragraph", text: `Anteil ${pctCH(s.anteil)} der Beiträge, Ziel: ${ZIEL_LABELS[s.ziel]}` },
    );
  });
  blocks.push(
    { type: "heading", level: 1, text: "Rhythmus" },
    { type: "paragraph", text: output.rhythmus.satz },
    { type: "table", header: ["Tag", "Säule", "Kanal"], rows: output.rhythmus.wochenplan.map((e) => [e.tag, e.saeule, e.kanal]), widths: [1, 2, 1] },
    { type: "heading", level: 1, text: "Das posten wir nicht" },
    { type: "list", items: output.niemals },
  );
  return {
    title: "Themensäulen",
    subtitle: betrieb ? `Für ${betrieb}` : "Für deinen Betrieb",
    filename: `inhalte-saeulen-${safeFilename(betrieb, "betrieb")}`,
    blocks,
  };
}

/** Die Blöcke für den Bildschirm: ohne den KI-Hinweis, den die Karte selbst zeigt. PDF, Word und Copy behalten ihn. */
export function screenBlocks(doc: DocumentModel): DocBlock[] {
  return doc.blocks.filter((b) => !(b.type === "paragraph" && b.text === KI_HINWEIS));
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: SaeulenOutput, input: SaeulenInput | null): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Profil schreiben ----------------------------------------------------------------------------

export type SaeuleEintrag = { name: string; beschreibung: string; anteil: number };
export type ProfilePatch = { contentSaeulen?: SaeuleEintrag[] };

/**
 * Was der Generator ins Firmenprofil schreibt (writesProfile: contentSaeulen), nur nach einem frisch erzeugten Entwurf
 * und nur, wenn dort noch nichts steht (TOOL-BAUEN.md, Abschnitt 2). Sonst bleibt das Profil, wie es ist.
 */
export function profilePatch(profile: Pick<Profile, "contentSaeulen">, output: SaeulenOutput): ProfilePatch {
  if (profile.contentSaeulen?.length) return {};
  return { contentSaeulen: output.saeulen.map((s) => ({ name: s.name, beschreibung: s.beschreibung, anteil: s.anteil })) };
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type SaeulenState = { v: 1; input: SaeulenInput | null; output: SaeulenOutput | null };

export const EMPTY_STATE: SaeulenState = { v: 1, input: null, output: null };

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ein Entwurf ohne gültige Eingabe fällt weg. */
export function parseState(raw: unknown): SaeulenState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<SaeulenState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = saeulenInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = saeulenOutput.safeParse(r.output);
  return { v: 1, input: input.data, output: output.success ? output.data : null };
}
