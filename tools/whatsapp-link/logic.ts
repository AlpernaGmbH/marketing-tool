import { safeFilename } from "@/lib/export/model";

// WhatsApp-Link mit QR: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Nummer prüfen und normalisieren, Vorlagen, wa.me-Link, Knopf-Schnipsel, Masse des Aufkleber-Bogens,
// Texte fürs CRM und der gespeicherte Stand. Browser-Dinge (QR-Bild, PDF) stehen in export.ts.
// Spec: specs/whatsapp-link.md

export const SLUG = "whatsapp-link";
export const MAX_TEXT = 500;
export const BUTTON_LABEL = "Schreib uns auf WhatsApp";
export const WA_BASE = "https://wa.me/";

/** Hinweis unter dem QR-Code. Richtwert von Alperna, keine Statistik. */
export const QR_HINWEIS =
  "Richtwert von Alperna, keine Statistik: Drucke den QR-Code mindestens 2 cm gross, dunkel auf hell, mit einem hellen Rand rundherum. Teste den Ausdruck mit zwei Handys.";

// ---- Nummer ------------------------------------------------------------------------------------

export type Phone = {
  /** E.164 ohne Plus, zum Beispiel «41791234567». */
  e164: string;
  /** Lesbar national: «079 123 45 67». */
  display: string;
  /** Lesbar international: «+41 79 123 45 67». */
  displayInternational: string;
};

export const PHONE_ERROR_CH = "Gib eine Schweizer Nummer an, zum Beispiel 079 123 45 67.";
export const PHONE_ERROR_LENGTH = "Diese Nummer hat zu viele oder zu wenige Stellen.";

type Parsed = { kind: "international"; digits: string } | { kind: "national"; digits: string } | { kind: "none" } | { kind: "letters" };

/**
 * Zerlegt eine Eingabe in Ziffern. Erlaubt sind Leerzeichen, Punkte, Schrägstriche, Bindestriche und Klammern;
 * ein «+» oder «00» am Anfang heisst international, «(0)» nach der Vorwahl fällt weg.
 */
function parseDigits(input: string): Parsed {
  const s = input.trim().replace(/\(0\)/g, "");
  if (/\p{L}/u.test(s)) return { kind: "letters" };
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (digits === "") return { kind: "none" };
  if (plus) return { kind: "international", digits };
  if (digits.startsWith("00")) return { kind: "international", digits: digits.slice(2) };
  if (digits.startsWith("0")) return { kind: "national", digits: digits.slice(1) };
  // Ohne Plus und ohne Null: «41791234567» gilt als international, alles andere als national ohne Null.
  if (digits.startsWith("41") && digits.length === 11) return { kind: "international", digits };
  return { kind: "national", digits };
}

const group = (rest: string, sizes: number[]): string => {
  const out: string[] = [];
  let i = 0;
  for (const n of sizes) {
    out.push(rest.slice(i, i + n));
    i += n;
  }
  return out.join(" ");
};

/** Schweizer Nummer in E.164 ohne Plus. null, wenn die Eingabe keine Schweizer Nummer mit neun Ziffern nach der 41 ist. */
export function normalizePhone(input: string): Phone | null {
  const p = parseDigits(input);
  let rest: string;
  if (p.kind === "international") {
    if (!p.digits.startsWith("41")) return null;
    rest = p.digits.slice(2);
  } else if (p.kind === "national") {
    rest = p.digits;
  } else {
    return null;
  }
  if (!/^[1-9]\d{8}$/.test(rest)) return null;
  return {
    e164: `41${rest}`,
    display: group(`0${rest}`, [3, 3, 2, 2]),
    displayInternational: `+41 ${group(rest, [2, 3, 2, 2])}`,
  };
}

/** Meldung, warum die Nummer nicht geht; null, wenn sie in Ordnung ist. */
export function phoneProblem(input: string): string | null {
  const p = parseDigits(input);
  if (p.kind === "none" || p.kind === "letters") return PHONE_ERROR_CH;
  if (p.kind === "international" && !p.digits.startsWith("41")) return PHONE_ERROR_CH;
  const rest = p.kind === "international" ? p.digits.slice(2) : p.digits;
  if (rest.startsWith("0")) return PHONE_ERROR_CH;
  if (rest.length !== 9) return PHONE_ERROR_LENGTH;
  return normalizePhone(input) ? null : PHONE_ERROR_CH;
}

// ---- Vorlagen ----------------------------------------------------------------------------------

