import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { FOOTER_TEXT, type DocBlock, type DocumentModel } from "@/lib/export/model";

// PDF im Browser (und in Tests unter Node): A4 hoch, auf Wunsch quer (`landscape: true` im Modell), Geist für Titel und Text.
// Die Schriften werden eingebettet; fehlende Zeichen werden ersetzt statt als Kästchen gedruckt.

export type PdfFonts = {
  /** Geist 600 */
  title: Uint8Array;
  /** Geist 500 */
  heading: Uint8Array;
  /** Geist 400 */
  body: Uint8Array;
  /** Geist 500 */
  bodyMedium: Uint8Array;
};

type PageSize = { w: number; h: number };
const A4_PORTRAIT: PageSize = { w: 595.28, h: 841.89 };
const A4_LANDSCAPE: PageSize = { w: 841.89, h: 595.28 };
const M = { left: 56, right: 56, top: 78, bottom: 64 };

/**
 * Das Dokumentmodell für das PDF. `landscape: true` druckt A4 quer (breite Tabellen); ohne Angabe bleibt es A4 hoch.
 * Die Angabe gehört zum Modell und reist damit durch DocumentExport (`{ ...model }`), ohne dass der Baustein sie kennen muss.
 */
export type PdfModel = DocumentModel & { landscape?: boolean };

const COLOR = {
  ink: rgb(15 / 255, 15 / 255, 14 / 255),
  muted: rgb(101 / 255, 100 / 255, 95 / 255),
  line: rgb(222 / 255, 220 / 255, 213 / 255),
  surface: rgb(243 / 255, 241 / 255, 236 / 255),
  yellow: rgb(255 / 255, 215 / 255, 0 / 255),
};

/** Ersatz für Zeichen, die in den eingebetteten Schriften fehlen. */
const REPLACEMENTS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "≤": "<=",
  "≥": ">=",
  "✓": "x",
  "✗": "x",
  "×": "x",
  "−": "-",
  " ": " ",
  " ": " ",
  "\t": " ",
};

class Fonts {
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
      if (ch === "\n") out += ch;
      else if (set.has(ch.codePointAt(0)!)) out += ch;
      else {
        const rep = REPLACEMENTS[ch];
        out += rep && [...rep].every((c) => set.has(c.codePointAt(0)!)) ? rep : set.has(63) ? "?" : "";
      }
    }
    return out;
  }
}

/** Bricht Text in Zeilen von höchstens `width` Punkten. Sehr lange Wörter werden zeichenweise umbrochen. */
export function wrapLines(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/ +/).filter((w, i, a) => w !== "" || a.length === 1);
    let line = "";
    const push = () => {
      lines.push(line);
      line = "";
    };
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) push();
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word;
        continue;
      }
      // Wort länger als eine Zeile: zeichenweise
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > width && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    push();
  }
  return lines.length ? lines : [""];
}

type Cursor = { page: PDFPage; y: number };

class Layout {
  pages: PDFPage[] = [];
  cur!: Cursor;
  readonly contentW: number;
  constructor(
    private doc: PDFDocument,
    private f: Fonts,
    private model: DocumentModel,
    private size: PageSize,
  ) {
    this.contentW = size.w - M.left - M.right;
    this.newPage();
  }

  newPage() {
    const page = this.doc.addPage([this.size.w, this.size.h]);
    this.pages.push(page);
    this.cur = { page, y: this.size.h - M.top };
  }

  /** Stellt sicher, dass `h` Punkte Platz sind, sonst neue Seite. */
  need(h: number) {
    if (this.cur.y - h < M.bottom) this.newPage();
  }

  text(text: string, font: PDFFont, size: number, x: number, color = COLOR.ink) {
    this.cur.page.drawText(text, { x, y: this.cur.y - size, size, font, color });
  }

  title() {
    const { title, subtitle } = this.model;
    this.cur.page.drawRectangle({ x: M.left, y: this.cur.y - 4, width: 44, height: 5, color: COLOR.yellow });
    this.cur.y -= 22;
    const lines = wrapLines(this.f.safe(this.f.title, title), this.f.title, 24, this.contentW);
    for (const l of lines) {
      this.text(l, this.f.title, 24, M.left);
      this.cur.y -= 30;
    }
    if (subtitle) {
      for (const l of wrapLines(this.f.safe(this.f.body, subtitle), this.f.body, 11, this.contentW)) {
        this.text(l, this.f.body, 11, M.left, COLOR.muted);
        this.cur.y -= 16;
      }
    }
    this.cur.y -= 8;
  }

