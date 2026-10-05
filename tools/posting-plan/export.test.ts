import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS } from "@/lib/export/fonts";
import { buildPdf, type PdfFonts } from "@/lib/export/pdf";
import { buildPlan, toDocument, type Input } from "./logic";

// Der Plan muss sich als PDF und als Word-Datei bauen lassen, auch mit allen Kanälen, langen Säulennamen und Sonderzeichen (±, «», ä).

const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };

const voll: Input = {
  stunden: 12,
  kanaele: ["instagram", "facebook", "linkedin", "google", "newsletter", "website"],
  faehigkeiten: ["text", "foto", "video", "gestaltung"],
  saeulen: ["Vorher und nachher auf der Baustelle", "Einblick in den Alltag", "Tipps vom Maler und Gipser", "Team und Lehrlinge", "Aktionen im Jahr"],
  produktionstag: "Montag",
  aufwand: { kurzvideo: 2.5 },
};

describe("posting-plan: PDF und Word", () => {
  it("baut den Plan als PDF mit Titel und mehreren Seiten", async () => {
    const doc = toDocument(buildPlan(voll), "Malerei Keller, Gossau");
    const bytes = await buildPdf({ ...doc, datum: "05.10.2026" }, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(10);
    expect(pdf.getTitle()).toBe("Posting-Plan für vier Wochen");
  });

  it("baut den Plan als Word-Datei mit Wochen, Produktionsblock, Annahmen und Hinweisen", async () => {
    const bytes = await buildDocx(toDocument(buildPlan(voll), "Malerei Keller, Gossau"));
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const text of ["Woche 1", "Woche 4", "Produktionsblock", "Annahmen", "Hinweise", "am Stück", "Kurzvideo", "(angepasst)", "Jede Woche liegt im Budget"]) expect(xml).toContain(text);
  });

  it("baut auch einen Plan mit einer Woche ohne Beitrag", async () => {
    const plan = buildPlan({ ...voll, kanaele: ["newsletter"], stunden: 3 });
    const bytes = await buildPdf(toDocument(plan), fonts);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