export const TEMPLATE_KEYS = ["anfrage", "termin", "offerte", "rueckruf", "eigener"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Vorlagen aus Sicht der Kundschaft; {firma} wird ersetzt, ohne Firma fällt der Name weg. */
export const TEMPLATES: Record<TemplateKey, { label: string; text: string }> = {
  anfrage: { label: "Anfrage", text: "Guten Tag{firma}, ich habe eine Frage zu …" },
  termin: { label: "Terminwunsch", text: "Guten Tag{firma}, ich möchte einen Termin vereinbaren. Mir passt: …" },
  offerte: { label: "Offerte", text: "Guten Tag{firma}, ich hätte gern eine Offerte für …" },
  rueckruf: { label: "Rückruf", text: "Guten Tag{firma}, bitte ruft mich zurück. Ich bin erreichbar: …" },
  eigener: { label: "Eigener Text", text: "" },
};

export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === "string" && (TEMPLATE_KEYS as readonly string[]).includes(v);

/** Der Text einer Vorlage mit der Firma aus dem Profil; «Eigener Text» ist leer. */
export function messageFor(key: TemplateKey, firma?: string): string {
  const f = (firma ?? "").replace(/\s+/g, " ").trim();
  return TEMPLATES[key].text.replace("{firma}", f ? ` ${f}` : "");
}

// ---- Link und Schnipsel ------------------------------------------------------------------------

/** Nachricht bereinigt: Windows-Zeilenenden vereinheitlicht, Leerraum an den Enden weg, höchstens MAX_TEXT Zeichen. */
export function cleanText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim().slice(0, MAX_TEXT);
}

/** https://wa.me/<E.164>, mit ?text= nur bei einer Nachricht. Zeilenumbrüche bleiben als %0A erhalten. */
export function buildWaLink(e164: string, text = ""): string {
  const t = cleanText(text);
  return t ? `${WA_BASE}${e164}?text=${encodeURIComponent(t)}` : `${WA_BASE}${e164}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BUTTON_STYLE = [
  "display:inline-block",
  "padding:12px 22px",
  "border-radius:999px",
  "background:#0F0F0E",
  "color:#FFFDF8",
  "font:500 16px/1.2 system-ui,sans-serif",
  "text-decoration:none",
].join(";");

/** Ein Knopf für die Website: nur HTML mit Inline-Stil, kein Skript, keine externe Datei. */
export function buttonSnippet(link: string, label = BUTTON_LABEL): string {
  return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" style="${BUTTON_STYLE}">${escapeHtml(label)}</a>`;
}

// ---- Aufkleber-Bogen ---------------------------------------------------------------------------

/** Punkt je Millimeter (72 pt je Zoll). */
export const PT_PER_MM = 72 / 25.4;
export const A4 = { w: 595.28, h: 841.89 } as const;
/** A7 quer liegt nicht: 74 mm breit, 105 mm hoch. */
export const A7 = { w: 74 * PT_PER_MM, h: 105 * PT_PER_MM } as const;

export type Rect = { x: number; y: number; w: number; h: number };
export type Line = { x1: number; y1: number; x2: number; y2: number };

export type StickerLayout = {
  page: { w: number; h: number };
  /** Vier Aufkleber: zwei Spalten, zwei Reihen; Ursprung unten links wie in pdf-lib. */
  cells: Rect[];
  /** Schnittmarken ausserhalb des Rasters. */
  marks: Line[];
};

/** Raster der vier A7-Aufkleber mittig auf A4 und die Schnittmarken an den Rändern. */
export function stickerLayout(): StickerLayout {
  const cols = 2;
  const rows = 2;
  const x0 = (A4.w - cols * A7.w) / 2;
  const y0 = (A4.h - rows * A7.h) / 2;
  const cells: Rect[] = [];
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) cells.push({ x: x0 + c * A7.w, y: y0 + r * A7.h, w: A7.w, h: A7.h });
  }
  const len = 14;
  const gap = 4;
  const marks: Line[] = [];
  const xs = [x0, x0 + A7.w, x0 + cols * A7.w];
  const ys = [y0, y0 + A7.h, y0 + rows * A7.h];
  for (const x of xs) {
    marks.push({ x1: x, y1: y0 - gap, x2: x, y2: y0 - gap - len });
    marks.push({ x1: x, y1: y0 + rows * A7.h + gap, x2: x, y2: y0 + rows * A7.h + gap + len });
  }
  for (const y of ys) {
    marks.push({ x1: x0 - gap, y1: y, x2: x0 - gap - len, y2: y });
    marks.push({ x1: x0 + cols * A7.w + gap, y1: y, x2: x0 + cols * A7.w + gap + len, y2: y });
  }
  return { page: { ...A4 }, cells, marks };
}

