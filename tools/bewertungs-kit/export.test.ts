import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { FONT_PATHS } from "@/lib/export/fonts";
import type { PdfFonts } from "@/lib/export/pdf";
import { buildStandPdf, buildStickerSheetPdf, qrDataUrl, qrPng, type KitInput } from "./export";
import { PAGES } from "./logic";

// Die PDFs entstehen ohne Browser; die Schriften kommen aus public/fonts wie im Browser über loadPdfFonts.
const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = {
  title: read(FONT_PATHS.title),
  heading: read(FONT_PATHS.heading),
  body: read(FONT_PATHS.body),
  bodyMedium: read(FONT_PATHS.bodyMedium),
};
const input: KitInput = { firma: "Malerei Keller", link: "https://g.page/r/CaBcDeFgHiJkLmNo/review", anrede: "du", farbe: "#26324A" };

describe("bewertungs-kit: export", () => {
  it("baut den Aufsteller A6 mit zwei Seiten in A6", async () => {
    const pdf = await PDFDocument.load(await buildStandPdf("a6", input, fonts));
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(PAGES.a6.w, 1);
    expect(height).toBeCloseTo(PAGES.a6.h, 1);
    expect(pdf.getTitle()).toBe("Aufsteller A6: Malerei Keller");
  });

  it("baut den Aufsteller A5 in A5, auch mit Sie-Anrede, langem Namen und Place-ID-Link", async () => {
    const lang: KitInput = {
      firma: "Keller Malerei und Gipserei GmbH, Gossau SG, Niederlassung Flawil",
      link: "https://search.google.com/local/writereview?placeid=ChIJgUbEo8cfqokR5lP9_Wh_DaM",
      anrede: "sie",
      farbe: "#0F0F0E",
    };
    const pdf = await PDFDocument.load(await buildStandPdf("a5", lang, fonts));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(1).getSize().width).toBeCloseTo(PAGES.a5.w, 1);
  });

  it("baut den Aufkleber-Bogen als eine A4-Seite", async () => {
    const pdf = await PDFDocument.load(await buildStickerSheetPdf(input, fonts));
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(PAGES.a4.w, 1);
    expect(height).toBeCloseTo(PAGES.a4.h, 1);
  });

  it("liefert den QR-Code als PNG", async () => {
    expect((await qrDataUrl(input.link)).startsWith("data:image/png;base64,")).toBe(true);
    const png = await qrPng(input.link, 256);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
