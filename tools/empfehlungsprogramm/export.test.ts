import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { FONT_PATHS } from "@/lib/export/fonts";
import type { PdfFonts } from "@/lib/export/pdf";
import { PAGES } from "@/tools/bewertungs-kit/logic";
import { buildCardPdf, qrDataUrl, qrPng } from "./export";
import { EMPTY_FORM, kartenInhalt, rechne, toEingabe, zielOf, type Anrede, type Kontext } from "./logic";

// Die Karte entsteht ohne Browser; die Schriften kommen aus public/fonts wie im Browser über loadPdfFonts.
const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = {
  title: read(FONT_PATHS.title),
  heading: read(FONT_PATHS.heading),
  body: read(FONT_PATHS.body),
  bodyMedium: read(FONT_PATHS.bodyMedium),
};

const KELLER: Kontext = { verein: false, firma: "Malerei Keller, Gossau", website: "malerei-keller.ch" };
const FORM = { ...EMPTY_FORM, kundenwert: "3000", marge: "25", anreiz: "gutschein" as const, beide: true, kanal: "karte" as const, nummer: "079 123 45 67", anrede: "du" as const };

function inhalt(anrede: Anrede, kontext: Kontext, nummer: string, website: string) {
  const rechnung = rechne(toEingabe(FORM)!);
  return kartenInhalt({ anrede, rechnung, kontext, ziel: zielOf(nummer, website, kontext) });
}

describe("empfehlungsprogramm: Karte als PDF", () => {
  it("baut die Karte mit zwei Seiten in A6 hoch", async () => {
    const pdf = await PDFDocument.load(await buildCardPdf(inhalt("du", KELLER, "079 123 45 67", ""), fonts));
    expect(pdf.getPageCount()).toBe(2);
    for (const i of [0, 1]) {
      const { width, height } = pdf.getPage(i).getSize();
      expect(width).toBeCloseTo(PAGES.a6.w, 1);
      expect(height).toBeCloseTo(PAGES.a6.h, 1);
    }
    expect(pdf.getTitle()).toBe("Empfehlungskarte A6: Malerei Keller, Gossau");
    expect(pdf.getCreator()).toBe("tools.alperna.ch");
  });

  it("zeichnet den QR-Code nur, wenn es ein Ziel gibt", async () => {
    const mit = await buildCardPdf(inhalt("du", KELLER, "079 123 45 67", ""), fonts);
    const ohne = await buildCardPdf(inhalt("du", KELLER, "", ""), fonts);
    expect(mit.length).toBeGreaterThan(ohne.length + 1000);
    expect((await PDFDocument.load(ohne)).getPageCount()).toBe(2);
  });

  it("baut die Karte in Sie-Form für einen Verein mit sehr langem Namen und Website als Ziel", async () => {
    const lang: Kontext = { verein: true, firma: "Turnverein und Damenriege der Gemeinde Trogen mit Untersektion Jugendriege und Seniorenturnen", website: "tv-trogen.ch" };
    const pdf = await PDFDocument.load(await buildCardPdf(inhalt("sie", lang, "", lang.website), fonts));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize().width).toBeCloseTo(PAGES.a6.w, 1);
  });

  it("kommt ohne Firma und mit einem sehr langen Link im Code zurecht", async () => {
    const ohneFirma: Kontext = { verein: false, firma: "", website: "" };
    const pdf = await PDFDocument.load(await buildCardPdf(inhalt("du", ohneFirma, "079 123 45 67", ""), fonts));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe("Empfehlungskarte A6");
    const web = inhalt("du", KELLER, "", `https://malerei-keller.ch/${"empfehlung-".repeat(60)}`);
    expect((await PDFDocument.load(await buildCardPdf(web, fonts))).getPageCount()).toBe(2);
  });

  it("liefert den QR-Code als PNG und als Bild für den Bildschirm", async () => {
    expect((await qrDataUrl("https://wa.me/41791234567")).startsWith("data:image/png;base64,")).toBe(true);
    const png = await qrPng("https://wa.me/41791234567", 256);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
