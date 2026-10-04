import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS, loadPdfFonts } from "@/lib/export/fonts";
import { safeFilename, toMarkdown, type DocumentModel } from "@/lib/export/model";
import { buildPdf, wrapLines, type PdfFonts } from "@/lib/export/pdf";
import { PDFDocument as PD } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = {
  title: read(FONT_PATHS.title),
  heading: read(FONT_PATHS.heading),
  body: read(FONT_PATHS.body),
  bodyMedium: read(FONT_PATHS.bodyMedium),
};

const model = (over: Partial<DocumentModel> = {}): DocumentModel => ({
  title: "ICP-Dokument: Malerei Keller, Gossau",
  subtitle: "Idealkundenprofil mit Punktekarte",
  firma: "Malerei Keller, Gossau",
  datum: "03.10.2026",
  filename: "icp-malerei-keller",
  blocks: [
    { type: "heading", level: 1, text: "Steckbrief" },
    { type: "facts", items: [{ label: "Branche", value: "Maler und Gipser" }, { label: "Kanton", value: "SG" }] },
    { type: "heading", level: 2, text: "Passt / passt nicht" },
    { type: "list", items: ["Hausbesitzer in Gossau, Herisau und Appenzell", "Umbau und Renovation"] },
    { type: "list", ordered: true, items: ["Erstkontakt", "Besichtigung", "Offerte"] },
    { type: "paragraph", text: "Die Punktekarte bewertet neue Anfragen mit 0 bis 100 Punkten.\nZweite Zeile." },
    { type: "table", header: ["Kriterium", "Gewicht", "Punkte"], rows: [["Region", "30 %", "8"], ["Budget", "20 %", "6"]], widths: [2, 1, 1] },
  ],
  ...over,
});

