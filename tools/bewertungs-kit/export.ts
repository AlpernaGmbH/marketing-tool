import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { FOOTER_TEXT } from "@/lib/export/model";
import { wrapLines, type PdfFonts } from "@/lib/export/pdf";
import { DRUCK, INK, PAPER, parseHex, standLayout, stickerLayout, type Anrede, type Box, type StandSize } from "./logic";

// Zeichnen für das Bewertungs-Kit: QR-Code als PNG (Browser) und als Module im PDF (pdf-lib, läuft auch unter Node).
// logic.ts kennt nur Masse und Texte; hier entstehen die Dateien.

export type KitInput = { firma: string; link: string; anrede: Anrede; farbe: string };

const color = (hex: string, fallback = INK): RGB => {
  const [r, g, b] = parseHex(hex) ?? (parseHex(fallback) as [number, number, number]);
  return rgb(r / 255, g / 255, b / 255);
};
const C = { ink: color(INK), paper: color(PAPER), muted: rgb(101 / 255, 100 / 255, 95 / 255), line: rgb(0.78, 0.77, 0.75) };

/** Fehlerkorrektur M: reicht für sauberen Druck und hält den Code bei langen Links lesbar. */
const QR_LEVEL = "M";

/** QR-Code als Daten-URL für das Bild am Bildschirm. */
export function qrDataUrl(link: string, px = 480): Promise<string> {
  return QRCode.toDataURL(link, { errorCorrectionLevel: QR_LEVEL, width: px, margin: 2, color: { dark: INK, light: "#FFFFFF" } });
}

/** QR-Code als PNG-Bytes (1024 px) für den Download. */
export async function qrPng(link: string, px = 1024): Promise<Uint8Array> {
  const url = await qrDataUrl(link, px);
  const base64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Zeichnet die Module des QR-Codes als Rechtecke in `box` (mit zwei Modulen Ruhezone), immer in Tinte auf Weiss. */
export function drawQr(page: PDFPage, link: string, box: Box): void {
  const m = QRCode.create(link, { errorCorrectionLevel: QR_LEVEL }).modules;
  const quiet = 2;
  const n = m.size + 2 * quiet;
  const cell = box.w / n;
  page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, color: rgb(1, 1, 1) });
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.get(r, c)) continue;
      page.drawRectangle({
        x: box.x + (quiet + c) * cell,
        y: box.y + box.h - (quiet + r + 1) * cell,
        width: cell + 0.15, // winzige Überlappung gegen weisse Haarlinien zwischen Modulen
        height: cell + 0.15,
        color: C.ink,
      });
    }
  }
}

class Pen {
  private sets = new Map<PDFFont, Set<number>>();
  constructor(
    readonly title: PDFFont,
    readonly heading: PDFFont,
    readonly body: PDFFont,
  ) {
    for (const f of [title, heading, body]) this.sets.set(f, new Set(f.getCharacterSet()));
  }
  /** Nur Zeichen, die die Schrift kennt; fremde werden zu «?». */
  safe(font: PDFFont, text: string): string {
    const set = this.sets.get(font)!;
    return [...text.replace(/\s+/g, " ")].map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?")).join("");
  }
  /** Schriftgrösse, mit der `text` in `width` passt (mindestens `min`). */
  fit(font: PDFFont, text: string, size: number, width: number, min: number): number {
    let s = size;
    while (s > min && font.widthOfTextAtSize(text, s) > width) s -= 0.5;
    return s;
  }
  /** Zentrierte Zeilen ab `top` (Abstand zur oberen Kante); gibt die nächste freie Oberkante zurück. */
  centered(page: PDFPage, text: string, font: PDFFont, size: number, top: number, width: number, col: RGB, maxLines = 3): number {
    const safe = this.safe(font, text);
    const lines = wrapLines(safe, font, size, width).slice(0, maxLines);
    const lh = size * 1.25;
    let y = page.getHeight() - top - size;
    for (const l of lines) {
      const w = font.widthOfTextAtSize(l, size);
      page.drawText(l, { x: (page.getWidth() - w) / 2, y, size, font, color: col });
      y -= lh;
    }
    return page.getHeight() - y - lh + size;
  }
}

async function open(fonts: PdfFonts, title: string, firma: string): Promise<{ doc: PDFDocument; pen: Pen }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setAuthor(firma.trim() || "Alperna");
  doc.setCreator("tools.alperna.ch");
  doc.setProducer("tools.alperna.ch");
  doc.setLanguage("de-CH");
  const pen = new Pen(
    await doc.embedFont(fonts.title, { subset: true }),
    await doc.embedFont(fonts.heading, { subset: true }),
    await doc.embedFont(fonts.body, { subset: true }),
  );
  return { doc, pen };
}

function footer(page: PDFPage, pen: Pen, size: number, y: number): void {
  const text = pen.safe(pen.body, FOOTER_TEXT);
  const w = pen.body.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - w) / 2, y, size, font: pen.body, color: C.muted });
}

/**
 * Tischaufsteller als PDF mit zwei Seiten (zwei Layouts) in A6 oder A5, hoch.
 * Seite 1: «Wie war es bei uns?», Satz mit der Firma, QR gross, Firma im Fuss.
 * Seite 2: ruhige Variante mit Firma oben, QR und «Danke für deine/Ihre Bewertung».
 */
