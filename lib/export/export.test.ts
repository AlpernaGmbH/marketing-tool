import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS, loadPdfFonts } from "@/lib/export/fonts";
import { flattenBlocks, safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import { buildPdf, wrapLines, type PdfFonts } from "@/lib/export/pdf";
import { PDFDocument as PD, PDFPage } from "pdf-lib";
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

  it("wiederholt den Tabellenkopf auf jeder Folgeseite und lässt ihn nie allein am Seitenende stehen", async () => {
    const rows = Array.from({ length: 70 }, (_, i) => [`Zelle ${i}`, "x"]);
    const header = ["Spaltenkopf", "Wert"];
    const pagesWith = (text: string, calls: { page: PDFPage; text: string }[]) => new Set(calls.filter((c) => c.text === text).map((c) => c.page));
    const calls: { page: PDFPage; text: string }[] = [];
    const original = PDFPage.prototype.drawText;
    const spy = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
      calls.push({ page: this, text: String(text) });
      return original.call(this, text, options);
    });
    try {
      const doc = await PDFDocument.load(await buildPdf(model({ blocks: [{ type: "table", header, rows }] }), fonts));
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
      const mitKopf = pagesWith("Spaltenkopf", calls);
      const mitZeilen = new Set(calls.filter((c) => /^Zelle \d+$/.test(c.text)).map((c) => c.page));
      expect(mitZeilen.size).toBeGreaterThanOrEqual(2);
      // Jede Seite mit Tabellenzeilen trägt den Kopf, und keine Seite trägt einen Kopf ohne Zeilen.
      expect([...mitZeilen].every((p) => mitKopf.has(p))).toBe(true);
      expect([...mitKopf].every((p) => mitZeilen.has(p))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("schneidet eine Tabellenzeile ab, die höher als eine Seite ist, statt Seiten zu verschwenden", async () => {
    const huge = Array.from({ length: 400 }, (_, i) => `Zeile ${i}`).join("\n");
    const doc = await PDFDocument.load(await buildPdf(model({ blocks: [{ type: "table", header: ["A", "B"], rows: [[huge, "x"]] }] }), fonts));
    expect(doc.getPageCount()).toBeLessThanOrEqual(3);
  });

  it("druckt auf Wunsch A4 quer, auf jeder Seite", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => [`Phase ${i}`, "Wer macht so etwas in meiner Nähe?", "Website, Google-Unternehmensprofil", "Teilweise", "Anna Keller", "Lücke"]);
    const table = { type: "table" as const, header: ["Phase", "Frage", "Berührungspunkte", "Inhalt", "Verantwortlich", "Lücke"], rows, widths: [1.3, 2, 2, 1, 1.3, 1] };
    const doc = await PDFDocument.load(await buildPdf({ ...model({ blocks: [table] }), landscape: true }, fonts));
    expect(doc.getPageCount()).toBeGreaterThan(1);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      expect([Math.round(width), Math.round(height)]).toEqual([842, 595]);
    }
  });

  it("bleibt ohne Angabe oder mit landscape false hochformatig (rückwärtskompatibel)", async () => {
    for (const m of [model(), { ...model(), landscape: false }]) {
      const { width, height } = (await PDFDocument.load(await buildPdf(m, fonts))).getPage(0).getSize();
      expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    }
  });

  it("nutzt im Querformat die ganze Breite: dieselbe Tabelle braucht quer weniger Zeilenumbrüche", async () => {
    const d = await PD.create();
    d.registerFontkit(fontkit);
    const font = await d.embedFont(fonts.body, { subset: true });
    const text = "Google-Unternehmensprofil mit Fotos und Öffnungszeiten, regelmässige Beiträge, Empfehlungen";
    const hoch = wrapLines(text, font, 9.5, (595.28 - 112) / 6 - 12).length;
    const quer = wrapLines(text, font, 9.5, (841.89 - 112) / 6 - 12).length;
    expect(quer).toBeLessThan(hoch);
    // und das PDF selbst lässt sich quer mit einer Zeile über Seitenhöhe abschneiden
    const huge = Array.from({ length: 400 }, (_, i) => `Zeile ${i}`).join("\n");
    const pdf = await PDFDocument.load(await buildPdf({ ...model({ blocks: [{ type: "table", header: ["A", "B"], rows: [[huge, "x"]] }] }), landscape: true }, fonts));
    expect(pdf.getPageCount()).toBeLessThanOrEqual(3);
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

describe("Randfälle aus dem Review", () => {
  it("DOCX enthält keine in XML verbotenen Steuerzeichen, auch wenn sie im Text stehen", async () => {
    const zip = await JSZip.loadAsync(
      await buildDocx(model({ firma: "Keller\u0008AG", blocks: [{ type: "paragraph", text: "Titel mit \u0001 und \u000B Steuerzeichen\nZweite Zeile" }] })),
    );
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    expect(xml).toContain("Steuerzeichen");
  });

  it("PDF kürzt einen sehr langen Firmennamen im Kopf, statt über das Datum zu laufen", async () => {
    const bytes = await buildPdf(model({ firma: "Malerei und Gipserei Keller ".repeat(8) }), fonts);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});


describe("Bildschirm-Bausteine in den Dateien", () => {
  const visual: DocBlock[] = [
    { type: "stat", label: "Marketing-Reife", value: "72", of: "100", band: "Solide Basis", note: "Es fehlt das Messen." },
    { type: "bars", title: "Dimensionen", unit: "%", items: [{ label: "Website", value: 80.5, note: "gut" }, { label: "Social Media", value: 40 }] },
    { type: "steps", title: "Nächste Schritte", items: [{ title: "Profil prüfen", text: "Lies es laut." }, { title: "Plan machen", text: "Wähle Tage." }] },
    { type: "cards", title: "Ideen", items: [{ title: "Team", text: "Ein Foto.", tag: "Reel" }, { title: "Baustelle" }] },
    { type: "split", title: "Themen", items: [{ label: "Wissen", value: 60 }, { label: "Team", value: 40 }] },
    { type: "grid", title: "Woche", columns: ["Mo", "Di"], rows: [{ label: "Morgen", cells: ["Beitrag"] }] },
    { type: "slides", title: "Folien", items: [{ title: "Eins", text: "a", tag: "Heute" }] },
    { type: "paragraph", text: "Normaler Absatz." },
  ];

  it("flattenBlocks macht aus jedem Baustein Grundbausteine und lässt Grundbausteine unverändert", () => {
    const flat = flattenBlocks(visual);
    expect(flat.every((b) => ["heading", "paragraph", "list", "table", "facts"].includes(b.type))).toBe(true);
    expect(flat[0]).toEqual({ type: "paragraph", text: "Marketing-Reife: 72 von 100 (Solide Basis). Es fehlt das Messen." });
    expect(flat).toContainEqual({ type: "table", header: ["", "Anteil"], rows: [["Website", "80,5 %, gut"], ["Social Media", "40 %"]], widths: [2, 1] });
    expect(flat).toContainEqual({ type: "list", ordered: true, items: ["Profil prüfen: Lies es laut.", "Plan machen: Wähle Tage."] });
    expect(flat).toContainEqual({ type: "list", items: ["Team (Reel): Ein Foto.", "Baustelle"] });
    expect(flat).toContainEqual({ type: "table", header: ["", "Mo", "Di"], rows: [["Morgen", "Beitrag", ""]] });
    expect(flat.at(-1)).toEqual({ type: "paragraph", text: "Normaler Absatz." });
    const basic: DocBlock[] = [{ type: "heading", level: 1, text: "A" }, { type: "facts", items: [{ label: "x", value: "y" }] }];
    expect(flattenBlocks(basic)).toEqual(basic);
  });

  it("Markdown, PDF und Word enthalten den Inhalt der Bausteine", async () => {
    const m = model({ blocks: visual });
    const md = toMarkdown(m);
    expect(md).toContain("Marketing-Reife: 72 von 100 (Solide Basis).");
    expect(md).toContain("| Website | 80,5 % |".replace(" % |", " %, gut |"));
    expect(md).toContain("1. Profil prüfen: Lies es laut.");
    expect(md).toContain("- Team (Reel): Ein Foto.");
    const pdf = await PDFDocument.load(await buildPdf(m, fonts));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    const zip = await JSZip.loadAsync(await buildDocx(m));
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const text of ["Solide Basis", "Profil prüfen", "Baustelle", "Wissen", "Beitrag"]) expect(xml).toContain(text);
  });
});