  block(b: DocBlock) {
    switch (b.type) {
      case "heading": {
        const size = b.level === 1 ? 18 : b.level === 2 ? 14 : 11.5;
        const font = this.f.heading;
        const lines = wrapLines(this.f.safe(font, b.text), font, size, this.contentW);
        this.need(lines.length * (size + 5) + 18 + (size + 5)); // Überschrift nie allein am Seitenende
        this.cur.y -= b.level === 1 ? 14 : 10;
        for (const l of lines) {
          this.text(l, font, size, M.left);
          this.cur.y -= size + 5;
        }
        this.cur.y -= 2;
        break;
      }
      case "paragraph":
        this.paragraph(b.text, M.left, this.contentW);
        this.cur.y -= 6;
        break;
      case "list":
        b.items.forEach((item, i) => {
          const marker = b.ordered ? `${i + 1}.` : "•";
          const indent = 18;
          const lines = wrapLines(this.f.safe(this.f.body, item), this.f.body, 10.5, this.contentW - indent);
          this.need(16);
          this.text(this.f.safe(this.f.body, marker), this.f.bodyMedium, 10.5, M.left);
          for (const l of lines) {
            this.need(16);
            this.text(l, this.f.body, 10.5, M.left + indent);
            this.cur.y -= 16;
          }
          this.cur.y -= 2;
        });
        this.cur.y -= 4;
        break;
      case "facts":
        this.table(
          ["", ""],
          b.items.map((f) => [f.label, f.value]),
          [1, 2.4],
          false,
        );
        break;
      case "table":
        this.table(b.header, b.rows, b.widths, true);
        break;
    }
  }

  paragraph(text: string, x: number, width: number) {
    for (const l of wrapLines(this.f.safe(this.f.body, text), this.f.body, 10.5, width)) {
      this.need(16);
      this.text(l, this.f.body, 10.5, x);
      this.cur.y -= 16;
    }
  }

  table(header: string[], rows: string[][], widths: number[] | undefined, showHeader: boolean) {
    const cols = header.length;
    const rel = widths && widths.length === cols ? widths : Array(cols).fill(1);
    const total = rel.reduce((a, b) => a + b, 0);
    const colW = rel.map((w) => (w / total) * this.contentW);
    const pad = 6;
    const lh = 13;
    const size = 9.5;

    const rowLines = (cells: string[], font: PDFFont) =>
      colW.map((w, i) => wrapLines(this.f.safe(font, cells[i] ?? ""), font, size, w - pad * 2));

    const maxLines = Math.floor((this.size.h - M.top - M.bottom - pad * 2) / lh);
    /** Zeilen einer Zeile; eine Zeile höher als eine Seite wird abgeschnitten statt endlos Seiten zu erzeugen. */
    const measure = (cells: string[], font: PDFFont) => {
      const lines = rowLines(cells, font).map((l) => (l.length > maxLines ? [...l.slice(0, maxLines - 1), "…"] : l));
      return { lines, h: Math.max(...lines.map((l) => l.length)) * lh + pad * 2 };
    };

    const headerH = measure(header, this.f.heading).h;
    let lastPage = this.cur.page;
    const drawRow = (cells: string[], fillHeader: boolean) => {
      const font = fillHeader ? this.f.heading : this.f.body;
      const { lines, h } = measure(cells, font);
      this.need(h);
      // Neue Seite mitten in der Tabelle: der Kopf wiederholt sich, wenn er mit der Zeile auf die Seite passt
      // (eine Zeile, die eine ganze Seite füllt, steht allein, sonst bliebe der Kopf allein zurück).
      if (showHeader && !fillHeader && this.cur.page !== lastPage && headerH + h <= this.size.h - M.top - M.bottom) drawRow(header, true);
      const top = this.cur.y;
      if (fillHeader) {
        this.cur.page.drawRectangle({ x: M.left, y: top - h, width: this.contentW, height: h, color: COLOR.surface });
      }
      let x = M.left;
      lines.forEach((cell, i) => {
        cell.forEach((l, li) => {
          this.cur.page.drawText(l, {
            x: x + pad,
            y: top - pad - size - li * lh + 2,
            size,
            font: !fillHeader && i === 0 && !showHeader ? this.f.bodyMedium : font,
            color: COLOR.ink,
          });
        });
        x += colW[i];
      });
      this.cur.page.drawLine({
        start: { x: M.left, y: top - h },
        end: { x: M.left + this.contentW, y: top - h },
        thickness: 0.6,
        color: COLOR.line,
      });
      this.cur.y = top - h;
      lastPage = this.cur.page;
    };

    // Der Kopf steht nie allein am Seitenende: Platz für Kopf und erste Zeile zusammen.
    if (showHeader && rows.length > 0) this.need(headerH + measure(rows[0], this.f.body).h);
    if (showHeader) drawRow(header, true);
    for (const r of rows) drawRow(r, false);
    this.cur.y -= 10;
  }
}

