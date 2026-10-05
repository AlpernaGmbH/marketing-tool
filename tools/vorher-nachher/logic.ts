import { numberCH, pctCH } from "@/lib/ch";
import { safeFilename } from "@/lib/export/model";
import { IMAGE_FORMATS, coverCrop, pngFilename, type ImageFormat, type Rect } from "@/lib/export/png";

// Vorher-Nachher-Collage: reine Funktionen, kein React, kein DOM (CLAUDE.md, Harte Regel 3). Gezeichnet wird in render.ts,
// die Oberfläche steht in Tool.tsx. Hier: Layout und Zuschnitt als Zahlen, Prüfung, Beschriftung, Dateinamen, Texte fürs CRM
// und der gespeicherte Stand. Die Bilder verlassen den Browser nie (Harte Regel 1); in den Stand und ins CRM gehen nur Einstellungen.
// Spec: specs/vorher-nachher.md

export const SLUG = "vorher-nachher";
export const STATE_KEY = `mt:${SLUG}`;

// ---- Auswahl -----------------------------------------------------------------------------------------

export const LAYOUT_KEYS = ["neben", "unter", "schieber"] as const;
export type Layout = (typeof LAYOUT_KEYS)[number];

export const LAYOUTS: readonly { key: Layout; label: string; hilfe: string }[] = [
  { key: "neben", label: "Nebeneinander", hilfe: "Zwei gleich grosse Bilder, links Vorher und rechts Nachher. Das passt zu Fotos im Hochformat." },
  { key: "unter", label: "Untereinander", hilfe: "Zwei gleich grosse Bilder, oben Vorher und unten Nachher. Das passt zu Fotos im Querformat und zur Story." },
  { key: "schieber", label: "Schieber", hilfe: "Beide Bilder füllen die Fläche, eine senkrechte Trennlinie mit Griff teilt sie. Das Ergebnis ist ein Standbild." },
];

export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";

export const BESCHRIFTUNG_KEYS = ["standard", "eigene", "ohne"] as const;
export type Beschriftung = (typeof BESCHRIFTUNG_KEYS)[number];
export const BESCHRIFTUNGEN: readonly { key: Beschriftung; label: string }[] = [
  { key: "standard", label: "Vorher und Nachher" },
  { key: "eigene", label: "Eigene Wörter" },
  { key: "ohne", label: "Ohne" },
];

export const ECKEN_KEYS = ["ol", "or", "ul", "ur"] as const;
export type Ecke = (typeof ECKEN_KEYS)[number];
export const ECKEN: readonly { key: Ecke; label: string }[] = [
  { key: "ol", label: "oben links" },
  { key: "or", label: "oben rechts" },
  { key: "ul", label: "unten links" },
  { key: "ur", label: "unten rechts" },
];

export type FormatKey = "feed" | "portrait" | "story";
export type CollageFormat = ImageFormat & { key: FormatKey };
/** Feed 1:1, Feed 4:5 und Story 9:16 (ohne den Google-Beitrag). Pixelmasse: Richtwert von Alperna, keine Vorgabe der Plattformen. */
export const FORMATE: readonly CollageFormat[] = IMAGE_FORMATS.filter((f): f is CollageFormat => f.key !== "gbp");
const FORMAT_KEYS = FORMATE.map((f) => f.key);

export const isFormatKey = (v: unknown): v is FormatKey => typeof v === "string" && (FORMAT_KEYS as string[]).includes(v);
export const formatOf = (key: FormatKey): CollageFormat => FORMATE.find((f) => f.key === key) ?? FORMATE[0];
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

export const MAX_WORT = 20;
export const POSITION = { min: 20, max: 80, standard: 50 } as const;
export const ZOOM = { min: 1, max: 4, step: 0.1 } as const;
export const PAN = { min: -100, max: 100 } as const;
export const LOGO_GROESSE = { min: 8, max: 24, standard: 14 } as const;

// ---- Zahlen ------------------------------------------------------------------------------------------

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const cleanPosition = (v: unknown): number => Math.round(clamp(num(v, POSITION.standard), POSITION.min, POSITION.max));
export const cleanLogoGroesse = (v: unknown): number => Math.round(clamp(num(v, LOGO_GROESSE.standard), LOGO_GROESSE.min, LOGO_GROESSE.max));

