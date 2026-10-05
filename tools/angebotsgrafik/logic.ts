import { brandHits } from "@/lib/brand-rules";
import { chf, dateCH } from "@/lib/ch";
import { safeFilename } from "@/lib/export/model";
import {
  IMAGE_FORMATS,
  INK,
  PAPER,
  contrastRatio,
  fitFont,
  imageFormat,
  isImageFormatKey,
  normalizeHex,
  pngFilename,
  textColorFor,
  wrapByWidth,
  type ImageFormatKey,
  type Rect,
} from "@/lib/export/png";

// Angebotsgrafik: reine Funktionen, kein React, kein DOM (CLAUDE.md, Harte Regel 3). Das Zeichnen steht in render.ts (Canvas, nur im
// Browser). Hier: Angaben prüfen, Preis- und Gültigkeitszeile, Farben und Kontrast, das Layout aller Vorlagen und Formate als Rechtecke,
// Textanpassung an ein Rechteck, Hinweise zur Sperrliste, Dateinamen, Texte fürs CRM und der gespeicherte Stand.
// Spec: specs/angebotsgrafik.md

export const SLUG = "angebotsgrafik";

export const LIMITS = {
  titel: { min: 3, max: 40 },
  angebot: { min: 5, max: 90 },
  aufforderung: { min: 2, max: 40 },
  kontakt: { max: 50 },
  preisMax: 1_000_000,
} as const;

/** Richtwerte von Alperna, keine Statistik (TOOL-BAUEN.md, Abschnitt 5). */
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";
/** Bei der Story bleiben oben und unten so viele Pixel frei (bei 1080 Pixel Breite). Richtwert von Alperna, keine Statistik. */
export const STORY_SAFE_PX = 250;
export const PREIS_HINWEIS = "Der frühere Preis muss stimmen. Bei Zweifeln frag eine Fachperson.";
export const LOGO_HINWEIS = "Dein Logo verlässt den Browser nicht.";

// ---- Vorlagen, Farben, Formate ---------------------------------------------------------------------

export type TemplateKey = "ruhig" | "kraeftig" | "handwerk";
export const TEMPLATES: readonly { key: TemplateKey; label: string; beschreibung: string }[] = [
  { key: "ruhig", label: "Ruhig", beschreibung: "Papier, viel Weiss und eine dünne Linie in deiner Farbe." },
  { key: "kraeftig", label: "Kräftig", beschreibung: "Die ganze Fläche in deiner Farbe, der Preis gross." },
  { key: "handwerk", label: "Handwerk", beschreibung: "Papier mit breitem Farbband, der Preis in einem Kreis." },
];
export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === "string" && TEMPLATES.some((t) => t.key === v);
export const templateLabel = (key: TemplateKey): string => TEMPLATES.find((t) => t.key === key)?.label ?? "Ruhig";

export type FarbeKey = "tinte" | "marine" | "gold" | "eigen";
export const FARBEN: readonly { key: FarbeKey; label: string; hex: string | null }[] = [
  { key: "tinte", label: "Tinte", hex: "#0F0F0E" },
  { key: "marine", label: "Marine", hex: "#111A28" },
  { key: "gold", label: "Gold", hex: "#FFD700" },
  { key: "eigen", label: "Eigene Farbe", hex: null },
];
export const isFarbeKey = (v: unknown): v is FarbeKey => typeof v === "string" && FARBEN.some((f) => f.key === v);
export const farbeLabel = (key: FarbeKey): string => FARBEN.find((f) => f.key === key)?.label ?? "Tinte";

export const DEFAULT_FORMATE: readonly ImageFormatKey[] = ["feed", "story"];
/** Die Schlüssel in der Reihenfolge von IMAGE_FORMATS, ohne Doppelte und Unbekanntes. */
export function orderFormats(keys: readonly unknown[]): ImageFormatKey[] {
  return IMAGE_FORMATS.map((f) => f.key).filter((k) => keys.includes(k));
}

/** Vorschläge für die Aufforderung: ruhig, ohne Druckwörter (Test gegen Sperrliste). */
export const AUFFORDERUNGEN: readonly string[] = ["Termin vereinbaren", "Offerte anfragen", "Mehr erfahren", "Schreib uns auf WhatsApp"];

/** Beispieltexte der Vorschau, solange ein Feld leer ist. */
export const PLATZHALTER = {
  titel: "Herbstaktion",
  angebot: "Fassadenanstrich inklusive Gerüst",
  aufforderung: "Termin vereinbaren",
} as const;

// ---- Angaben ----------------------------------------------------------------------------------------

export type Felder = {
  titel: string;
  angebot: string;
  preis: string;
  frueher: string;
  gueltigBis: string;
  aufforderung: string;
  kontakt: string;
};
export type Form = Felder & { vorlage: TemplateKey; farbe: FarbeKey; hex: string; formate: ImageFormatKey[] };
/** Alles, was die Grafik braucht: das Formular, die Firma aus dem Profil und ob ein Logo gewählt ist (die Bytes bleiben im Browser). */
export type OfferInput = Form & { firma: string; logo: boolean };

export const EMPTY_FELDER: Felder = { titel: "", angebot: "", preis: "", frueher: "", gueltigBis: "", aufforderung: "", kontakt: "" };
export const EMPTY_FORM: Form = { ...EMPTY_FELDER, vorlage: "ruhig", farbe: "tinte", hex: "", formate: [...DEFAULT_FORMATE] };

/** Leerraum zusammenfassen: Zeilenumbrüche und doppelte Leerzeichen werden zu einem Leerzeichen. */
export const clean = (s: string): string => (s ?? "").replace(/\s+/g, " ").trim();
const len = (s: string): number => [...clean(s)].length;

export type FieldKey = "firma" | "titel" | "angebot" | "preis" | "frueher" | "gueltigBis" | "aufforderung" | "kontakt" | "hex" | "formate";
export type Problem = { field: FieldKey; message: string };

