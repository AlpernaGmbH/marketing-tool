import fs from "node:fs";
import path from "node:path";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFPage } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { FONT_PATHS } from "@/lib/export/fonts";
import type { PdfFonts } from "@/lib/export/pdf";
import { BEISPIEL_FORM, BEISPIEL_KI } from "./beispiel";
import { buildDossierPdf } from "./export";
import { toDocument } from "./logic";

// Das PDF entsteht ohne Browser; die Schriften kommen aus public/fonts wie im Browser über loadPdfFonts.
const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = {
  title: read(FONT_PATHS.title),
  heading: read(FONT_PATHS.heading),
  body: read(FONT_PATHS.body),
  bodyMedium: read(FONT_PATHS.bodyMedium),
};

/** Inhalt einer Seite als Text, damit die Farboperatoren («r g b rg») zu finden sind. */
function content(doc: PDFDocument, page: PDFPage): string {
  const node = page.node.Contents();
  const streams = node instanceof PDFArray ? node.asArray().map((r) => doc.context.lookup(r)) : [node];
  return streams
    .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
    .map((s) => new TextDecoder().decode(decodePDFRawStream(s).decode()))
    .join("\n");
}

/** Kommt die Farbe (Hex) im Inhalt als Füllfarbe («rg») oder Strichfarbe («RG») vor? Die Zahlen stehen mit voller Genauigkeit im PDF. */
function hasColor(text: string, hex: string, op: "rg" | "RG"): boolean {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const re = new RegExp(`(\\d(?:\\.\\d+)?) (\\d(?:\\.\\d+)?) (\\d(?:\\.\\d+)?) ${op}\\b`, "g");
  for (const m of text.matchAll(re)) {
    if ([m[1], m[2], m[3]].every((v, i) => Math.abs(Number(v) - want[i]) < 0.002)) return true;
  }
  return false;
}

describe("sponsoring-dossier: PDF mit Vereinsfarbe", () => {
  const doc = toDocument(BEISPIEL_FORM, null, { datum: "05.10.2026" });

  it("baut ein A4-PDF mit Deckblatt und mindestens einer Textseite und setzt Titel und Autor", async () => {
    const bytes = await buildDossierPdf(doc, "#1B3A6B", fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(pdf.getTitle()).toBe("Sponsoring FC Trogen");
    expect(pdf.getAuthor()).toBe("FC Trogen");
  });

  it("malt Deckblatt, Linie im Kopf und Tabellenkopf in der Vereinsfarbe", async () => {
    const pdf = await PDFDocument.load(await buildDossierPdf(doc, "#1B3A6B", fonts));
    const cover = content(pdf, pdf.getPage(0));
    expect(hasColor(cover, "#1B3A6B", "rg")).toBe(true);
    const body = content(pdf, pdf.getPage(1));
    // Linie im Kopf (Strichfarbe «RG»), Tabellenkopf und Balken vor der Überschrift (Füllfarbe «rg»)
    expect(hasColor(body, "#1B3A6B", "RG")).toBe(true);
    expect(hasColor(body, "#1B3A6B", "rg")).toBe(true);
    // Schrift auf der dunklen Farbe: Weiss
    expect(hasColor(cover, "#FFFFFF", "rg")).toBe(true);
  });

  it("nimmt auf einer hellen Vereinsfarbe Tinte als Schrift und fällt bei ungültigen Werten auf die Standardfarbe zurück", async () => {
    const hell = await PDFDocument.load(await buildDossierPdf(doc, "#9AA0A6", fonts));
    const coverHell = content(hell, hell.getPage(0));
    expect(hasColor(coverHell, "#9AA0A6", "rg")).toBe(true);
    expect(hasColor(coverHell, "#FFFFFF", "rg")).toBe(false);
    const kaputt = await PDFDocument.load(await buildDossierPdf(doc, "blau", fonts));
    expect(hasColor(content(kaputt, kaputt.getPage(0)), "#111A28", "rg")).toBe(true);
  });

  it("legt ein langes Dossier mit KI-Texten, vielen Referenzen und langem Namen auf mehrere Seiten um, ohne zu werfen", async () => {
    const lang = structuredClone(BEISPIEL_FORM);
    lang.verein = "Fussballclub Trogen mit sehr langem Vereinsnamen und Juniorenabteilung Appenzeller Mittelland";
    lang.zielgruppe = "Betriebe aus der Region, die bei Familien sichtbar sein wollen. ".repeat(4).slice(0, 300);
    const d = toDocument(lang, BEISPIEL_KI, { datum: "05.10.2026" });
    d.blocks.push(...Array.from({ length: 60 }, (_, i) => ({ type: "paragraph" as const, text: `Absatz ${i}. ${"Text ".repeat(50)}` })));
    const pdf = await PDFDocument.load(await buildDossierPdf(d, "#26324A", fonts));
    expect(pdf.getPageCount()).toBeGreaterThan(4);
    expect(pdf.getTitle()).toContain("Fussballclub Trogen");
  });

  it("baut auch das fast leere Dossier und ein Dossier ohne Untertitel und Datum", async () => {
    const leer = toDocument({ ...BEISPIEL_FORM, verein: "Turnverein", anlass: "", ort: "", kanton: "", referenzen: "", zahlen: { ...BEISPIEL_FORM.zahlen, aktive: "", zuschauer: "", anlaesse: "", instagram: "", facebook: "", besuche: "", medien: "" } }, null);
    expect(leer.subtitle).toBeUndefined();
    const pdf = await PDFDocument.load(await buildDossierPdf(leer, "#111A28", fonts));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("zeichnet das Häkchen als zwei Linien statt als Zeichen, das die Schrift nicht kennt", async () => {
    const linien = async (cell: string): Promise<number> => {
      const model = {
        title: "Tabelle",
        filename: "tabelle",
        blocks: [{ type: "table" as const, header: ["Gegenleistung", "Bronze"], rows: [["A", cell], ["B", cell], ["C", cell]] }],
      };
      const pdf = await PDFDocument.load(await buildDossierPdf(model, "#1B3A6B", fonts));
      return (content(pdf, pdf.getPage(1)).match(/ l\n/g) ?? []).length;
    };
    // Drei Häkchen = sechs Linien mehr als dieselbe Tabelle mit Strichen
    expect((await linien("✓")) - (await linien("–"))).toBe(6);
  });
});