// ---- Zuschnitt ---------------------------------------------------------------------------------------

/** zoom 1 bis 4, x und y von -100 bis 100 (0 = Mitte). Bezieht sich auf coverCrop(src, dst, zoom, x / 100, y / 100). */
export type Crop = { zoom: number; x: number; y: number };
export const NEUTRAL_CROP: Crop = { zoom: 1, x: 0, y: 0 };

export function cleanCrop(raw: unknown): Crop {
  const r = isObject(raw) ? raw : {};
  return {
    zoom: Math.round(clamp(num(r.zoom, 1), ZOOM.min, ZOOM.max) * 10) / 10,
    x: Math.round(clamp(num(r.x, 0), PAN.min, PAN.max)),
    y: Math.round(clamp(num(r.y, 0), PAN.min, PAN.max)),
  };
}

/** Die Argumente für coverCrop und drawCover. */
export function cropArgs(crop: Crop): { zoom: number; panX: number; panY: number } {
  const c = cleanCrop(crop);
  return { zoom: c.zoom, panX: c.x / 100, panY: c.y / 100 };
}

/** Quellrechteck, das ein Bild der Grösse src mit diesem Zuschnitt in das Ziel dst legt. */
export function cropFor(srcW: number, srcH: number, dst: { w: number; h: number }, crop: Crop): Rect {
  const a = cropArgs(crop);
  return coverCrop(srcW, srcH, dst.w, dst.h, a.zoom, a.panX, a.panY);
}

/**
 * Neuer Zuschnitt, wenn die Person das Bild in der Vorschau um (dx, dy) Zielpixel zieht. Gerechnet wird immer vom Zuschnitt beim
 * Beginn des Ziehens aus, damit sich das Runden nicht aufsummiert. Das Bild folgt der Hand: Zieht sie nach rechts, rückt der
 * Ausschnitt nach links. Wo das Bild keinen Spielraum hat, bleibt der Wert.
 */
export function panByDrag(src: { w: number; h: number }, dst: { w: number; h: number }, start: Crop, dx: number, dy: number): Crop {
  const c = cleanCrop(start);
  const a = cropArgs(c);
  const r = coverCrop(src.w, src.h, dst.w, dst.h, a.zoom, 0, 0);
  if (!(r.w > 0) || !(r.h > 0)) return c;
  const scale = dst.w / r.w; // Zielpixel je Quellpixel
  const freeX = src.w - r.w;
  const freeY = src.h - r.h;
  const move = (value: number, free: number, delta: number): number => {
    if (!(free > 1e-9) || !Number.isFinite(delta)) return value;
    const offset = (free / 2) * (1 + value / 100) - delta / scale;
    return Math.round(clamp((offset / (free / 2) - 1) * 100, PAN.min, PAN.max));
  };
  return { zoom: c.zoom, x: move(c.x, freeX, dx), y: move(c.y, freeY, dy) };
}

// ---- Einstellungen und Stand ------------------------------------------------------------------------

export type Worte = { erstes: string; zweites: string };

/** Alles, was die Person einstellt. Keine Bilder. */
export type Settings = {
  layout: Layout;
  position: number;
  beschriftung: Beschriftung;
  worte: Worte;
  ecke: Ecke;
  logoGroesse: number;
  formate: FormatKey[];
  zuschnitt: { vorher: Crop; nachher: Crop };
};

export const DEFAULT_SETTINGS: Settings = {
  layout: "neben",
  position: POSITION.standard,
  beschriftung: "standard",
  worte: { erstes: "", zweites: "" },
  ecke: "ur",
  logoGroesse: LOGO_GROESSE.standard,
  formate: ["feed"],
  zuschnitt: { vorher: NEUTRAL_CROP, nachher: NEUTRAL_CROP },
};

export type Output = { formate: FormatKey[]; logo: boolean };
export type VnState = Settings & { v: 1; phase: "edit" | "result"; output?: Output };
export const EMPTY_STATE: VnState = { v: 1, phase: "edit", ...DEFAULT_SETTINGS };

