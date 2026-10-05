import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { FOOTER_TEXT } from "@/lib/export/model";
import type { PdfFonts } from "@/lib/export/pdf";
import { A4, MM, SHEET, ausgabeText, layoutA4, svgFromModules, zipFilename, type QrCode } from "./logic";
import { qrModules, qrPng, qrSvg } from "./qr";

// Dateien des QR-Sets, nur im Browser (Canvas für PNG, pdf-lib, jszip). logic.ts importiert nichts von hier.
// Der Druckbogen zeichnet die Module als Rechtecke (Vektor), damit der Druck scharf bleibt.

export { qrModules, qrPng, qrSvg };

const COLOR = {
  ink: rgb(15 / 255, 15 / 255, 14 / 255),
  black: rgb(0, 0, 0),
  muted: rgb(101 / 255, 100 / 255, 95 / 255),
  line: rgb(222 / 255, 220 / 255, 213 / 255),
  mark: rgb(160 / 255, 158 / 255, 152 / 255),
};

/** Ersatz für Zeichen, die in der eingebetteten Schrift fehlen (wie in lib/export/pdf.ts); sonst «?». */
const REPLACEMENTS: Record<string, string> = { "→": "->", "←": "<-", "✓": "x", "✗": "x", "×": "x", "−": "-", "\u00a0": " ", "\u202f": " " };

function safeText(font: PDFFont, set: Set<number>, text: string): string {
  const known = (s: string) => [...s].every((c) => set.has(c.codePointAt(0)!));
  let out = "";
  for (const ch of text.replace(/[\r\n\t]/g, " ")) {
    if (known(ch)) out += ch;
    else {
      const rep = REPLACEMENTS[ch];
      out += rep && known(rep) ? rep : set.has(63) ? "?" : "";
    }
  }
  return out;
}

/** Kürzt einen Text mit «...», bis er in `width` Punkte passt. */
function fit(font: PDFFont, text: string, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function centered(page: PDFPage, text: string, font: PDFFont, size: number, centerX: number, y: number, color = COLOR.ink) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - w / 2, y, size, font, color });
}

/** Schnittmarken an den vier Ecken eines Felds: je zwei kurze Linien nach aussen, mit Abstand zur Ecke. */
function cropMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  const gap = 1 * MM;
  const len = 3 * MM;
  const corners = [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ] as const;
  for (const [cx, cy, dx, dy] of corners) {
    page.drawLine({ start: { x: cx + dx * gap, y: cy }, end: { x: cx + dx * (gap + len), y: cy }, thickness: 0.4, color: COLOR.mark });
    page.drawLine({ start: { x: cx, y: cy + dy * gap }, end: { x: cx, y: cy + dy * (gap + len) }, thickness: 0.4, color: COLOR.mark });
  }
}

/** Zeichnet die Module eines Codes als Rechtecke in ein Quadrat der Kantenlänge `size` (die Ruhezone liegt ausserhalb). */
function drawQr(page: PDFPage, modules: boolean[][], x: number, y: number, size: number) {
  const n = modules.length;
  if (n === 0) return;
  const m = size / n;
  for (let r = 0; r < n; r++) {
    const row = modules[r];
    let c = 0;
    while (c < n) {
      if (!row[c]) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < n && row[c + run]) run++;
      // Zusammenhängende Module als ein Rechteck, leicht überlappend, damit keine hellen Haarlinien entstehen.
      page.drawRectangle({ x: x + c * m, y: y + size - (r + 1) * m, width: run * m + 0.05, height: m + 0.05, color: COLOR.black });
      c += run;
    }
  }
}

export type SheetInput = {
  codes: QrCode[];
  firma?: string;
  /** Datum im Kopf, bereits formatiert (dateCH). */
  datum?: string;
  fonts: PdfFonts;
};

/** Druckbogen A4 hoch: bis sechs Codes im Raster 2 × 3, je Code 50 mm, Beschriftung und Adresse darunter, Firma im Kopf, Schnittmarken. */
export async function buildSheetPdf({ codes, firma, datum, fonts }: SheetInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const title = "QR-Set für Flyer und Aufkleber";
  doc.setTitle(title);
  doc.setAuthor(firma?.trim() || "Alperna");
  doc.setCreator("tools.alperna.ch");
  doc.setProducer("tools.alperna.ch");
  doc.setLanguage("de-CH");

  const body = await doc.embedFont(fonts.body, { subset: true });
  const medium = await doc.embedFont(fonts.bodyMedium, { subset: true });
  const sets = new Map<PDFFont, Set<number>>([
    [body, new Set(body.getCharacterSet())],
    [medium, new Set(medium.getCharacterSet())],
  ]);
  const safe = (font: PDFFont, text: string) => safeText(font, sets.get(font)!, text);

  const page = doc.addPage([A4.w, A4.h]);
  const margin = (A4.w - SHEET.cols * SHEET.cellW) / 2;

  // Kopf: Firma links, Datum rechts, Linie darunter. Fuss: Hinweis links.
  const top = A4.h - 40;
  const datumText = datum ? safe(body, datum) : "";
  const datumW = datumText ? body.widthOfTextAtSize(datumText, 9) + 16 : 0;
  const head = fit(medium, safe(medium, firma?.trim() || "Alperna"), 9, A4.w - 2 * margin - datumW);
  page.drawText(head, { x: margin, y: top, size: 9, font: medium, color: COLOR.muted });
  if (datumText) page.drawText(datumText, { x: A4.w - margin - body.widthOfTextAtSize(datumText, 9), y: top, size: 9, font: body, color: COLOR.muted });
  page.drawLine({ start: { x: margin, y: top - 8 }, end: { x: A4.w - margin, y: top - 8 }, thickness: 0.6, color: COLOR.line });
  page.drawText(safe(body, FOOTER_TEXT), { x: margin, y: 30, size: 8.5, font: body, color: COLOR.muted });

  const cells = layoutA4(codes.length);
  const textWidth = SHEET.cellW - 8 * MM;
  cells.forEach((cell, i) => {
    const code = codes[i];
    cropMarks(page, cell.x, cell.y, cell.w, cell.h);
    drawQr(page, qrModules(code.url), cell.qr.x, cell.qr.y, cell.qr.size);
    centered(page, fit(medium, safe(medium, code.label), 11, textWidth), medium, 11, cell.centerX, cell.labelY);
    centered(page, fit(body, safe(body, code.display), 8, textWidth), body, 8, cell.centerX, cell.urlY, COLOR.muted);
  });

  return doc.save();
}

/** ZIP mit je einer SVG- und einer PNG-Datei (1024 px) pro Code und einer Liste der Ziele. */
export async function buildZip(codes: QrCode[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const code of codes) {
    zip.file(zipFilename(code.nr, code.label, "svg"), svgFromModules(qrModules(code.url)));
    zip.file(zipFilename(code.nr, code.label, "png"), await qrPng(code.url, 1024));
  }
  zip.file("ziele.txt", `${ausgabeText(codes)}\n`);
  return zip.generateAsync({ type: "uint8array" });
}
