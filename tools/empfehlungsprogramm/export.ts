import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { FOOTER_TEXT } from "@/lib/export/model";
import { wrapLines, type PdfFonts } from "@/lib/export/pdf";
import { drawQr } from "@/tools/bewertungs-kit/export";
import { PAGES, mm } from "@/tools/bewertungs-kit/logic";
import type { KartenInhalt } from "./logic";

// Die Karte A6 als PDF (pdf-lib, läuft im Browser und unter Node). Den QR-Code zeichnet drawQr aus dem Bewertungs-Kit als
// Vektor; das Bild am Bildschirm (qrDataUrl) und die PNG-Datei (qrPng) kommen von dort. logic.ts importiert diese Datei nicht.
export { qrDataUrl, qrPng } from "@/tools/bewertungs-kit/export";

const C: Record<"ink" | "paper" | "muted", RGB> = {
  ink: rgb(15 / 255, 15 / 255, 14 / 255),
  paper: rgb(1, 253 / 255, 248 / 255),
  muted: rgb(101 / 255, 100 / 255, 95 / 255),
};

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
  /** Zeilen von höchstens `width` Punkten, mit «...» am Ende, wenn mehr als `maxLines` nötig wären. */
  lines(font: PDFFont, text: string, size: number, width: number, maxLines: number): string[] {
    const all = wrapLines(this.safe(font, text), font, size, width);
    if (all.length <= maxLines) return all;
    const kept = all.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, size) > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}...`;
    return kept;
  }
  /** Zentrierte Zeilen ab `top` (Abstand zur oberen Kante); gibt die Oberkante unter dem Text zurück. */
  centered(page: PDFPage, text: string, font: PDFFont, size: number, top: number, width: number, col: RGB, maxLines = 3): number {
    const lh = size * 1.25;
    let y = page.getHeight() - top - size;
    let used = 0;
    for (const l of this.lines(font, text, size, width, maxLines)) {
      const w = font.widthOfTextAtSize(l, size);
      page.drawText(l, { x: (page.getWidth() - w) / 2, y, size, font, color: col });
      y -= lh;
      used += lh;
    }
    return top + used;
  }
}

/**
 * Karte A6 hoch mit zwei Seiten.
 * Vorderseite: Firma, Satz «Danke, dass du uns weiterempfiehlst», Anreiz in einem Satz, QR-Code (wenn es ein Ziel gibt), Kontakt.
 * Rückseite: «So geht es» in drei Zeilen.
 */
export async function buildCardPdf(inhalt: KartenInhalt, fonts: PdfFonts): Promise<Uint8Array> {
  const page = PAGES.a6;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const firma = inhalt.firma.trim();
  doc.setTitle(firma ? `Empfehlungskarte A6: ${firma}` : "Empfehlungskarte A6");
  doc.setAuthor(firma || "Alperna");
  doc.setCreator("tools.alperna.ch");
  doc.setProducer("tools.alperna.ch");
  doc.setLanguage("de-CH");
  const pen = new Pen(
    await doc.embedFont(fonts.title, { subset: true }),
    await doc.embedFont(fonts.heading, { subset: true }),
    await doc.embedFont(fonts.body, { subset: true }),
  );

  const margin = mm(7);
  const pad = mm(6);
  const inner = page.w - 2 * (margin + pad);
  const innerBottom = page.h - margin - pad;

  const frame = (p: PDFPage) => {
    p.drawRectangle({ x: 0, y: 0, width: page.w, height: page.h, color: C.paper });
    p.drawRectangle({ x: margin, y: margin, width: page.w - 2 * margin, height: page.h - 2 * margin, borderColor: C.ink, borderWidth: 1 });
  };
  const footer = (p: PDFPage) => {
    const text = pen.safe(pen.body, FOOTER_TEXT);
    const size = 6.5;
    const w = pen.body.widthOfTextAtSize(text, size);
    p.drawText(text, { x: (page.w - w) / 2, y: page.h - innerBottom, size, font: pen.body, color: C.muted });
  };

  // Vorderseite
  const front = doc.addPage([page.w, page.h]);
  frame(front);
  let top = margin + pad;
  if (firma) {
    const size = pen.fit(pen.heading, pen.safe(pen.heading, firma), 15, inner, 9);
    top = pen.centered(front, firma, pen.heading, size, top, inner, C.muted, 2) + 10;
  }
  top = pen.centered(front, inhalt.titel, pen.title, 18, top, inner, C.ink, 3) + 8;
  top = pen.centered(front, inhalt.anreiz, pen.body, 9.5, top, inner, C.ink, 5) + 12;

  // Von unten nach oben: Fusszeile, Kontakt, Hinweis, QR-Code
  const footerTop = innerBottom - 6.5;
  let floor = footerTop - 6;
  if (inhalt.kontakt) {
    const size = pen.fit(pen.heading, pen.safe(pen.heading, inhalt.kontakt), 10, inner, 7);
    const kTop = floor - size * 1.25 - 4;
    pen.centered(front, inhalt.kontakt, pen.heading, size, kTop, inner, C.ink, 1);
    floor = kTop - 8;
  }
  if (inhalt.qr) {
    const hint = 7.5;
    const hintTop = floor - hint * 1.25;
    const qrBottom = hintTop - 6;
    const room = qrBottom - top;
    const size = Math.min(mm(46), room);
    if (size >= 60) {
      const qrTop = top + (room - size) / 2;
      drawQr(front, inhalt.qr, { x: (page.w - size) / 2, y: page.h - qrTop - size, w: size, h: size });
      pen.centered(front, inhalt.scanHinweis, pen.body, hint, qrBottom + 2, inner, C.muted, 1);
    }
  }
  footer(front);

  // Rückseite
  const back = doc.addPage([page.w, page.h]);
  frame(back);
  let y = pen.centered(back, inhalt.rueckTitel, pen.title, 18, margin + pad, inner, C.ink, 2) + 16;
  const numW = 26;
  const textX = margin + pad + numW;
  const textW = page.w - margin - pad - textX;
  inhalt.rueck.forEach((line, i) => {
    const lines = pen.lines(pen.body, line, 10.5, textW, 6);
    back.drawText(String(i + 1), { x: margin + pad, y: page.h - y - 22, size: 22, font: pen.title, color: C.ink });
    lines.forEach((l, j) => back.drawText(l, { x: textX, y: page.h - y - 10.5 - j * 14, size: 10.5, font: pen.body, color: C.ink }));
    y += Math.max(lines.length * 14, 26) + 16;
  });
  if (firma) {
    const size = pen.fit(pen.heading, pen.safe(pen.heading, firma), 11, inner, 8);
    pen.centered(back, firma, pen.heading, size, innerBottom - 6.5 - size * 1.25 - 10, inner, C.muted, 1);
  }
  footer(back);

  return doc.save();
}