/** Auswahl der Formate in der festen Reihenfolge (Feed 1:1, Feed 4:5, Story 9:16), ohne Doppelte und Unbekanntes. */
export function cleanFormate(raw: unknown): FormatKey[] {
  const list = Array.isArray(raw) ? raw : [];
  return FORMAT_KEYS.filter((k) => list.includes(k));
}

/** Schaltet ein Format ein oder aus und hält die Reihenfolge. Die Liste darf leer werden; validate meldet das. */
export function toggleFormat(current: readonly FormatKey[], key: FormatKey): FormatKey[] {
  return cleanFormate(current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
}

const cleanWort = (v: unknown): string => (typeof v === "string" ? v.slice(0, MAX_WORT) : "");

export function cleanSettings(raw: unknown): Settings {
  const r = isObject(raw) ? raw : {};
  const worte = isObject(r.worte) ? r.worte : {};
  const zuschnitt = isObject(r.zuschnitt) ? r.zuschnitt : {};
  const formate = cleanFormate(r.formate);
  return {
    layout: isOneOf(LAYOUT_KEYS, r.layout) ? r.layout : DEFAULT_SETTINGS.layout,
    position: cleanPosition(r.position),
    beschriftung: isOneOf(BESCHRIFTUNG_KEYS, r.beschriftung) ? r.beschriftung : DEFAULT_SETTINGS.beschriftung,
    worte: { erstes: cleanWort(worte.erstes), zweites: cleanWort(worte.zweites) },
    ecke: isOneOf(ECKEN_KEYS, r.ecke) ? r.ecke : DEFAULT_SETTINGS.ecke,
    logoGroesse: cleanLogoGroesse(r.logoGroesse),
    formate: formate.length > 0 ? formate : DEFAULT_SETTINGS.formate,
    zuschnitt: { vorher: cleanCrop(zuschnitt.vorher), nachher: cleanCrop(zuschnitt.nachher) },
  };
}

export function settingsOf(state: VnState | Settings): Settings {
  return {
    layout: state.layout,
    position: state.position,
    beschriftung: state.beschriftung,
    worte: state.worte,
    ecke: state.ecke,
    logoGroesse: state.logoGroesse,
    formate: state.formate,
    zuschnitt: state.zuschnitt,
  };
}

function cleanOutput(raw: unknown): Output | null {
  if (!isObject(raw)) return null;
  const formate = cleanFormate(raw.formate);
  return formate.length > 0 ? { formate, logo: raw.logo === true } : null;
}

/**
 * Liest den Stand unter mt:vorher-nachher. Kaputte Daten fallen feldweise auf die Voreinstellung zurück, eine falsche Version auf den
 * leeren Stand. «result» gilt nur mit gültigem output (lib/progress.ts erkennt daran, dass das Werkzeug erledigt ist).
 */
export function parseState(raw: unknown): VnState {
  if (!isObject(raw) || raw.v !== 1) return EMPTY_STATE;
  const output = cleanOutput(raw.output);
  return { v: 1, phase: raw.phase === "result" && output ? "result" : "edit", ...cleanSettings(raw), ...(output ? { output } : {}) };
}

// ---- Beschriftung ------------------------------------------------------------------------------------

/** Die zwei Wörter für die Pillen (erstes und zweites Bild); null bei «Ohne». */
export function labelsFor(beschriftung: Beschriftung, worte: Worte): readonly [string, string] | null {
  if (beschriftung === "ohne") return null;
  if (beschriftung === "eigene") return [(worte.erstes ?? "").trim(), (worte.zweites ?? "").trim()];
  return ["Vorher", "Nachher"];
}

// ---- Prüfung -----------------------------------------------------------------------------------------

export type FieldKey = "vorher" | "nachher" | "wort1" | "wort2" | "logo" | "formate";
export type Problem = { field: FieldKey; message: string; /** true: die Datei selbst taugt nicht (zeigt die Seite sofort). */ datei: boolean };

/** id des Feldes, das den Fokus bekommt. */
export const FIELD_IDS: Record<FieldKey, string> = {
  vorher: "vn-vorher",
  nachher: "vn-nachher",
  wort1: "vn-wort1",
  wort2: "vn-wort2",
  logo: "vn-logo",
  formate: "vn-format-feed",
};

const BILD_NAME = { vorher: "Vorher-Bild", nachher: "Nachher-Bild" } as const;

export type ValidateInput = {
  hatVorher: boolean;
  hatNachher: boolean;
  beschriftung: Beschriftung;
  worte: Worte;
  formate: readonly FormatKey[];
  /** Meldung, wenn die gewählte Datei nicht taugt (imageFileProblem oder Fehler von loadImageFile). */
  dateifehler?: Partial<Record<"vorher" | "nachher" | "logo", string | null>>;
};

/** Alle Probleme in der Reihenfolge der Felder auf der Seite. Leer: es kann losgehen. */
export function validate(input: ValidateInput): Problem[] {
  const out: Problem[] = [];
  const fehler = input.dateifehler ?? {};
  for (const key of ["vorher", "nachher"] as const) {
    const has = key === "vorher" ? input.hatVorher : input.hatNachher;
    if (fehler[key]) out.push({ field: key, message: `${BILD_NAME[key]}: ${fehler[key]}`, datei: true });
    else if (!has) out.push({ field: key, message: `Wähle das ${BILD_NAME[key]}.`, datei: false });
  }
  if (input.beschriftung === "eigene") {
    const wort = (text: string, field: "wort1" | "wort2", name: string) => {
      const t = (text ?? "").trim();
      if (!t) out.push({ field, message: `Gib das Wort für das ${name} Bild an.`, datei: false });
      else if (t.length > MAX_WORT) out.push({ field, message: `Das Wort für das ${name} Bild hat höchstens ${MAX_WORT} Zeichen.`, datei: false });
    };
    wort(input.worte.erstes, "wort1", "erste");
    wort(input.worte.zweites, "wort2", "zweite");
  }
  if (fehler.logo) out.push({ field: "logo", message: `Logo: ${fehler.logo}`, datei: true });
  if (input.formate.length === 0) out.push({ field: "formate", message: "Wähle mindestens ein Format.", datei: false });
  return out;
}

const READ_ERROR = "Das Bild konnte nicht gelesen werden. Nimm eine Datei im Format PNG, JPG oder WebP.";

/** Meldung für einen Fehler von loadImageFile: eigene Meldungen bleiben, alles andere (etwa eine kaputte Datei) wird zu einem Satz. */
export function imageErrorMessage(err: unknown): string {
  return err instanceof Error && /^Das (?:ist kein Bild|Bild ist grösser)/.test(err.message) ? err.message : READ_ERROR;
}

// ---- Layout ------------------------------------------------------------------------------------------

/** Anteile an der Breite des Formats (Spec, Abschnitt Logik). */
export const GEO = { spalt: 0.006, rand: 0.03, schrift: 0.032, linie: 4, griff: 0.04, logoRand: 0.02 } as const;
/** Pille: Höhe und seitlicher Innenabstand in Schriftgrössen; kleinste Schrift in Anteilen der Grundschrift. */
export const PILLE = { hoehe: 1.9, innen: 0.75, minSchrift: 0.6 } as const;

export type Pille = { index: 0 | 1; text: string; schrift: number; rect: Rect };
export type LogoBox = { platte: Rect; logo: Rect; radius: number; ecke: Ecke };
export type Griff = { cx: number; cy: number; r: number };

export type CollageLayout = {
  w: number;
  h: number;
  /** Zielrechtecke der beiden Bilder. Beim Schieber füllen beide die ganze Fläche. */
  vorher: Rect;
  nachher: Rect;
  /** Sichtbare Flächen der beiden Bilder (beim Schieber links und rechts der Linie). */
  bereiche: readonly [Rect, Rect];
  /** Schieber: Das Vorher-Bild wird auf dieses Rechteck geclippt. */
  clip: Rect | null;
  linie: Rect | null;
  griff: Griff | null;
  pillen: Pille[];
  logo: LogoBox | null;
};

export type LayoutOptionen = {
  /** Wörter der Pillen (erstes und zweites Bild); ohne Angabe keine Pillen. Leere Wörter entfallen. */
  texte?: readonly [string, string] | null;
  /** Breite eines Textes in Pixel bei der Schriftgrösse px; ohne Angabe eine Schätzung (0,58 Schriftgrössen je Zeichen). */
  breite?: (text: string, px: number) => number;
  /** Logo: Seitenverhältnis (Breite durch Höhe), Wunschecke, Grösse in Prozent der Breite. */
  logo?: { aspect: number; ecke: Ecke; prozent: number } | null;
};

const estimate = (text: string, px: number) => text.length * px * 0.58;

/** Spalt in ganzen Pixeln: 0,6 % der Breite, mindestens 2, und so, dass (total − Spalt) gerade ist (zwei Hälften ohne halbe Pixel). */
function gapFor(width: number, total: number): number {
  let g = Math.max(2, Math.round(GEO.spalt * width));
  if (Math.round(total - g) % 2 !== 0) g += 1;
  return g;
}

export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function fitPille(text: string, maxW: number, basis: number, breite: (t: string, px: number) => number) {
  const innen = (f: number) => 2 * PILLE.innen * f;
  for (let i = 0; i <= 8; i++) {
    const f = basis * (1 - i * 0.05);
    if (f < basis * PILLE.minSchrift - 1e-9) break;
    const w = breite(text, f) + innen(f);
    if (w <= maxW) return { text, schrift: f, breite: w };
  }
  const f = basis * PILLE.minSchrift;
  const room = Math.max(0, maxW - innen(f));
  let t = text;
  while (t.length > 1 && breite(`${t}…`, f) > room) t = t.slice(0, -1).trimEnd();
  const shown = t === text ? text : `${t}…`;
  return { text: shown, schrift: f, breite: Math.min(maxW, breite(shown, f) + innen(f)) };
}

const flipV = (e: Ecke): Ecke => `${e[0] === "o" ? "u" : "o"}${e[1]}` as Ecke;
const flipH = (e: Ecke): Ecke => `${e[0]}${e[1] === "l" ? "r" : "l"}` as Ecke;

/**
 * Zielrechtecke der Bilder, Linie, Griff, Pillen und Logo für ein Format der Grösse w × h (Format-Pixel). Rein: ohne Optionen
 * liefert die Funktion nur Bilder, Linie und Griff.
 */
export function layoutFor(layout: Layout, w: number, h: number, position: number = POSITION.standard, opt: LayoutOptionen = {}): CollageLayout {
  const W = Math.max(1, num(w, 1));
  const H = Math.max(1, num(h, 1));
  const m = GEO.rand * W;

  let vorher: Rect;
  let nachher: Rect;
  let bereiche: [Rect, Rect];
  let clip: Rect | null = null;
  let linie: Rect | null = null;
  let griff: Griff | null = null;

  if (layout === "schieber") {
    const lx = Math.round((W * cleanPosition(position)) / 100);
    vorher = { x: 0, y: 0, w: W, h: H };
    nachher = { x: 0, y: 0, w: W, h: H };
    bereiche = [
      { x: 0, y: 0, w: lx, h: H },
      { x: lx, y: 0, w: W - lx, h: H },
    ];
    clip = { ...bereiche[0] };
    linie = { x: lx - GEO.linie / 2, y: 0, w: GEO.linie, h: H };
    griff = { cx: lx, cy: H / 2, r: GEO.griff * W };
  } else if (layout === "unter") {
    const s = gapFor(W, H);
    const ch = (H - s) / 2;
    vorher = { x: 0, y: 0, w: W, h: ch };
    nachher = { x: 0, y: ch + s, w: W, h: ch };
    bereiche = [{ ...vorher }, { ...nachher }];
  } else {
    const s = gapFor(W, W);
    const cw = (W - s) / 2;
    vorher = { x: 0, y: 0, w: cw, h: H };
    nachher = { x: cw + s, y: 0, w: cw, h: H };
    bereiche = [{ ...vorher }, { ...nachher }];
  }

  const pillen: Pille[] = [];
  if (opt.texte) {
    const breite = opt.breite ?? estimate;
    opt.texte.forEach((raw, i) => {
      const text = (raw ?? "").trim();
      if (!text) return;
      const b = bereiche[i];
      const rechts = layout === "schieber" && i === 1;
      const maxW = Math.max(1, layout === "schieber" ? b.w - m - m / 2 : b.w - 2 * m);
      const fit = fitPille(text, maxW, GEO.schrift * W, breite);
      pillen.push({
        index: i as 0 | 1,
        text: fit.text,
        schrift: fit.schrift,
        rect: { x: rechts ? W - m - fit.breite : b.x + m, y: b.y + m, w: fit.breite, h: PILLE.hoehe * fit.schrift },
      });
    });
  }

  let logo: LogoBox | null = null;
  if (opt.logo) {
    const pad = GEO.logoRand * W;
    const aspect = clamp(num(opt.logo.aspect, 1), 0.05, 20);
    const maxSide = Math.max(1, Math.min(W, H) - 2 * m - 2 * pad);
    const side = Math.min((cleanLogoGroesse(opt.logo.prozent) / 100) * W, maxSide);
    const lw = aspect >= 1 ? side : side * aspect;
    const lh = aspect >= 1 ? side / aspect : side;
    const pw = lw + 2 * pad;
    const ph = lh + 2 * pad;
    const platteIn = (e: Ecke): Rect => ({ x: e[1] === "l" ? m : W - m - pw, y: e[0] === "o" ? m : H - m - ph, w: pw, h: ph });
    const wunsch: Ecke = isOneOf(ECKEN_KEYS, opt.logo.ecke) ? opt.logo.ecke : DEFAULT_SETTINGS.ecke;
    const hindernisse: Rect[] = pillen.map((p) => p.rect);
    if (griff) hindernisse.push({ x: griff.cx - griff.r, y: griff.cy - griff.r, w: 2 * griff.r, h: 2 * griff.r });
    const frei = (e: Ecke) => !hindernisse.some((r) => overlaps(platteIn(e), r, m / 2));
    const ecke = [wunsch, flipV(wunsch), flipH(wunsch), flipV(flipH(wunsch))].find(frei) ?? wunsch;
    const platte = platteIn(ecke);
    logo = { platte, logo: { x: platte.x + pad, y: platte.y + pad, w: lw, h: lh }, radius: pad, ecke };
  }

  return { w: W, h: H, vorher, nachher, bereiche, clip, linie, griff, pillen, logo };
}

/** Welches Bild liegt an dieser Stelle (Format-Pixel)? Im Spalt und ausserhalb: null. Beim Schieber entscheidet die Linie. */
export function hitImage(l: CollageLayout, x: number, y: number): "vorher" | "nachher" | null {
  if (!(x >= 0 && x <= l.w && y >= 0 && y <= l.h)) return null;
  if (l.clip) return x < l.clip.w ? "vorher" : "nachher";
  const inside = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inside(l.vorher)) return "vorher";
  if (inside(l.nachher)) return "nachher";
  return null;
}

