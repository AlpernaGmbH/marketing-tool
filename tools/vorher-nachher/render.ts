import { CANVAS_FONT_FAMILY, INK, PAPER, canvasToPng, drawCover, loadCanvasFonts, textColorFor, wrapByWidth, type LoadedImage, type Rect } from "@/lib/export/png";
import { cropArgs, formatOf, labelsFor, layoutFor, type Crop, type FormatKey, type Settings } from "./logic";

// Zeichnen der Collage, nur im Browser (Canvas, jszip). logic.ts importiert nichts von hier; die Rechenarbeit (Rechtecke, Pillen,
// Logo-Platte) steht dort und ist ohne DOM getestet. Alle Masse hier sind Format-Pixel; die Vorschau skaliert den Kontext.
// Die Bilder bleiben im Browser (Harte Regel 1).

const MUTED = "#65645F";
const FLAECHE = ["#EAE7E0", "#E0DDD5"] as const; // graue Fläche, solange ein Bild fehlt
const HAARLINIE = "rgba(15, 15, 14, 0.2)";
const LOGO_PLATTE = "rgba(255, 253, 248, 0.82)";

/** Schrift der Pillen und Hinweise: Geist 500 (lib/export/png.ts lädt sie), sonst die Systemschrift. */
const fontOf = (px: number) => `500 ${px}px ${CANVAS_FONT_FAMILY}, Geist, system-ui, sans-serif`;

type Size = { width: number; height: number };

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Zeichnet ein Bild mit seinem Zuschnitt in das Zielrechteck; fehlt es, eine graue Fläche mit Hinweis im sichtbaren Bereich. */
function drawSlot(
  ctx: CanvasRenderingContext2D,
  img: LoadedImage | null,
  ziel: Rect,
  crop: Crop,
  bereich: Rect,
  hinweis: string,
  index: 0 | 1,
  breite: number,
): void {
  if (img) {
    const a = cropArgs(crop);
    drawCover(ctx, img, ziel, a.zoom, a.panX, a.panY);
    return;
  }
  ctx.fillStyle = FLAECHE[index];
  ctx.fillRect(ziel.x, ziel.y, ziel.w, ziel.h);
  const size = breite * 0.028;
  ctx.font = fontOf(size);
  ctx.fillStyle = MUTED;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapByWidth(hinweis, bereich.w * 0.8, (t) => ctx.measureText(t).width);
  const top = bereich.y + bereich.h / 2 - ((lines.length - 1) * size * 1.3) / 2;
  lines.forEach((line, i) => ctx.fillText(line, bereich.x + bereich.w / 2, top + i * size * 1.3));
}

/**
 * Zeichnet die Collage in einen Kontext der Grösse format (Format-Pixel). Fehlende Bilder (nur in der Vorschau) werden als graue
 * Flächen gezeichnet. Das Logo erscheint nur, wenn eines übergeben wird.
 */
