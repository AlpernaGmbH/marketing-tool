import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { PageRead } from "@/lib/read";
import { KANAL_KEYS, MAX_HEADINGS, MAX_TEXT_CHARS, ideenOutput, type FormatKey, type IdeenInput, type IdeenOutput, type KanalKey } from "./generator";

// Ideen aus deiner Website: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Die Website liest /api/read (lib/read-client.ts), den Entwurf macht /api/generate über generator.ts.
// Spec: specs/ideen-aus-website.md

export const SLUG = "ideen-aus-website";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

export const KANAELE: { key: KanalKey; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "google", label: "Google-Beitrag" },
  { key: "newsletter", label: "Newsletter" },
  { key: "website", label: "Website-Beitrag" },
];
export const ALL_KANAELE: KanalKey[] = KANAELE.map((k) => k.key);

export const FORMAT_LABELS: Record<FormatKey, string> = {
  foto: "Foto",
  reel: "Reel",
  text: "Text",
  story: "Story",
  karussell: "Karussell",
  kurzvideo: "Kurzvideo",
};

export function isKanalKey(value: unknown): value is KanalKey {
  return typeof value === "string" && (KANAL_KEYS as readonly string[]).includes(value);
}

export function kanalLabel(key: KanalKey): string {
  return KANAELE.find((k) => k.key === key)?.label ?? key;
}

/** Bekannte Kanäle in fester Reihenfolge, ohne Doppel. */
export function normalizeKanaele(kanaele: readonly unknown[]): KanalKey[] {
  return KANAL_KEYS.filter((k) => kanaele.includes(k));
}

// ---- Eingabe -----------------------------------------------------------------------------------

/** Grobe Prüfung im Browser; der Server prüft mit normalizeUrl noch einmal (keine IP, kein internes Netz). */
export function looksLikeWebsite(website: string): boolean {
  const s = website.trim();
  if (!s || s.length > 300 || /\s/.test(s)) return false;
  const host = s.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
  return /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?::\d{1,5})?$/u.test(host);
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. */
export function inputProblem(website: string, kanaele: readonly KanalKey[]): string | null {
  const w = website.trim();
  if (!w) return "Gib die Adresse deiner Website an, zum Beispiel malerei-keller.ch.";
  if (!looksLikeWebsite(w)) return "Das sieht nicht nach einer Website-Adresse aus. Prüfe die Schreibweise.";
  if (kanaele.length === 0) return "Wähle mindestens einen Kanal.";
  return null;
}

/** Host ohne «www.» für die Anzeige; bei kaputter Adresse die Eingabe selbst. */
export function hostOf(website: string): string {
  const s = website.trim();
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return s;
  }
}

export type PageLike = Pick<PageRead, "host" | "title" | "description" | "headings" | "text">;
export type ProfileFields = { firma?: string; branche?: string; ort?: string };

const clip = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Eingabe des Generators aus Profil, Kanälen und gelesener Seite. Ohne Firma gilt der Host als Betrieb. */
export function toInput(fields: ProfileFields, kanaele: readonly KanalKey[], page: PageLike): IdeenInput {
  const host = clip(page.host, 200);
  return {
    betrieb: clip(fields.firma, 120) || host,
    branche: clip(fields.branche, 120),
    ort: clip(fields.ort, 80),
    kanaele: normalizeKanaele(kanaele),
    host,
    title: clip(page.title, 200),
    description: clip(page.description, 400),
    headings: page.headings
      .map((h) => clip(h, 200))
      .filter(Boolean)
      .slice(0, MAX_HEADINGS),
    text: page.text.trim().slice(0, MAX_TEXT_CHARS),
  };
}

/** Die Angaben fürs CRM, eine je Zeile. Nicht der Text der Seite: Der Server kürzt ohnehin auf 1'900 Zeichen. */
export function eingabeText(input: IdeenInput): string {
  return [
    `Website: ${input.host}`,
    `Betrieb: ${input.betrieb}`,
    input.branche ? `Branche: ${input.branche}` : "",
    input.ort ? `Ort: ${input.ort}` : "",
    `Kanäle: ${input.kanaele.map(kanalLabel).join(", ")}`,
    input.title ? `Titel der Startseite: ${input.title}` : "",
    input.headings.length > 0 ? `Überschriften: ${input.headings.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ----------------------------------------------------------------------------------

/** Kanäle, die im Entwurf vorkommen, in fester Reihenfolge. */
export function usedKanaele(output: IdeenOutput): KanalKey[] {
  return normalizeKanaele(output.ideen.map((i) => i.kanal));
}

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(output: IdeenOutput, website: string, kanaele: readonly KanalKey[] = usedKanaele(output)): DocumentModel {
  const host = hostOf(website);
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Website", value: host || "keine Angabe" },
        { label: "Kanäle", value: kanaele.map(kanalLabel).join(", ") || "keine Angabe" },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: "Themen auf deiner Website" },
    { type: "list", items: output.themen },
    { type: "heading", level: 1, text: `${output.ideen.length} Ideen für Beiträge` },
  ];
  output.ideen.forEach((idee, i) => {
    blocks.push(
      { type: "heading", level: 2, text: `${i + 1}. ${idee.titel} (${kanalLabel(idee.kanal)}, ${FORMAT_LABELS[idee.format]})` },
      { type: "paragraph", text: idee.worum },
      { type: "paragraph", text: `Erster Satz: «${idee.hook}»` },
    );
  });
  return {
    title: "Ideen aus deiner Website",
    subtitle: host ? `Aus der Startseite von ${host}` : undefined,
    filename: `ideen-${safeFilename(host, "website")}`,
    blocks,
  };
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: IdeenOutput, website: string): string {
  return toMarkdown(toDocument(output, website));
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

/** Was vom Seitenauszug im Browser bleibt: nicht der Text, nur Host, Titel und Überschriften. */
export type PageSummary = { host: string; title: string; headings: string[] };

export function pageSummary(page: PageLike): PageSummary {
  return { host: clip(page.host, 200), title: clip(page.title, 200), headings: page.headings.map((h) => clip(h, 200)).filter(Boolean).slice(0, MAX_HEADINGS) };
}

export type IdeenState = { v: 1; website: string; kanaele: KanalKey[]; page: PageSummary | null; output: IdeenOutput | null };

export const EMPTY_STATE: IdeenState = { v: 1, website: "", kanaele: ALL_KANAELE, page: null, output: null };

function parsePage(raw: unknown): PageSummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<PageSummary>;
  if (typeof r.host !== "string" || !r.host.trim()) return null;
  return {
    host: r.host.slice(0, 200),
    title: typeof r.title === "string" ? r.title.slice(0, 200) : "",
    headings: Array.isArray(r.headings) ? r.headings.filter((h): h is string => typeof h === "string").slice(0, MAX_HEADINGS) : [],
  };
}

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand, ein kaputter Entwurf fällt allein weg. */
export function parseState(raw: unknown): IdeenState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<IdeenState>;
  if (r.v !== 1) return EMPTY_STATE;
  const output = ideenOutput.safeParse(r.output);
  return {
    v: 1,
    website: typeof r.website === "string" ? r.website.slice(0, 300) : "",
    kanaele: Array.isArray(r.kanaele) ? normalizeKanaele(r.kanaele) : ALL_KANAELE,
    page: parsePage(r.page),
    output: output.success ? output.data : null,
  };
}