/** Betrag aus der Eingabe: «4900», «4'900», «12,50», «12.5». null bei leer, Text, Minuszeichen oder mehr als zwei Dezimalstellen. */
export function parseAmount(raw: string): number | null {
  const s = (raw ?? "").trim().replace(/['’\s]/g, "");
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const n = Number(m[2] ? `${m[1]}.${m[2]}` : m[1]);
  return n >= 0 && n <= LIMITS.preisMax ? n : null;
}

export const isIsoDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

/** Heutiges Datum in der Schweiz als JJJJ-MM-TT, unabhängig von der Zeitzone des Geräts. */
export function todayIso(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const PREIS_MELDUNG = `Gib den Preis als Zahl zwischen 0 und 1'000'000 an, mit höchstens zwei Dezimalstellen.`;

/** Prüft die Angaben ohne die Firma. `heute` als JJJJ-MM-TT. Die Reihenfolge der Meldungen folgt dem Formular. */
export function feldProblems(f: Form, heute: string): Problem[] {
  const out: Problem[] = [];
  const add = (field: FieldKey, message: string) => out.push({ field, message });

  const titel = len(f.titel);
  if (titel < LIMITS.titel.min) add("titel", `Gib einen Titel an, mindestens ${LIMITS.titel.min} Zeichen.`);
  else if (titel > LIMITS.titel.max) add("titel", `Der Titel darf höchstens ${LIMITS.titel.max} Zeichen haben.`);

  const angebot = len(f.angebot);
  if (angebot < LIMITS.angebot.min) add("angebot", `Beschreibe das Angebot in mindestens ${LIMITS.angebot.min} Zeichen.`);
  else if (angebot > LIMITS.angebot.max) add("angebot", `Das Angebot darf höchstens ${LIMITS.angebot.max} Zeichen haben.`);

  const preisText = clean(f.preis);
  const frueherText = clean(f.frueher);
  const preis = parseAmount(preisText);
  const frueher = parseAmount(frueherText);
  if (preisText && preis === null) add("preis", PREIS_MELDUNG);
  if (frueherText) {
    if (frueher === null) add("frueher", PREIS_MELDUNG.replace("den Preis", "den früheren Preis"));
    else if (!preisText) add("frueher", "Ein früherer Preis braucht einen Preis.");
    else if (preis !== null && frueher <= preis) add("frueher", "Der frühere Preis muss grösser sein als der Preis.");
  }

  const gueltig = clean(f.gueltigBis);
  if (gueltig) {
    if (!isIsoDate(gueltig)) add("gueltigBis", "Gib das Datum mit Tag, Monat und Jahr an, zum Beispiel 30.11.2026.");
    else if (gueltig < heute) add("gueltigBis", "Das Datum liegt in der Vergangenheit.");
  }

  const cta = len(f.aufforderung);
  if (cta < LIMITS.aufforderung.min) add("aufforderung", "Gib eine Aufforderung an, zum Beispiel «Termin vereinbaren».");
  else if (cta > LIMITS.aufforderung.max) add("aufforderung", `Die Aufforderung darf höchstens ${LIMITS.aufforderung.max} Zeichen haben.`);

  if (len(f.kontakt) > LIMITS.kontakt.max) add("kontakt", `Die Kontaktzeile darf höchstens ${LIMITS.kontakt.max} Zeichen haben.`);

  if (f.farbe === "eigen" && !normalizeHex(f.hex)) add("hex", "Gib die Farbe als Hex-Wert an, zum Beispiel #1B5E20.");

  if (orderFormats(f.formate).length === 0) add("formate", "Wähle mindestens ein Format.");
  return out;
}

/** Alle Meldungen: ohne Firma und ohne Logo fehlt der Absender der Grafik, danach die Angaben (feldProblems). */
export function validate(input: OfferInput, heute: string): Problem[] {
  const out: Problem[] = [];
  if (!clean(input.firma) && !input.logo) out.push({ field: "firma", message: "Gib den Namen deiner Firma oder deines Vereins an oder wähle ein Logo." });
  out.push(...feldProblems(input, heute));
  return out;
}

// ---- Preis und Gültigkeit -------------------------------------------------------------------------

export type PriceLines = { preis: string | null; frueher: string | null };

const priceText = (n: number): string => (n === 0 ? "Gratis" : chf(n));

/** Preis wie chf() («CHF 1'200.-»), bei 0 «Gratis». Der frühere Preis erscheint nur mit Preis und nur, wenn er grösser ist. */
export function priceLines(input: Pick<Felder, "preis" | "frueher">): PriceLines {
  const preis = parseAmount(clean(input.preis));
  if (preis === null) return { preis: null, frueher: null };
  const frueher = parseAmount(clean(input.frueher));
  return { preis: priceText(preis), frueher: frueher !== null && frueher > preis ? chf(frueher) : null };
}

/** Das Datum als 30.11.2026; null ohne gültiges Datum. */
export function gueltigDatum(input: Pick<Felder, "gueltigBis">): string | null {
  const s = clean(input.gueltigBis);
  return isIsoDate(s) ? dateCH(new Date(`${s}T12:00:00Z`)) : null;
}

/** «Gültig bis 30.11.2026»; null ohne gültiges Datum. */
export function validityLine(input: Pick<Felder, "gueltigBis">): string | null {
  const d = gueltigDatum(input);
  return d ? `Gültig bis ${d}` : null;
}

// ---- Farben -----------------------------------------------------------------------------------------

export const MUTED = "#65645F";
const MIN_TEXT_CONTRAST = 4.5;
const MIN_LINE_CONTRAST = 3;

/** Text auf einem Hintergrund: Tinte oder Papier, und nur wenn keines von beiden 4,5:1 erreicht, reines Schwarz oder Weiss. */
export function readableOn(background: string): string {
  const best = textColorFor(background);
  if (contrastRatio(best, background) >= MIN_TEXT_CONTRAST) return best;
  return contrastRatio("#000000", background) >= contrastRatio("#FFFFFF", background) ? "#000000" : "#FFFFFF";
}

export type Palette = {
  ink: string;
  paper: string;
  muted: string;
  /** Die gewählte Farbe; bei ungültigem Hex-Wert Tinte. */
  accent: string;
  /** Lesbare Textfarbe auf der gewählten Farbe. */
  onAccent: string;
  /** Farbe für Linien und Kreise auf Papier: die gewählte Farbe, bei weniger als 3:1 Kontrast Tinte. */
  line: string;
  lowContrast: boolean;
};

export function accentFor(farbe: FarbeKey, hex: string): Palette {
  const fixed = FARBEN.find((f) => f.key === farbe)?.hex ?? null;
  const accent = fixed ?? normalizeHex(hex) ?? INK;
  const lowContrast = contrastRatio(accent, PAPER) < MIN_LINE_CONTRAST;
  return { ink: INK, paper: PAPER, muted: MUTED, accent, onAccent: readableOn(accent), line: lowContrast ? INK : accent, lowContrast };
}

export const COLOR_HINT = "Diese Farbe ist auf hellem Grund schwach lesbar. Linien und Kreise erscheinen in Tinte, Flächen und Knöpfe bleiben in deiner Farbe.";

export type Role = "ink" | "paper" | "accent" | "onAccent" | "line" | "muted";
export const colorOf = (p: Palette, role: Role): string => p[role];

// ---- Layout -----------------------------------------------------------------------------------------

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type ElementKey = "firma" | "logo" | "titel" | "angebot" | "preis" | "frueher" | "gueltig" | "aufforderung" | "kontakt";
export type TextKey = Exclude<ElementKey, "logo">;
/** Rechteck eines Elements. `color` ist die Textfarbe; `fill` nur bei der Aufforderung (Farbe des Knopfs). */
export type Box = Rect & { align: Align; valign: VAlign; color: Role; fill?: Role };
export type FontSpec = { weight: 400 | 500 | 600; max: number; min: number; lines: number; lh: number };
export type Dekor =
  | { kind: "rect"; rect: Rect; fill: Role; radius?: number }
  | { kind: "ring"; cx: number; cy: number; r: number; stroke: number; color: Role };
/**
 * Welche Elemente vorhanden sind. Fehlendes bekommt kein Rechteck, der Platz geht an die anderen. `titelLen` und `angebotLen`
 * (Zeichen) verteilen die Höhe: Lange Texte bekommen mehr Platz. Fehlen sie, rechnet das Layout mit dem längsten erlaubten Text.
 */
export type Presence = { logo: boolean; preis: boolean; frueher: boolean; gueltig: boolean; kontakt: boolean; titelLen?: number; angebotLen?: number };
export const ALL_PRESENT: Presence = { logo: true, preis: true, frueher: true, gueltig: true, kontakt: true };

export type Layout = {
  width: number;
  height: number;
  margin: number;
  story: boolean;
  /** Querformat (Verhältnis ab 1,2:1): zwei Spalten. */
  wide: boolean;
  /** Oben und unten freier Streifen in Pixel (Rand, bei der Story 250 Pixel bei 1080 Breite). */
  safeTop: number;
  safeBottom: number;
  background: Role;
  /** Rechtecke der vorhandenen Elemente. Statt `logo` steht ohne Logo `firma` (der Name als Text). */
  boxes: Partial<Record<ElementKey, Box>>;
  fonts: Record<TextKey, FontSpec>;
  dekor: Dekor[];
  /** Weisse Platte hinter dem Logo (auf farbigem Grund). */
  logoPlate: boolean;
  /** Das Logo darf höchstens so viele Pixel breit sein (18 % der Breite). */
  logoMaxWidth: number;
};

type Ctx = {
  W: number;
  H: number;
  template: TemplateKey;
  margin: number;
  area: Rect;
  wide: boolean;
  has: Presence;
  px: (fraction: number) => number;
  /** Zuschlag nach Seitenverhältnis (siehe boostFor). */
  k: number;
  /** Gewichte für die Höhe von Titel und Angebot, je nach Länge des Textes. */
  wTitel: number;
  wAngebot: number;
};

type Slot = { key: string; weight?: number; h?: number };

/** Teilt eine Fläche von oben nach unten: feste Höhen zuerst, den Rest nach Gewichten. Ganze Pixel, Abstände exakt `gap`. */
function column(area: Rect, slots: Slot[], gap: number): Record<string, Rect> {
  const live = slots.filter((s) => (s.h ?? s.weight ?? 0) > 0);
  const out: Record<string, Rect> = {};
  if (live.length === 0) return out;
  const fixed = live.reduce((n, s) => n + (s.h ?? 0), 0);
  const weights = live.reduce((n, s) => n + (s.h === undefined ? (s.weight ?? 0) : 0), 0);
  const free = Math.max(0, area.h - fixed - gap * (live.length - 1));
  let cursor = area.y;
  for (const s of live) {
    const height = s.h ?? (weights > 0 ? (free * (s.weight ?? 0)) / weights : 0);
    const top = Math.round(cursor);
    const bottom = Math.round(cursor + height);
    out[s.key] = { x: area.x, y: top, w: area.w, h: bottom - top };
    cursor += height + gap;
  }
  return out;
}

const box = (r: Rect, align: Align, valign: VAlign, color: Role, fill?: Role): Box => (fill ? { ...r, align, valign, color, fill } : { ...r, align, valign, color });

type Parts = Pick<Layout, "background" | "boxes" | "dekor" | "logoPlate">;

/** Kopfzeile mit Logo (links oben, höchstens 18 % der Breite) oder dem Namen als Text. Gibt die Unterkante zurück. */
function brandRow(c: Ctx, x: number, y: number, w: number, color: Role, plate: boolean, boxes: Parts["boxes"]): number {
  const h = c.px(0.09 * c.k);
  if (c.has.logo) {
    const pad = plate ? c.px(0.014) : 0;
    boxes.logo = box({ x: x + pad, y: y + pad, w: c.px(0.18) - 2 * pad, h: h - 2 * pad }, "left", "middle", color);
  } else {
    boxes.firma = box({ x, y, w, h }, "left", "middle", color);
  }
  return y + h;
}

/** Unterer Block: Kontaktzeile ganz unten, darüber die Aufforderung. Gibt die Oberkante des Blocks zurück. */
function bottomRows(c: Ctx, textColor: Role, ctaFill: Role, ctaText: Role, boxes: Parts["boxes"], bottom: number): number {
  let y = bottom;
  if (c.has.kontakt) {
    const kh = c.px(0.045 * c.k);
    boxes.kontakt = box({ x: c.area.x, y: y - kh, w: c.area.w, h: kh }, "left", "middle", textColor);
    y -= kh + c.px(0.03);
  }
  const ch = c.px(0.085 * c.k);
  boxes.aufforderung = box({ x: c.area.x, y: y - ch, w: c.area.w, h: ch }, "left", "middle", ctaText, ctaFill);
  return y - ch;
}

/** Preis, darüber der frühere Preis (durchgestrichen, kleiner). */
function priceBoxes(r: Rect, c: Ctx, align: Align, color: Role, boxes: Parts["boxes"]): void {
  if (!c.has.preis) return;
  if (!c.has.frueher) {
    boxes.preis = box(r, align, "top", color);
    return;
  }
  const fh = Math.round(r.h * 0.3);
  boxes.frueher = box({ ...r, h: fh }, align, "bottom", color);
  boxes.preis = box({ ...r, y: r.y + fh, h: r.h - fh }, align, "top", color);
}

/** Ruhig und Kräftig teilen den Aufbau: Kopf, Text, Preis, Gültigkeit, Aufforderung, Kontakt; sie unterscheiden sich in Farben und Gewichten. */
function flat(c: Ctx, kraeftig: boolean): Parts {
  const boxes: Parts["boxes"] = {};
  const dekor: Dekor[] = [];
  const text: Role = kraeftig ? "onAccent" : "ink";
  const soft: Role = kraeftig ? "onAccent" : "muted";
  const g = c.px(0.02);
  const a = c.area;
  const bottom = a.y + a.h;
  const top = bottomRows(c, soft, kraeftig ? "onAccent" : "accent", kraeftig ? "accent" : "onAccent", boxes, bottom) - c.px(0.04);

  let y = a.y;
  if (c.wide) {
    // Zwei Spalten: links Kopf, Titel, Angebot; rechts Preis und Gültigkeit. Ohne beides läuft die linke Spalte über die ganze Breite.
    const hasRight = c.has.preis || c.has.gueltig;
    const leftW = hasRight ? Math.round(a.w * 0.56) : a.w;
    const rightX = a.x + leftW + c.px(0.04);
    y = brandRow(c, a.x, y, leftW, text, kraeftig, boxes);
    if (!kraeftig) {
      const t = Math.max(2, c.px(0.004));
      const ry = y + c.px(0.02);
      dekor.push({ kind: "rect", rect: { x: a.x, y: ry, w: leftW, h: t }, fill: "line" });
      y = ry + t + c.px(0.03);
    } else y += c.px(0.025);
    const l = column({ x: a.x, y, w: leftW, h: top - y }, [{ key: "titel", weight: c.wTitel }, { key: "angebot", weight: c.wAngebot }], g);
    boxes.titel = box(l.titel, "left", "top", text);
    boxes.angebot = box(l.angebot, "left", "top", text);
    if (hasRight) {
      const r = column(
        { x: rightX, y, w: a.x + a.w - rightX, h: top - y },
        [{ key: "preis", weight: c.has.preis ? 4 : 0 }, { key: "gueltig", weight: c.has.gueltig ? 0.8 : 0 }],
        g,
      );
      if (r.preis) priceBoxes(r.preis, c, "left", text, boxes);
      if (r.gueltig) boxes.gueltig = box(r.gueltig, "left", "top", soft);
    }
  } else {
    y = brandRow(c, a.x, y, a.w, text, kraeftig, boxes);
    if (!kraeftig) {
      const t = Math.max(2, c.px(0.004));
      const ry = y + c.px(0.025);
      dekor.push({ kind: "rect", rect: { x: a.x, y: ry, w: a.w, h: t }, fill: "line" });
      y = ry + t + c.px(0.035);
    } else y += c.px(0.035);
    const col = column(
      { x: a.x, y, w: a.w, h: top - y },
      [
        { key: "titel", weight: c.wTitel },
        { key: "angebot", weight: c.wAngebot },
        { key: "preis", weight: c.has.preis ? (kraeftig ? 4.6 : 3.2) : 0 },
        { key: "gueltig", weight: c.has.gueltig ? 0.8 : 0 },
      ],
      g,
    );
    boxes.titel = box(col.titel, "left", "top", text);
    boxes.angebot = box(col.angebot, "left", "top", text);
    if (col.preis) priceBoxes(col.preis, c, "left", text, boxes);
    if (col.gueltig) boxes.gueltig = box(col.gueltig, "left", "top", soft);
  }
  return { background: kraeftig ? "accent" : "paper", boxes, dekor, logoPlate: kraeftig };
}

/** Handwerk: Papier, unten ein breites Farbband mit Aufforderung und Kontakt, der Preis in einem Kreis. */
function handwerk(c: Ctx): Parts {
  const boxes: Parts["boxes"] = {};
  const dekor: Dekor[] = [];
  const g = c.px(0.02);
  const a = c.area;
  const bandPad = c.px(0.03);
  const innerBottom = a.y + a.h;
  const top = bottomRows(c, "onAccent", "paper", "ink", boxes, innerBottom);
  // Das Band beginnt über der Aufforderung und läuft bis zum unteren Bildrand.
  const bandTop = top - bandPad;
  dekor.push({ kind: "rect", rect: { x: 0, y: bandTop, w: c.W, h: c.H - bandTop }, fill: "accent" });

  const y0 = brandRow(c, a.x, a.y, a.w, "ink", false, boxes);
  const upper: Rect = { x: a.x, y: y0 + c.px(0.03), w: a.w, h: bandTop - c.px(0.03) - (y0 + c.px(0.03)) };
  const stroke = Math.max(4, c.px(0.012));

  const ring = (slot: Rect): void => {
    if (!c.has.preis) return;
    const d = Math.round(Math.min(slot.w, slot.h) * 0.94);
    const r = Math.floor(d / 2);
    const cx = slot.x + Math.round(slot.w / 2);
    const cy = slot.y + Math.round(slot.h / 2);
    dekor.push({ kind: "ring", cx, cy, r, stroke, color: "line" });
    const dd = 2 * r;
    const pw = Math.round(dd * 0.8);
    const mid = (w: number, hh: number, dy: number): Rect => ({ x: cx - Math.round(w / 2), y: cy + Math.round(dy) - Math.round(hh / 2), w, h: hh });
    if (c.has.frueher) {
      boxes.frueher = box(mid(Math.round(dd * 0.7), Math.round(dd * 0.13), -dd * 0.18), "center", "middle", "ink");
      boxes.preis = box(mid(pw, Math.round(dd * 0.3), dd * 0.06), "center", "middle", "ink");
    } else boxes.preis = box(mid(pw, Math.round(dd * 0.3), 0), "center", "middle", "ink");
  };

  if (c.wide) {
    // Querformat: links Titel und Angebot, rechts der Kreis über die ganze Höhe über dem Band, die Gültigkeit darunter.
    const ringW = c.has.preis ? Math.round(a.w * 0.42) : 0;
    const textW = a.w - ringW - (c.has.preis ? c.px(0.04) : 0);
    const gueltigUnterKreis = c.has.preis && c.has.gueltig;
    const left = column(
      { x: upper.x, y: upper.y, w: textW, h: upper.h },
      [{ key: "titel", weight: c.wTitel }, { key: "angebot", weight: c.wAngebot }, { key: "gueltig", weight: c.has.gueltig && !gueltigUnterKreis ? 0.8 : 0 }],
      g,
    );
    boxes.titel = box(left.titel, "left", "top", "ink");
    boxes.angebot = box(left.angebot, "left", "top", "ink");
    if (left.gueltig) boxes.gueltig = box(left.gueltig, "left", "top", "muted");
    if (c.has.preis) {
      const right = column({ x: a.x + a.w - ringW, y: a.y, w: ringW, h: bandTop - g - a.y }, [{ key: "ring", weight: 1 }, { key: "gueltig", h: gueltigUnterKreis ? c.px(0.045) : 0 }], g);
      ring(right.ring);
      if (right.gueltig) boxes.gueltig = box(right.gueltig, "center", "top", "muted");
    }
  } else if (c.W / c.H >= 0.95) {
    // Quadrat: Titel oben, darunter links Angebot und Gültigkeit, rechts der Kreis.
    const col = column(upper, [{ key: "titel", weight: c.wTitel * 0.75 }, { key: "rest", weight: 4.6 }], g);
    boxes.titel = box(col.titel, "left", "top", "ink");
    const rest = col.rest;
    const ringW = c.has.preis ? Math.round(rest.w * 0.46) : 0;
    const textW = rest.w - ringW - (c.has.preis ? c.px(0.03) : 0);
    const l = column({ x: rest.x, y: rest.y, w: textW, h: rest.h }, [{ key: "angebot", weight: 4 }, { key: "gueltig", weight: c.has.gueltig ? 1 : 0 }], g);
    boxes.angebot = box(l.angebot, "left", "top", "ink");
    if (l.gueltig) boxes.gueltig = box(l.gueltig, "left", "top", "muted");
    ring({ x: rest.x + rest.w - ringW, y: rest.y, w: ringW, h: rest.h });
  } else {
    const col = column(
      upper,
      [
        { key: "titel", weight: c.wTitel },
        { key: "angebot", weight: c.wAngebot },
        { key: "ring", weight: c.has.preis ? 6.5 : 0 },
        { key: "gueltig", weight: c.has.gueltig ? 0.7 : 0 },
      ],
      g,
    );
    boxes.titel = box(col.titel, "left", "top", "ink");
    boxes.angebot = box(col.angebot, "left", "top", "ink");
    if (col.ring) ring(col.ring);
    if (col.gueltig) boxes.gueltig = box(col.gueltig, "center", "top", "muted");
  }
  return { background: "paper", boxes, dekor, logoPlate: false };
}

/** Schriftgrössen als Anteil der Breite. Die Untergrenzen sind so gewählt, dass Angaben in voller Länge ohne Kürzung passen. */
export function fontsFor(template: TemplateKey, width: number, boost = 1, wide = false): Record<TextKey, FontSpec> {
  const f = (v: number) => Math.max(6, Math.round(width * v));
  const m = (v: number) => Math.max(8, Math.round(width * v * boost));
  const kraeftig = template === "kraeftig";
  return {
    firma: { weight: 600, max: m(0.05), min: f(0.03), lines: 1, lh: 1.1 },
    // Im Querformat sind die Spalten schmal: Der Titel darf auf drei Zeilen, die Untergrenze sinkt.
    titel: { weight: 600, max: m(kraeftig ? 0.12 : 0.11), min: f(wide ? 0.036 : 0.05), lines: wide ? 3 : 2, lh: 1.08 },
    angebot: { weight: 400, max: m(0.05), min: f(0.03), lines: 4, lh: 1.3 },
    // Preise, früherer Preis und Datum werden nie gekürzt: Lieber eine kleine Schrift als eine falsche Zahl.
    preis: { weight: 600, max: m(kraeftig ? 0.3 : 0.2), min: f(0.012), lines: 1, lh: 1.05 },
    frueher: { weight: 400, max: m(0.05), min: f(0.012), lines: 1, lh: 1.15 },
    gueltig: { weight: 500, max: m(0.034), min: f(0.016), lines: 1, lh: 1.2 },
    aufforderung: { weight: 500, max: m(0.038), min: f(0.026), lines: 1, lh: 1.1 },
    kontakt: { weight: 400, max: m(0.032), min: f(0.024), lines: 1, lh: 1.2 },
  };
}

/**
 * Zuschlag nach Seitenverhältnis: 1 beim Quadrat, 1,4 bei der Story (mehr Höhe, also grössere Schrift und Zeilen), 0,85 beim
 * Querformat (weniger Höhe, also kleinere Kopf- und Fusszeilen).
 */
export const boostFor = (width: number, height: number): number => Math.min(1.4, Math.max(0.85, 1 + 0.6 * (height / width - 1)));

/** Layout einer Vorlage in einem Format: Rechtecke aller Elemente in Pixeln. Reine Rechnung, ohne Canvas. */
export function layoutFor(template: TemplateKey, w: number, h: number, presence: Presence = ALL_PRESENT): Layout {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const px = (fraction: number) => Math.round(W * fraction);
  const wide = W / H >= 1.2;
  // Rand mindestens 6 % der Breite; im Querformat knapper, weil dort die Höhe fehlt.
  const margin = px(wide ? 0.06 : 0.08);
  const story = H / W >= 1.7;
  const safe = story ? Math.max(margin, Math.round((STORY_SAFE_PX * W) / 1080)) : margin;
  const area: Rect = { x: margin, y: safe, w: W - 2 * margin, h: H - 2 * safe };
  const has: Presence = { ...presence, frueher: presence.preis && presence.frueher };
  const titelLen = presence.titelLen ?? LIMITS.titel.max;
  const angebotLen = presence.angebotLen ?? LIMITS.angebot.max;
  const c: Ctx = {
    W,
    H,
    template,
    margin,
    area,
    wide,
    has,
    px,
    k: boostFor(W, H),
    wTitel: 2.2 + 1.0 * Math.min(1, titelLen / LIMITS.titel.max),
    wAngebot: 1.2 + 2.4 * Math.min(1, angebotLen / LIMITS.angebot.max),
  };
  const parts = template === "handwerk" ? handwerk(c) : flat(c, template === "kraeftig");
  return {
    width: W,
    height: H,
    margin,
    story,
    wide: c.wide,
    safeTop: safe,
    safeBottom: safe,
    fonts: fontsFor(template, W, Math.max(1, c.k), wide),
    logoMaxWidth: px(0.18),
    ...parts,
  };
}

// ---- Text im Rechteck -------------------------------------------------------------------------------

export type Fit = { size: number; lines: string[]; ellipsis: boolean };

/**
 * Grösste Schrift, bei der der Text in das Rechteck passt: höchstens `spec.lines` Zeilen, jede nicht breiter als das Rechteck, alle
 * Zeilen zusammen nicht höher als das Rechteck. Passt nichts, gilt die Untergrenze mit gekürzten Zeilen («…»).
 */
export function fitIntoBox(text: string, width: number, height: number, spec: Pick<FontSpec, "max" | "min" | "lines" | "lh">, measureAt: (size: number) => (s: string) => number): Fit {
  let cap = Math.max(spec.max, spec.min);
  for (let guard = 0; guard < 400; guard++) {
    const size = fitFont(text, width, spec.lines, measureAt, cap, spec.min).size;
    const measure = measureAt(size);
    const lines = wrapByWidth(text, width, measure);
    const fitsWidth = lines.length <= spec.lines && lines.every((l) => measure(l) <= width);
    if (fitsWidth && lines.length * size * spec.lh <= height) return { size, lines, ellipsis: false };
    if (size <= spec.min) break;
    cap = size - 2;
  }
  const rows = Math.max(1, Math.min(spec.lines, Math.floor(height / (spec.min * spec.lh))));
  const measure = measureAt(spec.min);
  const lines = wrapByWidth(text, width, measure, rows).map((line) => cutToWidth(line, width, measure));
  return { size: spec.min, lines, ellipsis: lines.some((l) => l.endsWith("…")) };
}

/** Kürzt eine Zeile (zum Beispiel ein sehr langes Wort ohne Leerzeichen) zeichenweise, bis sie mit «…» in die Breite passt. */
function cutToWidth(line: string, width: number, measure: (s: string) => number): string {
  if (measure(line) <= width) return line;
  let cut = [...line];
  while (cut.length > 1 && measure(`${cut.join("")}…`) > width) cut = cut.slice(0, -1);
  return `${cut.join("").trimEnd()}…`;
}

// ---- Modell für das Zeichnen ------------------------------------------------------------------------

export type OfferModel = {
  firma: string;
  titel: string;
  angebot: string;
  preis: string | null;
  frueher: string | null;
  gueltig: string | null;
  aufforderung: string;
  kontakt: string;
  vorlage: TemplateKey;
  palette: Palette;
};

export function modelOf(input: OfferInput): OfferModel {
  const prices = priceLines(input);
  return {
    firma: clean(input.firma),
    titel: clean(input.titel),
    angebot: clean(input.angebot),
    preis: prices.preis,
    frueher: prices.frueher,
    gueltig: validityLine(input),
    aufforderung: clean(input.aufforderung),
    kontakt: clean(input.kontakt),
    vorlage: input.vorlage,
    palette: accentFor(input.farbe, input.hex),
  };
}

/** Vorschau mit Beispieltexten, solange Titel, Angebot oder Aufforderung leer sind. `platzhalter` sagt, ob ein Beispieltext eingesetzt wurde. */
export function previewModel(input: OfferInput): { model: OfferModel; platzhalter: boolean } {
  const model = modelOf(input);
  const platzhalter = !model.titel || !model.angebot || !model.aufforderung;
  return {
    model: {
      ...model,
      titel: model.titel || PLATZHALTER.titel,
      angebot: model.angebot || PLATZHALTER.angebot,
      aufforderung: model.aufforderung || PLATZHALTER.aufforderung,
    },
    platzhalter,
  };
}

/** Welche Elemente die Grafik zeigt (für layoutFor). `logo`: ein Logo ist geladen. */
export function presenceOf(model: OfferModel, logo: boolean): Presence {
  return {
    logo,
    preis: model.preis !== null,
    frueher: model.frueher !== null,
    gueltig: model.gueltig !== null,
    kontakt: model.kontakt !== "",
    titelLen: [...model.titel].length,
    angebotLen: [...model.angebot].length,
  };
}

/** Alternativtext der Grafik für Screenreader. */
export function describeOffer(model: OfferModel): string {
  const parts = [model.titel, model.angebot];
  if (model.preis) parts.push(model.frueher ? `${model.preis}, früher ${model.frueher}` : model.preis);
  if (model.gueltig) parts.push(model.gueltig);
  parts.push(model.aufforderung);
  if (model.kontakt) parts.push(model.kontakt);
  if (model.firma) parts.push(model.firma);
  return `${parts.map((p) => p.replace(/[.!?]+$/, "")).join(". ")}.`;
}

// ---- Hinweise zu den Texten -------------------------------------------------------------------------

export type TextField = "titel" | "angebot" | "aufforderung" | "kontakt";
export type StyleHint = { field: TextField; message: string };
const TEXT_LABELS: Record<TextField, string> = { titel: "Titel", angebot: "Angebot", aufforderung: "Aufforderung", kontakt: "Kontaktzeile" };

const PRESSURE: { re: RegExp; message: string }[] = [
  { re: /\bjetzt\b/i, message: "«jetzt» wirkt wie Druck." },
  { re: /\bnur noch\b/i, message: "«nur noch» wirkt wie Druck." },
  { re: /\bgarantiert\b/i, message: "«garantiert» ist ein Versprechen. Lass es weg, wenn du es nicht belegen kannst." },
  { re: /!/, message: "Ausrufezeichen wirken laut." },
];

/**
 * Hinweise zu Wörtern, die nicht zur Stimme von Alperna passen: «jetzt», «nur noch», «garantiert», Ausrufezeichen und die harten
 * Regeln der Sperrliste (lib/brand-rules.ts). Es sind Hinweise, kein Verbot: Die Grafik zeigt den Text so, wie du ihn schreibst.
 */
export function styleHints(f: Pick<Felder, TextField>): StyleHint[] {
  const out: StyleHint[] = [];
  for (const field of Object.keys(TEXT_LABELS) as TextField[]) {
    const text = f[field] ?? "";
    if (!text.trim()) continue;
    for (const p of PRESSURE) if (p.re.test(text)) out.push({ field, message: `${TEXT_LABELS[field]}: ${p.message}` });
    for (const hit of brandHits(text)) {
      if (hit.level !== "hart") continue;
      // Das Leerzeichen vor einem Satzzeichen trifft auch «Fassade , Gerüst»; die Regel steht bei den Hinweisen zu Wörtern nicht im Vordergrund.
      if (/Leerzeichen vor Satzzeichen/.test(hit.what)) continue;
      out.push({ field, message: `${TEXT_LABELS[field]}: ${hit.what}` });
    }
  }
  return out;
}

/** Hinweise unter dem Ergebnis. Die Story-Zeile erscheint nur, wenn das Story-Format gewählt ist. */
export function hinweise(formate: readonly ImageFormatKey[]): string[] {
  const out = [
    `Die Pixelmasse sind ein ${RICHTWERT_NOTE}. Die Plattformen ändern ihre Masse, prüfe sie vor dem Veröffentlichen.`,
    `Wenig Text auf einem Bild lässt sich besser lesen (${RICHTWERT_NOTE}). Alles Weitere gehört in den Beitragstext.`,
    "Ergänze beim Veröffentlichen einen Alternativtext, damit auch Screenreader den Inhalt der Grafik haben.",
  ];
  if (formate.includes("story")) {
    out.push(`Bei der Story bleiben oben und unten je ${STORY_SAFE_PX} Pixel frei, weil die Plattformen dort Bedienelemente über das Bild legen (${RICHTWERT_NOTE}).`);
  }
  return out;
}

// ---- Dateien ----------------------------------------------------------------------------------------

export { pngFilename };
export const zipName = (titel: string): string => `angebotsgrafik-${safeFilename(clean(titel), "grafik")}.zip`;

export type DateiInfo = { key: ImageFormatKey; label: string; width: number; height: number; datei: string };
export type Output = { titel: string; firma: string; logo: boolean; dateien: DateiInfo[] };

/** Was zum Ergebnis gehört: die gewählten Formate mit Pixelmassen und Dateinamen. */
export function buildOutput(input: OfferInput): Output {
  const titel = clean(input.titel);
  return {
    titel,
    firma: clean(input.firma),
    logo: input.logo,
    dateien: orderFormats(input.formate).map((key) => {
      const f = imageFormat(key);
      return { key, label: f.label, width: f.width, height: f.height, datei: pngFilename(titel, key) };
    }),
  };
}

// ---- CRM --------------------------------------------------------------------------------------------

/** Die Angaben je Zeile. Das Logo erscheint nur als «ja» oder «nein». */
export function eingabeText(input: OfferInput): string {
  const p = priceLines(input);
  const farbe = FARBEN.find((f) => f.key === input.farbe);
  const hex = accentFor(input.farbe, input.hex).accent;
  const formate = orderFormats(input.formate).map((k) => imageFormat(k).label);
  return [
    `Titel: ${clean(input.titel)}`,
    `Angebot: ${clean(input.angebot)}`,
    `Preis: ${p.preis ?? "keiner"}`,
    `Früherer Preis: ${p.frueher ?? "keiner"}`,
    `Gültig bis: ${gueltigDatum(input) ?? "ohne Datum"}`,
    `Aufforderung: ${clean(input.aufforderung)}`,
    `Kontaktzeile: ${clean(input.kontakt) || "keine"}`,
    `Farbe: ${farbe?.label ?? "Tinte"} (${hex})`,
    `Vorlage: ${templateLabel(input.vorlage)}`,
    `Formate: ${formate.join(", ")}`,
    `Logo: ${input.logo ? "ja" : "nein"}`,
  ].join("\n");
}

/** Die gewählten Formate mit Pixelmassen und dem Satz, dass nichts hochgeladen wird. */
export function ausgabeText(output: Output): string {
  const n = output.dateien.length;
  return [
    `Angebotsgrafik «${output.titel}»: ${n} ${n === 1 ? "Format" : "Formate"}`,
    ...output.dateien.map((d) => `- ${d.label}: ${d.width} × ${d.height} Pixel (${d.datei})`),
    `ZIP: ${zipName(output.titel)}`,
    "PNG im Browser erzeugt, nichts hochgeladen.",
  ].join("\n");
}

// ---- Gespeicherter Stand ----------------------------------------------------------------------------

export type StoredFelder = Omit<Felder, "kontakt"> & {
  /** null: noch nie gesetzt, dann gilt der Vorschlag aus dem Firmenprofil. Leer heisst: bewusst keine Kontaktzeile. */
  kontakt: string | null;
};

export type OfferState = {
  v: 1;
  phase: "edit" | "result";
  felder: StoredFelder;
  vorlage: TemplateKey;
  farbe: FarbeKey;
  hex: string;
  formate: ImageFormatKey[];
  /** Ein Logo war gewählt. Das Bild selbst wird nie gespeichert. */
  logo: boolean;
  output?: Output;
};

export const EMPTY_STATE: OfferState = {
  v: 1,
  phase: "edit",
  felder: { ...EMPTY_FELDER, kontakt: null },
  vorlage: "ruhig",
  farbe: "tinte",
  hex: "",
  formate: [...DEFAULT_FORMATE],
  logo: false,
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

function parseOutput(v: unknown): Output | undefined {
  if (!isObj(v) || !Array.isArray(v.dateien)) return undefined;
  const dateien: DateiInfo[] = [];
  for (const d of v.dateien) {
    if (!isObj(d) || !isImageFormatKey(d.key)) continue;
    const f = imageFormat(d.key);
    dateien.push({ key: f.key, label: f.label, width: f.width, height: f.height, datei: str(d.datei, 120) });
  }
  if (dateien.length === 0) return undefined;
  return { titel: str(v.titel, 200), firma: str(v.firma, 200), logo: v.logo === true, dateien };
}

/** Liest den Stand aus beliebigen Daten. Kaputtes fällt auf den leeren Stand zurück; «result» nur mit gültigen Angaben und Ergebnis. */
export function parseState(raw: unknown): OfferState {
  if (!isObj(raw) || raw.v !== 1) return { ...EMPTY_STATE, felder: { ...EMPTY_STATE.felder }, formate: [...DEFAULT_FORMATE] };
  const f = isObj(raw.felder) ? raw.felder : {};
  const felder: StoredFelder = {
    titel: str(f.titel, 200),
    angebot: str(f.angebot, 500),
    preis: str(f.preis, 20),
    frueher: str(f.frueher, 20),
    gueltigBis: str(f.gueltigBis, 10),
    aufforderung: str(f.aufforderung, 200),
    kontakt: typeof f.kontakt === "string" ? f.kontakt.slice(0, 200) : null,
  };
  const farbe = isFarbeKey(raw.farbe) ? raw.farbe : "tinte";
  const formate = Array.isArray(raw.formate) ? orderFormats(raw.formate) : [...DEFAULT_FORMATE];
  const state: OfferState = {
    v: 1,
    phase: "edit",
    felder,
    vorlage: isTemplateKey(raw.vorlage) ? raw.vorlage : "ruhig",
    farbe,
    hex: str(raw.hex, 7),
    formate,
    logo: raw.logo === true,
  };
  const output = parseOutput(raw.output);
  if (raw.phase === "result" && output) {
    const form = formOf(state, "");
    // Ohne Datum prüfen: Ein Ergebnis von gestern bleibt ein Ergebnis, auch wenn «Gültig bis» inzwischen verstrichen ist.
    if (feldProblems(form, "0000-01-01").length === 0) return { ...state, phase: "result", output };
  }
  return output ? { ...state, output } : state;
}

/** Das Formular aus dem Stand. `kontaktVorschlag` gilt, solange noch nie eine Kontaktzeile gesetzt wurde. */
export function formOf(state: OfferState, kontaktVorschlag: string): Form {
  const k = state.felder.kontakt;
  return {
    ...state.felder,
    kontakt: k ?? kontaktVorschlag,
    vorlage: state.vorlage,
    farbe: state.farbe,
    hex: state.hex,
    formate: state.formate,
  };
}

/** Der Stand mit den Werten des Formulars. */
export function stateOf(state: OfferState, form: Form, logo: boolean): OfferState {
  const felder: StoredFelder = {
    titel: form.titel,
    angebot: form.angebot,
    preis: form.preis,
    frueher: form.frueher,
    gueltigBis: form.gueltigBis,
    aufforderung: form.aufforderung,
    kontakt: form.kontakt,
  };
  return { ...state, felder, vorlage: form.vorlage, farbe: form.farbe, hex: form.hex, formate: orderFormats(form.formate), logo };
}

/** Vorschlag für die Kontaktzeile aus dem Profil: die Website, sonst der Ort. */
export function kontaktVorschlag(profile: { website?: string; ort?: string }): string {
  const site = (profile.website ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const v = site || (profile.ort ?? "").trim();
  return [...v].length <= LIMITS.kontakt.max ? v : "";
}