export type CellContent = {
  pad: number;
  /** Innere Breite für Text. */
  textW: number;
  /** Grundlinien (y) der Zeilen, von oben nach unten. */
  firma: { y: number; size: number };
  satz: { y: number; size: number };
  qr: Rect;
  nummer: { y: number; size: number };
  nummerIntl: { y: number; size: number };
  fuss: { y: number; size: number };
};

/** Positionen innerhalb eines Aufklebers (Masse in Punkt, y ist die Grundlinie des Textes). */
export function cellContent(cell: Rect): CellContent {
  const pad = 12;
  const qrSize = 42 * PT_PER_MM; // 42 mm, deutlich über dem Richtwert von 2 cm
  const top = cell.y + cell.h;
  return {
    pad,
    textW: cell.w - pad * 2,
    firma: { y: top - 30, size: 10.5 },
    satz: { y: top - 52, size: 15 },
    qr: { x: cell.x + (cell.w - qrSize) / 2, y: top - 80 - qrSize, w: qrSize, h: qrSize },
    nummer: { y: top - 80 - qrSize - 24, size: 13 },
    nummerIntl: { y: top - 80 - qrSize - 40, size: 9 },
    fuss: { y: cell.y + 12, size: 7 },
  };
}

/** Liegt `inner` ganz in `outer`? */
export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** Überschneiden sich zwei Flächen (Berührung an der Kante zählt nicht)? */
export function overlaps(a: Rect, b: Rect): boolean {
  const eps = 0.001;
  return a.x + a.w > b.x + eps && b.x + b.w > a.x + eps && a.y + a.h > b.y + eps && b.y + b.h > a.y + eps;
}

// ---- Dateinamen --------------------------------------------------------------------------------

const withFirma = (base: string, firma?: string): string => {
  const f = (firma ?? "").trim();
  return f ? `${base}-${safeFilename(f, "betrieb")}` : base;
};

export const stickerFilename = (firma?: string): string => `${withFirma("whatsapp-aufkleber", firma)}.pdf`;
export const qrFilename = (firma: string | undefined, ext: "png" | "svg"): string => `${withFirma("whatsapp-qr", firma)}.${ext}`;

// ---- CRM ---------------------------------------------------------------------------------------

const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, " / ").trim();

/** Die Angaben fürs CRM, eine je Zeile. */
export function eingabeText(s: { nummer: string; vorlage: TemplateKey; text: string }): string {
  const t = cleanText(s.text);
  return [`WhatsApp-Nummer: ${s.nummer.trim() || "keine Angabe"}`, `Vorlage: ${TEMPLATES[s.vorlage].label}`, `Nachricht: ${t ? oneLine(t) : "keine"}`].join("\n");
}

/** Das Ergebnis fürs CRM: Link, Nummer, Nachricht und der Hinweis auf QR und Aufkleber. */
export function ausgabeText(s: { phone: Phone; text: string; firma?: string }): string {
  const t = cleanText(s.text);
  const link = buildWaLink(s.phone.e164, t);
  const lines = [`Link: ${link}`, `Nummer: ${s.phone.displayInternational}`];
  if (s.firma?.trim()) lines.push(`Firma: ${s.firma.trim()}`);
  lines.push(`Nachricht: ${t ? oneLine(t) : "keine"}`, "QR und Aufkleber erzeugt");
  return lines.join("\n");
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type WaState = { v: 1; phase: "edit" | "result"; nummer: string; vorlage: TemplateKey; text: string };

export const EMPTY_STATE: WaState = { v: 1, phase: "edit", nummer: "", vorlage: "anfrage", text: "" };

/** Liest den gespeicherten Stand; kaputte Daten ergeben den leeren Stand. «result» gilt nur mit gültiger Nummer. */
export function parseState(raw: unknown): WaState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return EMPTY_STATE;
  const nummer = typeof r.nummer === "string" ? r.nummer.slice(0, 40) : "";
  const vorlage = isTemplateKey(r.vorlage) ? r.vorlage : "anfrage";
  const text = typeof r.text === "string" ? r.text.slice(0, MAX_TEXT) : "";
  const phase = r.phase === "result" && normalizePhone(nummer) ? "result" : "edit";
  return { v: 1, phase, nummer, vorlage, text };
}

/** Noch nichts eingegeben: Der Text folgt dann der gewählten Vorlage mit der Firma aus dem Profil. */
export function isUntouched(s: WaState): boolean {
  return s.phase === "edit" && s.nummer === "" && s.text === "";
}