/** Kopf (Firma links, Datum rechts) und Fuss (Hinweis links, Seitenzahl rechts) auf jeder Seite. */
function decorate(pages: PDFPage[], f: Fonts, model: DocumentModel, size: PageSize) {
  const datum = model.datum ? f.safe(f.body, model.datum) : "";
  // Der Firmenname steht in einer Zeile links vom Datum; ein sehr langer Name wird gekürzt statt über das Datum zu laufen.
  const room = size.w - M.left - M.right - (datum ? f.body.widthOfTextAtSize(datum, 9) + 16 : 0);
  let firma = f.safe(f.bodyMedium, model.firma?.trim() || "Alperna");
  if (f.bodyMedium.widthOfTextAtSize(firma, 9) > room) {
    while (firma.length > 1 && f.bodyMedium.widthOfTextAtSize(`${firma}...`, 9) > room) firma = firma.slice(0, -1);
    firma = `${firma.trimEnd()}...`;
  }
  const footer = f.safe(f.body, FOOTER_TEXT);
  pages.forEach((page, i) => {
    const top = size.h - 40;
    page.drawText(firma, { x: M.left, y: top, size: 9, font: f.bodyMedium, color: COLOR.muted });
    if (datum) {
      const w = f.body.widthOfTextAtSize(datum, 9);
      page.drawText(datum, { x: size.w - M.right - w, y: top, size: 9, font: f.body, color: COLOR.muted });
    }
    page.drawLine({ start: { x: M.left, y: top - 8 }, end: { x: size.w - M.right, y: top - 8 }, thickness: 0.6, color: COLOR.line });

    const bottom = 36;
    const count = `Seite ${i + 1} von ${pages.length}`;
    const cw = f.body.widthOfTextAtSize(count, 8.5);
    page.drawText(footer, { x: M.left, y: bottom, size: 8.5, font: f.body, color: COLOR.muted });
    page.drawText(count, { x: size.w - M.right - cw, y: bottom, size: 8.5, font: f.body, color: COLOR.muted });
  });
}

/** Baut das PDF (A4 hoch, mit `landscape: true` im Modell quer). Wirft nicht bei unbekannten Zeichen oder sehr langen Wörtern. */
export async function buildPdf(model: PdfModel, fonts: PdfFonts): Promise<Uint8Array> {
  const size = model.landscape ? A4_LANDSCAPE : A4_PORTRAIT;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(model.title);
  doc.setAuthor(model.firma?.trim() || "Alperna");
  doc.setCreator("tools.alperna.ch");
  doc.setProducer("tools.alperna.ch");
  doc.setLanguage("de-CH");

  const f = new Fonts(
    await doc.embedFont(fonts.title, { subset: true }),
    await doc.embedFont(fonts.heading, { subset: true }),
    await doc.embedFont(fonts.body, { subset: true }),
    await doc.embedFont(fonts.bodyMedium, { subset: true }),
  );
  const layout = new Layout(doc, f, model, size);
  layout.title();
  for (const b of model.blocks) layout.block(b);
  decorate(layout.pages, f, model, size);
  return doc.save();
}
