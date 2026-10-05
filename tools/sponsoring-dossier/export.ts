import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { FOOTER_TEXT, type DocBlock, type DocumentModel } from "@/lib/export/model";
import { wrapLines, type PdfFonts } from "@/lib/export/pdf";
import { parseHex } from "@/tools/bewertungs-kit/logic";
import { HAKEN, INK, normFarbe, textOn } from "./logic";

// PDF des Sponsoring-Dossiers mit der Vereinsfarbe (A4, Geist eingebettet): Deckblatt als Farbfläche, Linie in der
// Vereinsfarbe im Kopf jeder Seite, Tabellenkopf in der Vereinsfarbe. Die Schrift auf der Farbe ist Weiss oder Tinte, je
// nachdem, was mehr Kontrast gibt (textOn). Das Layout folgt lib/export/pdf.ts; dort fehlt die Farbe, darum steht es hier.
// Zeichnen läuft auch unter Node (Tests). logic.ts importiert diese Datei nicht.

const A4 = { w: 595.28, h: 841.89 };
const M = { left: 56, right: 56, top: 78, bottom: 64 };
const CONTENT_W = A4.w - M.left - M.right;
const MUTED = rgb(101 / 255, 100 / 255, 95 / 255);
const LINE = rgb(222 / 255, 220 / 255, 213 / 255);

const toRgb = (hex: string): RGB => {
  const [r, g, b] = parseHex(hex) ?? [15, 15, 14];
  return rgb(r / 255, g / 255, b / 255);
};

