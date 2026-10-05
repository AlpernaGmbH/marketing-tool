import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import * as QRCode from "qrcode";
import { FOOTER_TEXT } from "@/lib/export/model";
import type { PdfFonts } from "@/lib/export/pdf";
import { wrapLines } from "@/lib/export/pdf";
import { BUTTON_LABEL, cellContent, stickerLayout } from "./logic";

// Dateien des WhatsApp-Links: QR-Code als PNG und SVG (Bibliothek qrcode) und der Aufkleber-Bogen (pdf-lib).
// Lädt erst beim Klick (dynamischer Import in Tool.tsx). logic.ts importiert diese Datei nicht.

const DARK = "#0F0F0E";
const LIGHT = "#FFFFFF";
/** Rand in Modulen, hell, damit Scanner den Code finden. */
const MARGIN = 2;

export function qrDataUrl(text: string, size: number): Promise<string> {
  return QRCode.toDataURL(text, { width: size, margin: MARGIN, errorCorrectionLevel: "M", color: { dark: DARK, light: LIGHT } });
}

/** PNG-Bytes aus der Data-URL des QR-Codes. */
export function bytesFromDataUrl(url: string): Uint8Array {
  const comma = url.indexOf(",");
  const b64 = comma >= 0 ? url.slice(comma + 1) : url;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function qrPng(text: string, size: number): Promise<Uint8Array> {
  return bytesFromDataUrl(await qrDataUrl(text, size));
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: MARGIN, errorCorrectionLevel: "M", color: { dark: DARK, light: LIGHT } });
}

export type StickerInput = {
  firma?: string;
  /** «079 123 45 67» */
  display: string;
  /** «+41 79 123 45 67» */
  displayInternational: string;
  /** Der QR-Code als PNG (qrPng). */
  qr: Uint8Array;
  fonts: PdfFonts;
};

const INK = rgb(15 / 255, 15 / 255, 14 / 255);
const MUTED = rgb(101 / 255, 100 / 255, 95 / 255);
const LINE = rgb(222 / 255, 220 / 255, 213 / 255);

/** Zeichen, die die eingebettete Schrift nicht kennt, werden ersetzt statt als Kästchen gedruckt. */
function safe(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) out += set.has(ch.codePointAt(0)!) ? ch : set.has(63) ? "?" : "";
  return out;
}

/** Kürzt eine Zeile auf die Breite, mit «…» am Ende. */
function fit(font: PDFFont, text: string, size: number, width: number): string {
  let t = safe(font, text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

/** A4 hoch mit vier A7-Aufklebern (zwei Spalten, zwei Reihen) und Schnittmarken. */
export async function buildStickerPdf(input: StickerInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle("WhatsApp-Aufkleber");
  doc.setAuthor(input.firma?.trim() || "Alperna");
  doc.setCreator("tools.alperna.ch");
  doc.setProducer("tools.alperna.ch");
  doc.setLanguage("de-CH");

  const title = await doc.embedFont(input.fonts.title, { subset: true });
  const medium = await doc.embedFont(input.fonts.bodyMedium, { subset: true });
  const body = await doc.embedFont(input.fonts.body, { subset: true });
  const qr = await doc.embedPng(input.qr);

  const layout = stickerLayout();
  const page = doc.addPage([layout.page.w, layout.page.h]);

  for (const m of layout.marks) {
    page.drawLine({ start: { x: m.x1, y: m.y1 }, end: { x: m.x2, y: m.y2 }, thickness: 0.5, color: INK });
  }

  const centered = (text: string, font: PDFFont, size: number, cx: number, y: number, color = INK) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: cx - w / 2, y, size, font, color });
  };

  const firma = input.firma?.trim() ?? "";
  for (const cell of layout.cells) {
    const c = cellContent(cell);
    const cx = cell.x + cell.w / 2;
    page.drawRectangle({ x: cell.x, y: cell.y, width: cell.w, height: cell.h, borderWidth: 0.4, borderColor: LINE });

    if (firma) centered(fit(medium, firma, c.firma.size, c.textW), medium, c.firma.size, cx, c.firma.y);

    const lines = wrapLines(safe(title, BUTTON_LABEL), title, c.satz.size, c.textW).slice(0, 2);
    lines.forEach((l, i) => centered(l, title, c.satz.size, cx, c.satz.y - i * (c.satz.size + 3)));

    page.drawImage(qr, { x: c.qr.x, y: c.qr.y, width: c.qr.w, height: c.qr.h });

    centered(fit(medium, input.display, c.nummer.size, c.textW), medium, c.nummer.size, cx, c.nummer.y);
    centered(fit(body, input.displayInternational, c.nummerIntl.size, c.textW), body, c.nummerIntl.size, cx, c.nummerIntl.y, MUTED);
    centered(fit(body, FOOTER_TEXT, c.fuss.size, c.textW), body, c.fuss.size, cx, c.fuss.y, MUTED);
  }

  return doc.save();
}