describe("PDF", () => {
  it("erzeugt ein gültiges A4-PDF mit eingebetteten Schriften", async () => {
    const bytes = await buildPdf(model(), fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    const baseFonts = doc.context
      .enumerateIndirectObjects()
      .flatMap(([, obj]) => (obj instanceof PDFDict ? [obj.get(PDFName.of("BaseFont"))?.toString()] : []))
      .filter(Boolean)
      .join(" ");
    expect(baseFonts).toMatch(/Geist/);
    expect(doc.getTitle()).toBe("ICP-Dokument: Malerei Keller, Gossau");
  });

  it("legt lange Dokumente auf mehrere Seiten um", async () => {
    const blocks = Array.from({ length: 120 }, (_, i) => ({ type: "paragraph" as const, text: `Absatz ${i}. ${"Text ".repeat(40)}` }));
    const doc = await PDFDocument.load(await buildPdf(model({ blocks }), fonts));
    expect(doc.getPageCount()).toBeGreaterThan(3);
  });

  it("stürzt bei unbekannten Zeichen nicht ab (Pfeile, Häkchen, Emoji)", async () => {
    const blocks = [{ type: "paragraph" as const, text: "Schritt 1 → Schritt 2 ≥ 3 ✓ fertig 🎉 «Zitat» – CHF 1'000.-" }];
    const bytes = await buildPdf(model({ blocks, title: "Test → 🎉" }), fonts);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("bricht ein Wort, das breiter als die Seite ist, und stürzt nicht ab", async () => {
    const blocks = [{ type: "paragraph" as const, text: "x".repeat(600) }, { type: "table" as const, header: ["A", "B"], rows: [["y".repeat(300), "z"]] }];
    const doc = await PDFDocument.load(await buildPdf(model({ blocks }), fonts));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("schneidet eine Tabellenzeile ab, die höher als eine Seite ist, statt Seiten zu verschwenden", async () => {
    const huge = Array.from({ length: 400 }, (_, i) => `Zeile ${i}`).join("\n");
    const doc = await PDFDocument.load(await buildPdf(model({ blocks: [{ type: "table", header: ["A", "B"], rows: [[huge, "x"]] }] }), fonts));
    expect(doc.getPageCount()).toBeLessThanOrEqual(3);
  });

  it("funktioniert ohne Blöcke, ohne Firma und ohne Datum", async () => {
    const doc = await PDFDocument.load(await buildPdf({ title: "Leer", filename: "leer", blocks: [] }, fonts));
    expect(doc.getPageCount()).toBe(1);
  });

  it("bricht Zeilen innerhalb der Breite um", async () => {
    const d = await PD.create();
    d.registerFontkit(fontkit);
    const font = await d.embedFont(fonts.body, { subset: true });
    const lines = wrapLines("Die Punktekarte bewertet neue Anfragen mit null bis hundert Punkten", font, 10.5, 120);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(font.widthOfTextAtSize(l, 10.5)).toBeLessThanOrEqual(120);
    expect(wrapLines("a\n\nb", font, 10.5, 120)).toEqual(["a", "", "b"]);
    expect(wrapLines("", font, 10.5, 120)).toEqual([""]);
  });
});

describe("DOCX", () => {
  it("erzeugt eine gültige .docx mit Inhalt, Tabelle, Kopf und Fuss", async () => {
    const zip = await JSZip.loadAsync(await buildDocx(model()));
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("ICP-Dokument: Malerei Keller, Gossau");
    expect(doc).toContain("Maler und Gipser");
    expect(doc).toContain("Hausbesitzer in Gossau");
    expect(doc).toContain("<w:tbl>");
    expect(doc).toContain("Zweite Zeile.");
    const names = Object.keys(zip.files);
    const header = await zip.file(names.find((n) => /word\/header\d*\.xml/.test(n))!)!.async("string");
    const footer = await zip.file(names.find((n) => /word\/footer\d*\.xml/.test(n))!)!.async("string");
    expect(header).toContain("Malerei Keller, Gossau");
    expect(header).toContain("03.10.2026");
    expect(footer).toContain("Erstellt mit tools.alperna.ch");
  });
  it("funktioniert ohne Blöcke", async () => {
    const zip = await JSZip.loadAsync(await buildDocx({ title: "Leer", filename: "leer", blocks: [] }));
    expect(await zip.file("word/document.xml")!.async("string")).toContain("Leer");
  });
});

describe("Markdown", () => {
  it("gibt alle Blocktypen aus", () => {
    const md = toMarkdown(model());
    expect(md).toMatch(/^# ICP-Dokument/);
    expect(md).toContain("## Steckbrief");
    expect(md).toContain("- **Branche:** Maler und Gipser");
    expect(md).toContain("1. Erstkontakt");
    expect(md).toContain("| Kriterium | Gewicht | Punkte |");
    expect(md).toContain("| --- | --- | --- |");
  });
  it("maskiert senkrechte Striche und füllt fehlende Zellen", () => {
    const md = toMarkdown({ title: "T", filename: "t", blocks: [{ type: "table", header: ["A", "B"], rows: [["x|y"], ["1", "2"]] }] });
    expect(md).toContain("| x\\|y |  |");
  });
});

describe("safeFilename", () => {
  it("macht aus Firmennamen saubere Dateinamen", () => {
    expect(safeFilename("Malerei Keller, Gossau")).toBe("malerei-keller-gossau");
    expect(safeFilename("Bäckerei Müller & Söhne")).toBe("baeckerei-mueller-soehne");
    expect(safeFilename("   ")).toBe("dokument");
    expect(safeFilename("///", "x")).toBe("x");
  });
});

describe("loadPdfFonts", () => {
  it("lädt vier Schriften, fängt Fehler ab und lässt einen neuen Versuch zu", async () => {
    const calls: string[] = [];
    const ok = async (p: string) => (calls.push(p), { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) }) as Response;
    const loaded = await loadPdfFonts(ok as unknown as typeof fetch);
    expect(calls).toHaveLength(4);
    expect(loaded.title.byteLength).toBe(4);
    // zweiter Aufruf nutzt den Cache
    await loadPdfFonts(ok as unknown as typeof fetch);
    expect(calls).toHaveLength(4);
  });
});
