import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS } from "@/lib/export/fonts";
import { buildPdf, type PdfFonts } from "@/lib/export/pdf";
import { SAMPLE, summary, toDocument, toInput, type FormState } from "./logic";

// Das Dokument des Rechners lässt sich als PDF und Word bauen (Schrift Geist, «», Strich «–»), auch mit zehn Beiträgen.

const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };

const ten: FormState = {
  plattform: "linkedin",
  follower: "2500",
  posts: Array.from({ length: 10 }, (_, i) => ({
    name: i === 0 ? "Ärger mit Öl & Lack «Sommer» für Zürich" : `Beitrag über die Gewerbeausstellung ${i + 1}`,
    a: String(10 + i),
    b: "3",
    c: "1",
    d: "",
    reichweite: i % 3 === 0 ? "" : String(900 + i * 25),
  })),
};

describe("engagement-rate: PDF und Word", () => {
  for (const [name, form] of [["Beispiel", SAMPLE], ["zehn Beiträge auf LinkedIn", ten]] as const) {
    const doc = toDocument(summary(toInput(form)!), { firma: "Malerei Keller, Gossau", verein: false });
    doc.datum = "05.10.2026";

    it(`${name}: gültiges PDF mit Seiten`, async () => {
      const bytes = await buildPdf(doc, fonts);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    });

    it(`${name}: Word-Datei mit Tabelle und Hinweis zu den Branchenwerten`, async () => {
      const zip = await JSZip.loadAsync(await buildDocx(doc));
      const xml = await zip.file("word/document.xml")!.async("string");
      expect(xml).toContain("<w:tbl>");
      // Instagram hat einen Vergleichswert, LinkedIn nicht: je einer der beiden Hinweise
      expect(xml).toMatch(/Keine Einordnung gegen Branchenwerte|Durchschnitt internationaler Marken/);
      expect(xml).toContain("Rate auf");
    });
  }
});
