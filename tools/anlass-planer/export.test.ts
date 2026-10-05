import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS } from "@/lib/export/fonts";
import type { PdfFonts } from "@/lib/export/pdf";
import { ICS_MIME, PDF_MIME, icsFile, pdfFile } from "./export";
import { KANAL_KEYS, buildPlan, toDocument, type PlanInput } from "./logic";

// Das Druck-PDF, die Kalenderdatei und die Word-Datei müssen sich auch mit vielen Aufgaben und langen Namen bauen lassen.

const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };
const NOW = new Date("2026-10-05T08:30:00Z");

const input: PlanInput = {
  typ: "dorffest",
  name: "Dorffest Trogen mit Märt, Musik und einem sehr langen Namen für den Umbruch äöü",
  datum: "2026-11-14",
  kanaele: [...KANAL_KEYS],
  inserate: true,
  organisation: "verein",
};

describe("anlass-planer: Dateien", () => {
  it("baut das Druck-PDF auf A4 hoch mit Titel und Firma", async () => {
    const plan = buildPlan(input, "2026-10-05");
    const doc = toDocument(plan, input, { firma: "FC Trogen", erledigt: ["g-ziel"] });
    const file = await pdfFile(doc, input, fonts, NOW);
    expect(file.mime).toBe(PDF_MIME);
    expect(file.filename).toMatch(/^zeitplan-dorffest-trogen-mit-maert-musik-und-einem-sehr-langen-namen-fuer-den-umbruch[a-z-]*\.pdf$/);
    expect(new TextDecoder().decode(file.bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(file.bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(6);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    expect(pdf.getTitle()).toBe(`Zeitplan: ${input.name}`);
    expect(pdf.getAuthor()).toBe("FC Trogen");
  });

  it("baut das PDF auch ohne Firma und mit dem kleinsten Plan", async () => {
    const klein: PlanInput = { ...input, typ: "generalversammlung", name: "GV", kanaele: ["website"], inserate: false };
    const plan = buildPlan(klein, "2026-10-05");
    const file = await pdfFile(toDocument(plan, klein), klein, fonts, NOW);
    const pdf = await PDFDocument.load(file.bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getAuthor()).toBe("Alperna");
  });

  it("schreibt die Kalenderdatei als UTF-8 mit Umlauten", () => {
    const plan = buildPlan(input, "2026-10-05");
    const file = icsFile(plan, input, NOW);
    expect(file.mime).toBe(ICS_MIME);
    expect(file.filename.endsWith(".ics")).toBe(true);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n /g, "")).toContain("Bei der Gemeinde nachfragen\\, ob eine Bewilligung nötig ist");
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(plan.aufgaben.length + 1);
  });

  it("baut die Word-Datei mit Tabelle und Hinweis", async () => {
    const plan = buildPlan(input, "2026-10-05");
    const bytes = await buildDocx(toDocument(plan, input, { firma: "FC Trogen", erledigt: ["g-ziel"] }));
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const text of ["Zeitplan:", "Erledigt", "Bei der Gemeinde nachfragen", "Richtwert von Alperna, keine Statistik", "[x]"]) expect(xml).toContain(text);
  });
});
