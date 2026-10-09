import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from "docx";
import { FOOTER_TEXT, flattenBlocks, type BasicBlock, type DocumentModel } from "@/lib/export/model";

// Word-Dokument. Die Schrift heisst Geist; ohne Installation nimmt Word eine Ersatzschrift.
const BODY = "Geist";
const HEAD = "Geist";
const LINE = "DEDCD5";
const SURFACE = "F3F1EC";
const MUTED = "65645F";

// Steuerzeichen sind in XML 1.0 verboten; Word meldet sonst «beschädigter Inhalt». Zeilenumbruch (\n) und Tab bleiben.
const clean = (s: string) => s.replace(/\r/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");

function runs(text: string, opts: { bold?: boolean; font?: string; size?: number; color?: string } = {}): TextRun[] {
  // Zeilenumbrüche im Text werden zu echten Umbrüchen
  return clean(text)
    .split("\n")
    .map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0, bold: opts.bold, font: opts.font ?? BODY, size: opts.size, color: opts.color }));
}

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function table(header: string[], rows: string[][], widths: number[] | undefined, showHeader: boolean): Table {
  const cols = header.length;
  const rel = widths && widths.length === cols ? widths : Array(cols).fill(1);
  const total = rel.reduce((a, b) => a + b, 0);
  const pct = rel.map((w) => Math.round((w / total) * 100));
  const cell = (text: string, i: number, head: boolean, boldFirst: boolean) =>
    new TableCell({
      width: { size: pct[i], type: WidthType.PERCENTAGE },
      borders: cellBorders,
      shading: head ? { type: ShadingType.CLEAR, fill: SURFACE, color: "auto" } : undefined,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({ children: runs(text, { bold: head || boldFirst, font: head ? HEAD : BODY, size: 19 }) })],
    });
  const bodyRows = rows.map(
    (r) => new TableRow({ cantSplit: true, children: Array.from({ length: cols }, (_, i) => cell(r[i] ?? "", i, false, !showHeader && i === 0)) }),
  );
  const headRow = showHeader
    ? [new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => cell(h, i, true, false)) })]
    : [];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [...headRow, ...bodyRows] });
}

function block(b: BasicBlock): FileChild[] {
  switch (b.type) {
    case "heading":
      return [
        new Paragraph({
          heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          spacing: { before: 280, after: 100 },
          children: runs(b.text, { bold: true, font: HEAD, size: b.level === 1 ? 36 : b.level === 2 ? 28 : 23 }),
        }),
      ];
    case "paragraph":
      return [new Paragraph({ spacing: { after: 140, line: 320 }, children: runs(b.text, { size: 21 }) })];
    case "list":
      return b.items.map(
        (item) =>
          new Paragraph({
            spacing: { after: 60, line: 320 },
            numbering: { reference: b.ordered ? "ordered" : "bullets", level: 0 },
            children: runs(item, { size: 21 }),
          }),
      );
    case "facts":
      return [table(["", ""], b.items.map((f) => [f.label, f.value]), [1, 2.4], false), new Paragraph({ children: [] })];
    case "table":
      return [table(b.header, b.rows, b.widths, true), new Paragraph({ children: [] })];
  }
}

export function buildDocxDocument(model: DocumentModel): Document {
  const firma = model.firma?.trim() || "Alperna";
  return new Document({
    creator: firma,
    title: model.title,
    description: FOOTER_TEXT,
    styles: { default: { document: { run: { font: BODY, size: 21 } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }],
        },
        {
          reference: "ordered",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1200, left: 1134, right: 1134 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                tabStops: [{ type: "right", position: 9638 }],
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } },
                children: [
                  new TextRun({ text: firma, font: BODY, size: 18, color: MUTED, bold: true }),
                  ...(model.datum ? [new TextRun({ text: `\t${model.datum}`, font: BODY, size: 18, color: MUTED })] : []),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ children: [new TextRun({ text: FOOTER_TEXT, font: BODY, size: 17, color: MUTED })] })],
          }),
        },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 80 }, children: runs(model.title, { bold: true, font: HEAD, size: 48 }) }),
          ...(model.subtitle ? [new Paragraph({ spacing: { after: 240 }, children: runs(model.subtitle, { size: 22, color: MUTED }) })] : []),
          ...flattenBlocks(model.blocks).flatMap(block),
        ],
      },
    ],
  });
}

/** Bytes der .docx-Datei (Browser: Blob daraus bauen; Node: Buffer). */
export async function buildDocx(model: DocumentModel): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toArrayBuffer(buildDocxDocument(model)));
}