// ---- Dateinamen --------------------------------------------------------------------------------------

/** «malerei-keller-feed.png»; ohne Firma «vorher-nachher-feed.png». */
export function pngName(firma: string | undefined, key: FormatKey): string {
  return pngFilename((firma ?? "").trim() || SLUG, key);
}

/** «vorher-nachher-malerei-keller.zip»; ohne Firma «vorher-nachher.zip». */
export function zipName(firma?: string): string {
  const f = (firma ?? "").trim();
  return f ? `${SLUG}-${safeFilename(f, "firma")}.zip` : `${SLUG}.zip`;
}

// ---- Texte -------------------------------------------------------------------------------------------

const pixelText = (f: ImageFormat) => `${numberCH(f.width, 0)} × ${numberCH(f.height, 0)} Pixel`;
export const formatPixel = (key: FormatKey): string => pixelText(formatOf(key));

/** Beschreibung der Vorschau für Screenreader (aria-label des Canvas). */
export function vorschauText(i: { format: FormatKey; settings: Settings; hatVorher: boolean; hatNachher: boolean; hatLogo: boolean }): string {
  const s = i.settings;
  const lage =
    s.layout === "schieber"
      ? `ein Schieber mit senkrechter Trennlinie bei ${pctCH(cleanPosition(s.position), 0)}, links das Vorher-Bild, rechts das Nachher-Bild`
      : s.layout === "unter"
        ? "zwei Bilder untereinander, oben das Vorher-Bild, unten das Nachher-Bild"
        : "zwei Bilder nebeneinander, links das Vorher-Bild, rechts das Nachher-Bild";
  const worte = labelsFor(s.beschriftung, s.worte)?.filter(Boolean) ?? [];
  const beschriftung = s.beschriftung === "ohne" ? "Ohne Beschriftung." : worte.length > 0 ? `Beschriftung ${worte.map((w) => `«${w}»`).join(" und ")}.` : "";
  const logo = i.hatLogo ? `Logo ${ECKEN.find((e) => e.key === s.ecke)?.label ?? ""}.` : "Kein Logo.";
  const fehlt = [i.hatVorher ? "" : "Vorher-Bild", i.hatNachher ? "" : "Nachher-Bild"].filter(Boolean);
  const offen = fehlt.length > 0 ? `Es fehlt noch: ${fehlt.join(" und ")}.` : "";
  return [`Vorschau ${formatOf(i.format).label}: ${lage}.`, beschriftung, logo, offen].filter(Boolean).join(" ");
}

