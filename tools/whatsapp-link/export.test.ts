import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { FONT_PATHS } from "@/lib/export/fonts";
import type { PdfFonts } from "@/lib/export/pdf";
import { buildStickerPdf, bytesFromDataUrl, qrPng, qrSvg } from "./export";
import { A4, buildWaLink, messageFor } from "./logic";

// Unter Node rendert qrcode PNG und SVG ohne Canvas; pdf-lib läuft ebenfalls. Die Schriften kommen aus public/fonts.
const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };
const link = buildWaLink("41791234567", messageFor("anfrage", "Malerei Keller"));

describe("whatsapp-link: export", () => {
  it("erzeugt PNG und SVG des QR-Codes", async () => {
    const png = await qrPng(link, 512);
    expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const svg = await qrSvg(link);
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("#0F0F0E");
    expect(bytesFromDataUrl("data:text/plain;base64,aGk=")).toEqual(new Uint8Array([104, 105]));
  });

  it("baut den Aufkleber-Bogen als eine A4-Seite mit eingebettetem Bild, auch ohne Firma", async () => {
    const qr = await qrPng(link, 512);
    for (const firma of ["Malerei Keller, Gossau", "", "Žužu ✓ Škoda"]) {
      const bytes = await buildStickerPdf({ firma, display: "079 123 45 67", displayInternational: "+41 79 123 45 67", qr, fonts });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(width).toBeCloseTo(A4.w, 1);
      expect(height).toBeCloseTo(A4.h, 1);
      expect(doc.getTitle()).toBe("WhatsApp-Aufkleber");
    }
  });
});