export function drawCollage(
  ctx: CanvasRenderingContext2D,
  settings: Settings,
  format: Size,
  vorher: LoadedImage | null,
  nachher: LoadedImage | null,
  logo: LoadedImage | null,
): void {
  const { width: w, height: h } = format;
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const L = layoutFor(settings.layout, w, h, settings.position, {
    texte: labelsFor(settings.beschriftung, settings.worte),
    breite: (text, px) => {
      ctx.font = fontOf(px);
      return ctx.measureText(text).width;
    },
    logo: logo ? { aspect: logo.width / logo.height, ecke: settings.ecke, prozent: settings.logoGroesse } : null,
  });

  const zeichneVorher = () => drawSlot(ctx, vorher, L.vorher, settings.zuschnitt.vorher, L.bereiche[0], "Vorher-Bild wählen", 0, w);
  const zeichneNachher = () => drawSlot(ctx, nachher, L.nachher, settings.zuschnitt.nachher, L.bereiche[1], "Nachher-Bild wählen", 1, w);

  if (L.clip) {
    // Schieber: erst das Nachher-Bild über die ganze Fläche, darüber das Vorher-Bild bis zur Trennlinie.
    zeichneNachher();
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.clip.x, L.clip.y, L.clip.w, L.clip.h);
    ctx.clip();
    zeichneVorher();
    ctx.restore();
  } else {
    zeichneVorher();
    zeichneNachher();
  }

  if (L.linie) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(L.linie.x, L.linie.y, L.linie.w, L.linie.h);
  }
  if (L.griff) {
    const { cx, cy, r } = L.griff;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.strokeStyle = HAARLINIE;
    ctx.lineWidth = Math.max(1, w * 0.0015);
    ctx.stroke();
    ctx.fillStyle = INK;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * r * 0.62, cy);
      ctx.lineTo(cx + dir * r * 0.22, cy - r * 0.28);
      ctx.lineTo(cx + dir * r * 0.22, cy + r * 0.28);
      ctx.closePath();
      ctx.fill();
    }
  }

  for (const p of L.pillen) {
    // Vorher: Ink-Fläche mit Papier-Text; Nachher: Papier-Fläche mit Ink-Text (textColorFor wählt den besseren Kontrast).
    const grund = p.index === 0 ? INK : PAPER;
    roundedRect(ctx, p.rect.x, p.rect.y, p.rect.w, p.rect.h, p.rect.h / 2);
    ctx.fillStyle = grund;
    ctx.fill();
    if (p.index === 1) {
      ctx.strokeStyle = HAARLINIE;
      ctx.lineWidth = Math.max(1, w * 0.0015);
      ctx.stroke();
    }
    ctx.fillStyle = textColorFor(grund);
    ctx.font = fontOf(p.schrift);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.text, p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h / 2);
  }

  if (L.logo && logo) {
    const { platte, logo: ziel, radius } = L.logo;
    roundedRect(ctx, platte.x, platte.y, platte.w, platte.h, radius);
    ctx.fillStyle = LOGO_PLATTE;
    ctx.fill();
    ctx.drawImage(logo.source, 0, 0, logo.width, logo.height, ziel.x, ziel.y, ziel.w, ziel.h);
  }
  ctx.restore();
}

/** Breite der Vorschau in Pixeln (höchstens); das Canvas hat das Seitenverhältnis des Formats. */
export const PREVIEW_WIDTH = 720;
export const THUMB_WIDTH = 360;

/** Zeichnet die Collage verkleinert in ein vorhandenes Canvas (Vorschau und Ergebnis-Miniaturen). */
export function drawPreview(
  canvas: HTMLCanvasElement,
  settings: Settings,
  key: FormatKey,
  vorher: LoadedImage | null,
  nachher: LoadedImage | null,
  logo: LoadedImage | null,
  maxWidth: number = PREVIEW_WIDTH,
): void {
  const f = formatOf(key);
  const k = Math.min(1, maxWidth / f.width);
  const cw = Math.round(f.width * k);
  const ch = Math.round(f.height * k);
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.scale(cw / f.width, ch / f.height);
  drawCollage(ctx, settings, f, vorher, nachher, logo);
}

/** Collage in voller Grösse des Formats als Canvas (die Schrift wird vorher geladen). */
export async function renderFormat(
  settings: Settings,
  key: FormatKey,
  vorher: LoadedImage | null,
  nachher: LoadedImage | null,
  logo: LoadedImage | null,
): Promise<HTMLCanvasElement> {
  await loadCanvasFonts();
  const f = formatOf(key);
  const canvas = document.createElement("canvas");
  canvas.width = f.width;
  canvas.height = f.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Das Bild konnte nicht erzeugt werden.");
  drawCollage(ctx, settings, f, vorher, nachher, logo);
  return canvas;
}

/** PNG-Bytes einer Collage in voller Grösse. */
export async function renderPng(
  settings: Settings,
  key: FormatKey,
  vorher: LoadedImage | null,
  nachher: LoadedImage | null,
  logo: LoadedImage | null,
): Promise<Uint8Array> {
  return canvasToPng(await renderFormat(settings, key, vorher, nachher, logo));
}

/** ZIP mit den PNG-Dateien. jszip lädt erst hier. */
export async function buildZip(files: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.bytes);
  return zip.generateAsync({ type: "uint8array" });
}
