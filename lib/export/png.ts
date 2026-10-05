// Bildbaustein für Werkzeuge, die Grafiken als PNG liefern (Angebotsgrafik, Vorher/Nachher): Formate, Zuschnitt, Textumbruch und
// Farbkontrast als reine Funktionen (ohne DOM, testbar), dazu die Browser-Teile (Schriften laden, Bild lesen, Canvas zu PNG).
// Alles bleibt im Browser: Bilder der Besucher werden nie hochgeladen (Harte Regel 1).

import { FONT_PATHS } from "@/lib/export/fonts";

// ---- Formate ---------------------------------------------------------------------------------------------------------

export type ImageFormatKey = "feed" | "portrait" | "story" | "gbp";
export type ImageFormat = { key: ImageFormatKey; label: string; width: number; height: number; note: string };

/** Pixelmasse: Richtwert von Alperna, keine Vorgabe der Plattformen; die Plattformen ändern ihre Masse. */
export const IMAGE_FORMATS: readonly ImageFormat[] = [
  { key: "feed", label: "Feed 1:1", width: 1080, height: 1080, note: "Instagram, Facebook, LinkedIn" },
  { key: "portrait", label: "Feed 4:5", width: 1080, height: 1350, note: "Instagram, Facebook (hoch)" },
  { key: "story", label: "Story 9:16", width: 1080, height: 1920, note: "Instagram- und Facebook-Story" },
  { key: "gbp", label: "Google-Beitrag 4:3", width: 1200, height: 900, note: "Google-Unternehmensprofil" },
];

export const isImageFormatKey = (v: unknown): v is ImageFormatKey => typeof v === "string" && IMAGE_FORMATS.some((f) => f.key === v);
export const imageFormat = (key: ImageFormatKey): ImageFormat => IMAGE_FORMATS.find((f) => f.key === key) ?? IMAGE_FORMATS[0];