/** Ersatz für Zeichen, die in den eingebetteten Schriften fehlen (wie in lib/export/pdf.ts). */
const REPLACEMENTS: Record<string, string> = { "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "✓": "x", "✗": "x", "×": "x", "−": "-", "\t": " " };

class Pen {
  private sets = new Map<PDFFont, Set<number>>();
  constructor(
    readonly title: PDFFont,
    readonly heading: PDFFont,
    readonly body: PDFFont,
    readonly bodyMedium: PDFFont,
  ) {
    for (const f of [title, heading, body, bodyMedium]) this.sets.set(f, new Set(f.getCharacterSet()));
  }
  /** Text so umbauen, dass `font` jedes Zeichen kennt. */
  safe(font: PDFFont, text: string): string {
    const set = this.sets.get(font)!;
    let out = "";
    for (const ch of text.replace(/\r/g, "")) {
      if (ch === "\n" || set.has(ch.codePointAt(0)!)) out += ch;
      else {
        const rep = REPLACEMENTS[ch];
        out += rep && [...rep].every((c) => set.has(c.codePointAt(0)!)) ? rep : set.has(63) ? "?" : "";
      }
    }
    return out;
  }
}

type RowLayout = { cells: string[][]; h: number; isHead: boolean };

class Layout {
  readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  private y = 0;
  private readonly farbe: RGB;
  private readonly onFarbe: RGB;
  private readonly ink = toRgb(INK);

  constructor(
    private doc: PDFDocument,
    private f: Pen,
    private model: DocumentModel,
    hex: string,
  ) {
    this.farbe = toRgb(hex);
    this.onFarbe = toRgb(textOn(hex));
  }

  private newPage(): void {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M.top;
  }

  private need(h: number): void {
    if (this.y - h < M.bottom) this.newPage();
  }

  private text(text: string, font: PDFFont, size: number, x: number, color: RGB = this.ink, page: PDFPage = this.page, y: number = this.y): void {
    page.drawText(text, { x, y: y - size, size, font, color });
  }

  /** Deckblatt: Farbfläche oben mit Titel und Untertitel, darunter das Datum. */
  cover(): void {
    const page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(page);
    const { title, subtitle, datum } = this.model;
    const titleLines = wrapLines(this.f.safe(this.f.title, title), this.f.title, 34, CONTENT_W).slice(0, 4);
    const subLines = subtitle ? wrapLines(this.f.safe(this.f.body, subtitle), this.f.body, 15, CONTENT_W).slice(0, 3) : [];
    const needed = 96 + 44 + titleLines.length * 40 + (subLines.length ? 16 + subLines.length * 21 : 0) + 56;
    const band = Math.max(360, needed);
    page.drawRectangle({ x: 0, y: A4.h - band, width: A4.w, height: band, color: this.farbe });

    let top = 96;
    this.text("SPONSORING-DOSSIER", this.f.bodyMedium, 11, M.left, this.onFarbe, page, A4.h - top);
    top += 44;
    for (const l of titleLines) {
      this.text(l, this.f.title, 34, M.left, this.onFarbe, page, A4.h - top);
      top += 40;
    }
    if (subLines.length) {
      top += 16;
      for (const l of subLines) {
        this.text(l, this.f.body, 15, M.left, this.onFarbe, page, A4.h - top);
        top += 21;
      }
    }
    if (datum) this.text(this.f.safe(this.f.body, `Stand: ${datum}`), this.f.body, 11, M.left, MUTED, page, A4.h - band - 36);
    this.newPage();
  }

  private block(b: DocBlock, keepNext = 0): void {
    switch (b.type) {
      case "heading": {
        const size = b.level === 1 ? 17 : b.level === 2 ? 13.5 : 11.5;
        const lines = wrapLines(this.f.safe(this.f.heading, b.text), this.f.heading, size, CONTENT_W);
        this.need(lines.length * (size + 5) + 24 + keepNext);
        this.y -= b.level === 1 ? 14 : 10;
        if (b.level === 1) {
          this.page.drawRectangle({ x: M.left, y: this.y - 3, width: 28, height: 3, color: this.farbe });
          this.y -= 10;
        }
        for (const l of lines) {
          this.text(l, this.f.heading, size, M.left);
          this.y -= size + 5;
        }
        this.y -= 2;
        break;
      }
      case "paragraph":
        for (const l of wrapLines(this.f.safe(this.f.body, b.text), this.f.body, 10.5, CONTENT_W)) {
          this.need(16);
          this.text(l, this.f.body, 10.5, M.left);
          this.y -= 16;
        }
        this.y -= 6;
        break;
      case "list":
        b.items.forEach((item, i) => {
          const indent = 18;
          const lines = wrapLines(this.f.safe(this.f.body, item), this.f.body, 10.5, CONTENT_W - indent);
          this.need(16);
          this.text(b.ordered ? `${i + 1}.` : "•", this.f.bodyMedium, 10.5, M.left);
          for (const l of lines) {
            this.need(16);
            this.text(l, this.f.body, 10.5, M.left + indent);
            this.y -= 16;
          }
          this.y -= 2;
        });
        this.y -= 4;
        break;
      case "facts":
        this.table(["", ""], b.items.map((f) => [f.label, f.value]), [1, 2.4], false);
        break;
      case "table":
        this.table(b.header, b.rows, b.widths, true);
        break;
    }
  }

  /** Spaltenbreiten und Zeilen einer Tabelle, mit der Höhe jeder Zeile (Zeilen höher als eine Seite werden gekürzt). */
  private tableLayout(header: string[], rows: string[][], widths: number[] | undefined, showHeader: boolean) {
    const cols = header.length;
    const rel = widths && widths.length === cols ? widths : Array(cols).fill(1);
    const sum = rel.reduce((a, c) => a + c, 0);
    const colW = rel.map((w) => (w / sum) * CONTENT_W);
    const pad = 6;
    const lh = 13;
    const size = 9.5;
    const layoutRow = (cells: string[], isHead: boolean): RowLayout => {
      const font = isHead ? this.f.heading : this.f.body;
      const maxLines = Math.floor((A4.h - M.top - M.bottom - pad * 2) / lh);
      const lines = colW.map((w, i) => {
        const cell = cells[i] ?? "";
        if (!isHead && cell === HAKEN) return [HAKEN];
        const l = wrapLines(this.f.safe(font, cell), font, size, w - pad * 2);
        return l.length > maxLines ? [...l.slice(0, maxLines - 1), "…"] : l;
      });
      return { cells: lines, h: Math.max(...lines.map((l) => l.length)) * lh + pad * 2, isHead };
    };
    const head = showHeader ? layoutRow(header, true) : null;
    const body = rows.map((r) => layoutRow(r, false));
    const total = (head?.h ?? 0) + body.reduce((s, r) => s + r.h, 0);
    // Eine Tabelle, die auf eine Seite passt, bleibt zusammen; eine längere beginnt erst mit Kopf und zwei Zeilen.
    const keep = total <= A4.h - M.top - M.bottom ? total : (head?.h ?? 0) + (body[0]?.h ?? 0) + (body[1]?.h ?? 0);
    return { cols, colW, pad, lh, size, head, body, keep, showHeader };
  }

  private table(header: string[], rows: string[][], widths: number[] | undefined, showHeader: boolean): void {
    const t = this.tableLayout(header, rows, widths, showHeader);
    const { cols, colW, pad, lh, size } = t;

    const drawRow = ({ cells: lines, h, isHead }: RowLayout) => {
      const font = isHead ? this.f.heading : this.f.body;
      this.need(h);
      const top = this.y;
      if (isHead) this.page.drawRectangle({ x: M.left, y: top - h, width: CONTENT_W, height: h, color: this.farbe });
      let x = M.left;
      lines.forEach((cell, i) => {
        cell.forEach((l, li) => {
          const baseline = top - pad - size - li * lh + 2;
          if (l === HAKEN && !isHead) {
            // Häkchen als Linienzug: Geist hat kein ✓, und ein «x» wäre missverständlich.
            const sx = x + pad;
            this.page.drawLine({ start: { x: sx, y: baseline + 4 }, end: { x: sx + 3.2, y: baseline + 0.6 }, thickness: 1.4, color: this.farbe });
            this.page.drawLine({ start: { x: sx + 3.2, y: baseline + 0.6 }, end: { x: sx + 9, y: baseline + 8 }, thickness: 1.4, color: this.farbe });
            return;
          }
          const medium = !isHead && i === 0 && (!t.showHeader || cols > 2);
          this.page.drawText(l, { x: x + pad, y: baseline, size, font: medium ? this.f.bodyMedium : font, color: isHead ? this.onFarbe : this.ink });
        });
        x += colW[i];
      });
      this.page.drawLine({ start: { x: M.left, y: top - h }, end: { x: M.left + CONTENT_W, y: top - h }, thickness: 0.6, color: LINE });
      this.y = top - h;
    };

    this.need(t.keep);
    if (t.head) drawRow(t.head);
    for (const r of t.body) drawRow(r);
    this.y -= 10;
  }

  /** Höhe, die der Anfang eines Blocks mindestens braucht; eine Überschrift bleibt damit nie allein am Seitenende. */
  private firstChunk(b: DocBlock | undefined): number {
    if (!b) return 0;
    switch (b.type) {
      case "table":
        return this.tableLayout(b.header, b.rows, b.widths, true).keep;
      case "facts":
        return this.tableLayout(["", ""], b.items.map((f) => [f.label, f.value]), [1, 2.4], false).keep;
      case "list":
        return 20;
      case "heading":
        return 40;
      default:
        return 22;
    }
  }

  /** Zeichnet alle Blöcke. */
  render(blocks: DocBlock[]): void {
    blocks.forEach((b, i) => this.block(b, this.firstChunk(blocks[i + 1])));
  }

  /** Kopf (Verein links, Datum rechts, Linie in der Vereinsfarbe) und Fuss (Hinweis links, Seitenzahl rechts) ab der zweiten Seite. */
  decorate(): void {
    const { f } = this;
    const datum = this.model.datum ? f.safe(f.body, this.model.datum) : "";
    const room = A4.w - M.left - M.right - (datum ? f.body.widthOfTextAtSize(datum, 9) + 16 : 0);
    let firma = f.safe(f.bodyMedium, this.model.firma?.trim() || "Alperna");
    if (f.bodyMedium.widthOfTextAtSize(firma, 9) > room) {
      while (firma.length > 1 && f.bodyMedium.widthOfTextAtSize(`${firma}...`, 9) > room) firma = firma.slice(0, -1);
      firma = `${firma.trimEnd()}...`;
    }
    const footer = f.safe(f.body, FOOTER_TEXT);
    this.pages.forEach((page, i) => {
      page.drawText(footer, { x: M.left, y: 36, size: 8.5, font: f.body, color: MUTED });
      if (i === 0) return;
      const top = A4.h - 40;
      page.drawText(firma, { x: M.left, y: top, size: 9, font: f.bodyMedium, color: MUTED });
      if (datum) page.drawText(datum, { x: A4.w - M.right - f.body.widthOfTextAtSize(datum, 9), y: top, size: 9, font: f.body, color: MUTED });
      page.drawLine({ start: { x: M.left, y: top - 8 }, end: { x: A4.w - M.right, y: top - 8 }, thickness: 1.4, color: this.farbe });
      const count = `Seite ${i + 1} von ${this.pages.length}`;
      page.drawText(count, { x: A4.w - M.right - f.body.widthOfTextAtSize(count, 8.5), y: 36, size: 8.5, font: f.body, color: MUTED });
    });
  }
}

/**
 * Baut das PDF des Dossiers: Deckblatt in der Vereinsfarbe, danach die Abschnitte. `farbe` ist ein Hex-Wert; ein ungültiger
 * wird zur Standardfarbe. Wirft nicht bei unbekannten Zeichen oder sehr langen Wörtern.
 */
export async function buildDossierPdf(model: DocumentModel, farbe: string, fonts: PdfFonts): Promise<Uint8Array> {
  const hex = normFarbe(farbe);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(model.title);
  doc.setAuthor(model.firma?.trim() || "Alperna");
  doc.setCreator("tools.alperna.ch");
  doc.setProducer("tools.alperna.ch");
  doc.setLanguage("de-CH");
  const pen = new Pen(
    await doc.embedFont(fonts.title, { subset: true }),
    await doc.embedFont(fonts.heading, { subset: true }),
    await doc.embedFont(fonts.body, { subset: true }),
    await doc.embedFont(fonts.bodyMedium, { subset: true }),
  );
  const layout = new Layout(doc, pen, model, hex);
  layout.cover();
  layout.render(model.blocks);
  layout.decorate();
  return doc.save();
}
