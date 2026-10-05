import { CANVAS_FONT_FAMILY, canvasToPng, imageFormat, loadCanvasFonts, type ImageFormat, type ImageFormatKey, type LoadedImage, type Rect } from "@/lib/export/png";
import { colorOf, fitIntoBox, layoutFor, presenceOf, type Box, type FontSpec, type OfferModel, type TextKey } from "./logic";

// Zeichnen der Angebotsgrafik (Canvas, nur im Browser). Alles, was sich ohne Canvas rechnen lässt, steht in logic.ts (layoutFor,
// fitIntoBox). Hier: ein Kontext in, Pixel raus. Nichts verlässt den Browser; das Logo bleibt eine lokale Bilddatei.

type Ctx2D = CanvasRenderingContext2D;
type Size = Pick<ImageFormat, "width" | "height">;

const fontString = (weight: number, size: number) => `${weight} ${size}px ${CANVAS_FONT_FAMILY}, "Geist", system-ui, sans-serif`;
/** Mittelpunkt der Versalhöhe über der Grundlinie, als Anteil der Schriftgrösse (Geist: Versalhöhe rund 0,71). */
const CAP_HALF = 0.355;

function measurer(ctx: Ctx2D, weight: number): (size: number) => (s: string) => number {
  return (size) => (s) => {
    ctx.font = fontString(weight, size);
    return ctx.measureText(s).width;
  };
}