export async function buildStandPdf(size: StandSize, input: KitInput, fonts: PdfFonts): Promise<Uint8Array> {
  const l = standLayout(size);
  const accent = color(input.farbe);
  const firma = input.firma.trim();
  const { doc, pen } = await open(fonts, `Aufsteller ${size.toUpperCase()}: ${firma}`, firma);
  const inner = l.frame.w - 2 * l.pad;

  const frame = (page: PDFPage) => {
    page.drawRectangle({ x: 0, y: 0, width: l.page.w, height: l.page.h, color: C.paper });
    page.drawRectangle({ x: l.frame.x, y: l.frame.y, width: l.frame.w, height: l.frame.h, borderColor: accent, borderWidth: l.stroke });
  };

  // Layout 1
  const p1 = doc.addPage([l.page.w, l.page.h]);
  frame(p1);
  const titleSize = pen.fit(pen.title, DRUCK.titel, l.title, inner, l.title * 0.6);
  let top = pen.centered(p1, DRUCK.titel, pen.title, titleSize, l.titleTop, inner, accent, 2);
  top = Math.max(top + l.text * 0.6, l.textTop);
  pen.centered(p1, DRUCK.satz(firma, input.anrede), pen.body, l.text, top, inner, C.ink, 2);
  drawQr(p1, input.link, l.qr);
  pen.centered(p1, DRUCK.scan, pen.body, l.small, l.page.h - l.qr.y + l.small * 0.8, inner, C.muted, 1);
  const f1 = pen.fit(pen.heading, firma, l.text, inner, l.small);
  const firmaY = l.footTop - l.footer * 2.2;
  pen.centered(p1, firma, pen.heading, f1, firmaY - f1, inner, C.ink, 1);
  footer(p1, pen, l.footer, l.page.h - l.footTop);

  // Layout 2
  const p2 = doc.addPage([l.page.w, l.page.h]);
  frame(p2);
  const f2 = pen.fit(pen.heading, firma, l.title * 0.8, inner, l.text);
  const t2 = pen.centered(p2, firma, pen.heading, f2, l.titleTop, inner, accent, 2);
  pen.centered(p2, DRUCK.google, pen.body, l.small, t2 + l.small * 0.4, inner, C.muted, 1);
  drawQr(p2, input.link, l.qr2);
  const below = l.page.h - l.qr2.y + l.text * 0.9;
  const d = pen.centered(p2, DRUCK.danke(input.anrede), pen.heading, l.text * 1.15, below, inner, C.ink, 2);
  pen.centered(p2, DRUCK.scan, pen.body, l.small, d + l.small * 0.4, inner, C.muted, 1);
  footer(p2, pen, l.footer, l.page.h - l.footTop);

  return doc.save();
}

/** Aufkleber-Bogen A4: 8 Aufkleber 50 × 50 mm mit QR-Code, Satz und Schnittmarken. */
export async function buildStickerSheetPdf(input: KitInput, fonts: PdfFonts): Promise<Uint8Array> {
  const l = stickerLayout();
  const accent = color(input.farbe);
  const firma = input.firma.trim();
  const { doc, pen } = await open(fonts, `Aufkleber-Bogen: ${firma}`, firma);
  const page = doc.addPage([l.page.w, l.page.h]);
  page.drawRectangle({ x: 0, y: 0, width: l.page.w, height: l.page.h, color: rgb(1, 1, 1) });

  const text = pen.safe(pen.heading, DRUCK.aufkleber(input.anrede));
  const textW = l.cell - 2 * l.pad;
  const textSize = pen.fit(pen.heading, text, l.text, textW, 6);
  const mark = (x: number, y: number, dx: number, dy: number) =>
    page.drawLine({ start: { x, y }, end: { x: x + dx, y: y + dy }, thickness: 0.4, color: C.line });

  for (const c of l.cells) {
    // Haarlinie als Schneidekante und Schnittmarken an den vier Ecken, ausserhalb der Fläche
    page.drawRectangle({ x: c.x, y: c.y, width: c.w, height: c.h, borderColor: C.line, borderWidth: 0.4 });
    for (const [cx, sx] of [
      [c.x, -1],
      [c.x + c.w, 1],
    ] as const) {
      for (const [cy, sy] of [
        [c.y, -1],
        [c.y + c.h, 1],
      ] as const) {
        mark(cx + sx * 1.5, cy, sx * l.mark, 0);
        mark(cx, cy + sy * 1.5, 0, sy * l.mark);
      }
    }
    // Innenrahmen in der Akzentfarbe
    page.drawRectangle({ x: c.x + l.pad * 0.5, y: c.y + l.pad * 0.5, width: c.w - l.pad, height: c.h - l.pad, borderColor: accent, borderWidth: 1 });
    drawQr(page, input.link, { x: c.x + (c.w - l.qr) / 2, y: c.y + c.h - l.pad - l.qr, w: l.qr, h: l.qr });
    const w = pen.heading.widthOfTextAtSize(text, textSize);
    page.drawText(text, { x: c.x + (c.w - w) / 2, y: c.y + l.pad + 1, size: textSize, font: pen.heading, color: accent });
  }

  const bottom = l.cells[l.cells.length - 1].y;
  const note = pen.safe(pen.body, firma ? `${firma} · 8 Aufkleber 50 × 50 mm, an den Haarlinien schneiden` : "8 Aufkleber 50 × 50 mm, an den Haarlinien schneiden");
  const noteSize = pen.fit(pen.body, note, l.footer, l.page.w - 2 * l.cells[0].x, 5);
  const nw = pen.body.widthOfTextAtSize(note, noteSize);
  page.drawText(note, { x: (l.page.w - nw) / 2, y: bottom - l.footer * 3, size: noteSize, font: pen.body, color: C.muted });
  footer(page, pen, l.footer, bottom - l.footer * 4.6);
  return doc.save();
}