/** Dateiname: `<basis>-<format>.png`, ohne Sonderzeichen. */
export function pngFilename(base: string, format: ImageFormatKey): string {
  const slug = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "grafik"}-${format}.png`;
}

// ---- Zuschnitt -------------------------------------------------------------------------------------------------------

export type Rect = { x: number; y: number; w: number; h: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Quellrechteck, das ein Bild der Grösse src formatfüllend (cover) in ein Ziel der Grösse dst legt.
 * zoom ≥ 1 vergrössert den Ausschnitt; pan von -1 bis 1 verschiebt ihn (0 = Mitte, ±1 = bis zum Rand des Bildes).
 */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number, zoom = 1, panX = 0, panY = 0): Rect {
  if (!(srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const z = clamp(Number.isFinite(zoom) ? zoom : 1, 1, 8);
  const scale = Math.max(dstW / srcW, dstH / srcH) * z; // Ziel-Pixel je Quell-Pixel
  const w = dstW / scale;
  const h = dstH / scale;
  const freeX = srcW - w;
  const freeY = srcH - h;
  const px = clamp(Number.isFinite(panX) ? panX : 0, -1, 1);
  const py = clamp(Number.isFinite(panY) ? panY : 0, -1, 1);
  return { x: (freeX / 2) * (1 + px), y: (freeY / 2) * (1 + py), w, h };
}

// ---- Text ------------------------------------------------------------------------------------------------------------

/** Bricht Text nach gemessener Breite um. Zu lange Wörter bleiben in einer eigenen Zeile. Mit maxLines endet die letzte Zeile bei Bedarf auf «…». */
export function wrapByWidth(text: string, maxWidth: number, measure: (s: string) => number, maxLines = Infinity): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/** Grösste Schriftgrösse (in 2er-Schritten von max bis min), bei der der Text in höchstens maxLines Zeilen passt. */
export function fitFont(
  text: string,
  maxWidth: number,
  maxLines: number,
  measureAt: (size: number) => (s: string) => number,
  max: number,
  min: number,
): { size: number; lines: string[] } {
  for (let size = max; size >= min; size -= 2) {
    const lines = wrapByWidth(text, maxWidth, measureAt(size));
    if (lines.length <= maxLines && lines.every((l) => measureAt(size)(l) <= maxWidth)) return { size, lines };
  }
  return { size: min, lines: wrapByWidth(text, maxWidth, measureAt(min), maxLines) };
}

// ---- Farbe -----------------------------------------------------------------------------------------------------------

export const INK = "#0F0F0E";
export const PAPER = "#FFFDF8";

/** Gültige Hex-Farbe (#RGB oder #RRGGBB), sonst null; Ergebnis immer als #RRGGBB in Grossbuchstaben. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

function luminance(hex: string): number {
  const n = normalizeHex(hex) ?? "#000000";
  const channel = (i: number) => {
    const c = parseInt(n.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Kontrastverhältnis nach WCAG (1 bis 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Textfarbe (Ink oder Papier) mit dem besseren Kontrast auf dem gegebenen Hintergrund. */
export function textColorFor(background: string): string {
  return contrastRatio(INK, background) >= contrastRatio(PAPER, background) ? INK : PAPER;
}

// ---- Browser ---------------------------------------------------------------------------------------------------------

export const CANVAS_FONT_FAMILY = "AlpernaGeist";
let fontsReady: Promise<void> | null = null;

/** Lädt die Geist-Schnitte für das Canvas (dieselben Dateien wie beim PDF). Scheitert das Laden, zeichnet das Canvas mit der Systemschrift. */
export function loadCanvasFonts(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  if (!fontsReady) {
    const faces: [string, string][] = [
      ["400", FONT_PATHS.body],
      ["500", FONT_PATHS.heading],
      ["600", FONT_PATHS.title],
    ];
    fontsReady = Promise.all(
      faces.map(async ([weight, url]) => {
        const face = new FontFace(CANVAS_FONT_FAMILY, `url(${url})`, { weight });
        await face.load();
        document.fonts.add(face);
      }),
    )
      .then(() => undefined)
      .catch(() => {
        fontsReady = null; // nächster Versuch darf neu laden
      });
  }
  return fontsReady;
}

export const IMAGE_LIMITS = { bytes: 15 * 1024 * 1024, side: 8000, types: ["image/png", "image/jpeg", "image/webp"] as readonly string[] } as const;

/** Meldung, wenn eine Datei als Bild nicht taugt (Art, Grösse); null, wenn sie passt. */
export function imageFileProblem(file: { type: string; size: number }): string | null {
  if (!IMAGE_LIMITS.types.includes(file.type)) return "Das ist kein Bild im Format PNG, JPG oder WebP.";
  if (file.size > IMAGE_LIMITS.bytes) return "Das Bild ist grösser als 15 MB.";
  return null;
}

export type LoadedImage = { source: CanvasImageSource; width: number; height: number; close: () => void };

/** Liest eine Bilddatei lokal (nichts wird hochgeladen) und berücksichtigt die Drehung aus den Bilddaten. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  const problem = imageFileProblem(file);
  if (problem) throw new Error(problem);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  if (bitmap.width > IMAGE_LIMITS.side || bitmap.height > IMAGE_LIMITS.side) {
    bitmap.close();
    throw new Error("Das Bild ist grösser als 8'000 Pixel an einer Seite.");
  }
  return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
}

/** Zeichnet ein Bild formatfüllend in ein Zielrechteck (siehe coverCrop). */
export function drawCover(ctx: CanvasRenderingContext2D, img: LoadedImage, dst: Rect, zoom = 1, panX = 0, panY = 0): void {
  const s = coverCrop(img.width, img.height, dst.w, dst.h, zoom, panX, panY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(dst.x, dst.y, dst.w, dst.h);
  ctx.clip();
  ctx.drawImage(img.source, s.x, s.y, s.w, s.h, dst.x, dst.y, dst.w, dst.h);
  ctx.restore();
}

/** PNG-Bytes eines Canvas. */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error("Das Bild konnte nicht erzeugt werden."));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

/** Stimmt der Anfang mit der PNG-Signatur überein? (für Tests) */
export const isPng = (bytes: Uint8Array): boolean => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