/** Rechteck mit runden Ecken als Pfad (ohne roundRect, das ältere Browser nicht kennen). */
function roundedPath(ctx: Ctx2D, r: Rect, radius: number): void {
  const rr = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.lineTo(r.x + r.w - rr, r.y);
  ctx.arc(r.x + r.w - rr, r.y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(r.x + r.w, r.y + r.h - rr);
  ctx.arc(r.x + r.w - rr, r.y + r.h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(r.x + rr, r.y + r.h);
  ctx.arc(r.x + rr, r.y + r.h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(r.x, r.y + rr);
  ctx.arc(r.x + rr, r.y + rr, rr, Math.PI, (3 * Math.PI) / 2);
  ctx.closePath();
}

export type DrawnText = { text: string; x: number; y: number; size: number; width: number; align: CanvasTextAlign };

/** Schreibt einen Text in sein Rechteck: grösste passende Schrift, Zeilen nach valign. Gibt zurück, was gezeichnet wurde. */
function drawBlock(ctx: Ctx2D, text: string, b: Box, spec: FontSpec, color: string, strike = false): DrawnText[] {
  const measureAt = measurer(ctx, spec.weight);
  const fit = fitIntoBox(text, b.w, b.h, spec, measureAt);
  const lineH = fit.size * spec.lh;
  const blockH = fit.lines.length * lineH;
  const top = b.valign === "top" ? b.y : b.valign === "bottom" ? b.y + b.h - blockH : b.y + (b.h - blockH) / 2;
  const x = b.align === "left" ? b.x : b.align === "center" ? b.x + b.w / 2 : b.x + b.w;
  const measure = measureAt(fit.size);
  const out: DrawnText[] = [];
  ctx.fillStyle = color;
  ctx.textAlign = b.align;
  ctx.textBaseline = "alphabetic";
  fit.lines.forEach((line, i) => {
    const y = top + i * lineH + lineH / 2 + fit.size * CAP_HALF;
    ctx.font = fontString(spec.weight, fit.size);
    ctx.fillText(line, x, y);
    const width = measure(line);
    if (strike) {
      const x0 = b.align === "left" ? x : b.align === "center" ? x - width / 2 : x - width;
      const t = Math.max(2, Math.round(fit.size * 0.07));
      ctx.fillRect(x0, Math.round(y - fit.size * 0.3), width, t);
    }
    out.push({ text: line, x, y, size: fit.size, width, align: b.align });
  });
  return out;
}

/** Aufforderung als Knopf: so breit wie der Text mit Rand, höchstens so breit wie das Rechteck. */
function drawCta(ctx: Ctx2D, text: string, b: Box, spec: FontSpec, fill: string | null, color: string): DrawnText[] {
  const padX = Math.round(b.h * 0.5);
  const measureAt = measurer(ctx, spec.weight);
  const fit = fitIntoBox(text, b.w - 2 * padX, Math.round(b.h * 0.7), { ...spec, lines: 1 }, measureAt);
  const line = fit.lines[0] ?? "";
  const textW = measureAt(fit.size)(line);
  const pillW = Math.min(b.w, Math.round(textW + 2 * padX));
  const x = b.align === "left" ? b.x : b.align === "center" ? b.x + Math.round((b.w - pillW) / 2) : b.x + b.w - pillW;
  if (fill) {
    ctx.fillStyle = fill;
    roundedPath(ctx, { x, y: b.y, w: pillW, h: b.h }, b.h / 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = fontString(spec.weight, fit.size);
  const cx = x + pillW / 2;
  const y = b.y + b.h / 2 + fit.size * CAP_HALF;
  ctx.fillText(line, cx, y);
  return [{ text: line, x: cx, y, size: fit.size, width: textW, align: "center" }];
}

/** Zeichnet die Grafik in einen Kontext der Formatgrösse. Gibt die gezeichneten Textzeilen zurück (für Tests). */
export function drawOffer(ctx: Ctx2D, model: OfferModel, format: Size, logo: LoadedImage | null): DrawnText[] {
  const layout = layoutFor(model.vorlage, format.width, format.height, presenceOf(model, logo !== null));
  const pal = model.palette;
  const col = (role: Parameters<typeof colorOf>[1]) => colorOf(pal, role);
  const drawn: DrawnText[] = [];

  ctx.save();
  ctx.fillStyle = col(layout.background);
  ctx.fillRect(0, 0, layout.width, layout.height);

  for (const d of layout.dekor) {
    if (d.kind === "rect") {
      ctx.fillStyle = col(d.fill);
      if (d.radius) {
        roundedPath(ctx, d.rect, d.radius);
        ctx.fill();
      } else ctx.fillRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
    } else {
      ctx.beginPath();
      ctx.arc(d.cx, d.cy, Math.max(1, d.r - d.stroke / 2), 0, Math.PI * 2);
      ctx.lineWidth = d.stroke;
      ctx.strokeStyle = col(d.color);
      ctx.stroke();
    }
  }

  const text = (key: TextKey, value: string | null, strike = false) => {
    const b = layout.boxes[key];
    if (!b || !value) return;
    drawn.push(...(key === "aufforderung" ? drawCta(ctx, value, b, layout.fonts[key], b.fill ? col(b.fill) : null, col(b.color)) : drawBlock(ctx, value, b, layout.fonts[key], col(b.color), strike)));
  };

  const lb = layout.boxes.logo;
  if (lb && logo) {
    const s = Math.min(lb.w / logo.width, lb.h / logo.height);
    const dw = Math.max(1, Math.round(logo.width * s));
    const dh = Math.max(1, Math.round(logo.height * s));
    const y = lb.y + Math.round((lb.h - dh) / 2);
    if (layout.logoPlate) {
      const pad = Math.round(layout.width * 0.014);
      ctx.fillStyle = col("paper");
      roundedPath(ctx, { x: lb.x - pad, y: y - pad, w: dw + 2 * pad, h: dh + 2 * pad }, pad * 1.5);
      ctx.fill();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logo.source, lb.x, y, dw, dh);
  }

  text("firma", model.firma);
  text("titel", model.titel);
  text("angebot", model.angebot);
  text("frueher", model.frueher, true);
  text("preis", model.preis);
  text("gueltig", model.gueltig);
  text("aufforderung", model.aufforderung);
  text("kontakt", model.kontakt);
  ctx.restore();
  return drawn;
}

/** Zeichnet in ein bestehendes Canvas (Vorschau): setzt die Grösse des Formats und zeichnet neu. */
export function paintCanvas(canvas: HTMLCanvasElement, model: OfferModel, format: Size, logo: LoadedImage | null): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  if (canvas.width !== format.width) canvas.width = format.width;
  if (canvas.height !== format.height) canvas.height = format.height;
  drawOffer(ctx, model, format, logo);
  return true;
}

/** PNG-Bytes eines Formats. Wartet auf die Schriften, bevor es zeichnet. */
export async function renderFormat(model: OfferModel, key: ImageFormatKey, logo: LoadedImage | null): Promise<Uint8Array> {
  await loadCanvasFonts();
  const format = imageFormat(key);
  const canvas = document.createElement("canvas");
  if (!paintCanvas(canvas, model, format, logo)) throw new Error("Das Bild konnte nicht erzeugt werden.");
  return canvasToPng(canvas);
}

/** ZIP mit allen Dateien. JSZip lädt erst hier. */
export async function buildZip(files: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.bytes);
  return zip.generateAsync({ type: "uint8array" });
}