export type BildInfo = { name: string; width: number; height: number };

const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, 80);
const bildZeile = (label: string, b: BildInfo) => `${label}: ${cleanName(b.name)}, ${numberCH(b.width, 0)} × ${numberCH(b.height, 0)} Pixel`;
const cropZeile = (label: string, c: Crop) => `${label}: Zoom ${numberCH(c.zoom, 1)}, waagrecht ${numberCH(c.x, 0)}, senkrecht ${numberCH(c.y, 0)}`;

/** Die Angaben, eine je Zeile (Zugang v3). Nur Einstellungen und Dateinamen, nie Bilddaten. */
export function eingabeText(i: { firma?: string; settings: Settings; vorher: BildInfo; nachher: BildInfo; logo: boolean }): string {
  const s = i.settings;
  const layout = LAYOUTS.find((l) => l.key === s.layout)?.label ?? s.layout;
  const worte = labelsFor(s.beschriftung, s.worte);
  const beschriftung = s.beschriftung === "ohne" ? "Ohne" : s.beschriftung === "eigene" && worte ? `Eigene Wörter «${worte[0]}» und «${worte[1]}»` : "Vorher und Nachher";
  const lines: string[] = [];
  if ((i.firma ?? "").trim()) lines.push(`Firma: ${i.firma!.trim()}`);
  lines.push(`Layout: ${layout}${s.layout === "schieber" ? `, Trennlinie bei ${pctCH(cleanPosition(s.position), 0)}` : ""}`);
  lines.push(`Beschriftung: ${beschriftung}`);
  lines.push(`Formate: ${s.formate.map((k) => formatOf(k).label).join(", ")}`);
  lines.push(
    i.logo ? `Logo: ja, ${ECKEN.find((e) => e.key === s.ecke)?.label ?? ""}, ${pctCH(cleanLogoGroesse(s.logoGroesse), 0)} der Breite` : "Logo: nein",
  );
  lines.push(bildZeile("Vorher-Bild", i.vorher), bildZeile("Nachher-Bild", i.nachher));
  lines.push(cropZeile("Zuschnitt Vorher", s.zuschnitt.vorher), cropZeile("Zuschnitt Nachher", s.zuschnitt.nachher));
  return lines.join("\n");
}

/** Das Ergebnis als lesbare Liste (Zugang v3). */
export function ausgabeText(formate: readonly FormatKey[]): string {
  const n = formate.length;
  return [
    `Vorher-Nachher-Collage: ${n} ${n === 1 ? "Format" : "Formate"}`,
    ...formate.map((k) => `${formatOf(k).label}: ${formatPixel(k)}`),
    "PNG im Browser erzeugt, nichts hochgeladen",
  ].join("\n");
}

/** Satz über dem Ergebnis, zum Beispiel «2 Formate, Layout Schieber, Beschriftung «Vorher» und «Nachher»». */
export function ergebnisSatz(settings: Settings): string {
  const n = settings.formate.length;
  const layout = LAYOUTS.find((l) => l.key === settings.layout)?.label ?? settings.layout;
  const worte = labelsFor(settings.beschriftung, settings.worte)?.filter(Boolean) ?? [];
  const beschriftung = settings.beschriftung === "ohne" ? "ohne Beschriftung" : `Beschriftung ${worte.map((w) => `«${w}»`).join(" und ")}`;
  return `${n} ${n === 1 ? "Format" : "Formate"}, Layout ${layout}, ${beschriftung}.`;
}
