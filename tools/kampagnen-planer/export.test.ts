import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS } from "@/lib/export/fonts";
import { buildPdf, type PdfFonts } from "@/lib/export/pdf";
import { ICS_MIME, icsFile } from "./export";
import { KANAL_KEYS, buildPlan, toDocument, type PlanInput } from "./logic";

// Das PDF, die Word-Datei und die Kalenderdatei müssen sich auch mit 16 Wochen, allen Kanälen und langen Texten bauen lassen.

const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };
const NOW = new Date("2026-10-05T08:30:00Z");
const HEUTE = "2026-10-05";

const beispiel: PlanInput = {
  ziel: "angebot",
  zielgruppe: "Hausbesitzerinnen und Hausbesitzer in Gossau und Umgebung",
  botschaft: "Wir streichen deine Fassade sauber und zum vereinbarten Termin, mit Festpreis nach der Besichtigung.",
  angebot: "Herbstaktion Fassadenanstrich",
  kanaele: ["website", "instagram", "aushang"],
  start: "2026-10-12",
  ende: "2026-12-06",
  budget: 1200,
  organisation: "kmu",
};

const lang: PlanInput = {
  ...beispiel,
  ziel: "kundschaft",
  zielgruppe: "Familien mit Kindern aus Trogen, Speicher, Teufen, Bühler und den umliegenden Gemeinden im Appenzeller Vorderland äöü",
  angebot: "Schnupperwochen mit Probetraining, Familienrabatt, Märt und einem sehr langen Namen für den Umbruch",
  kanaele: [...KANAL_KEYS],
  ende: "2027-01-31", // 16 Wochen
  budget: 25_000,
  organisation: "verein",
};

describe("kampagnen-planer: Dateien", () => {
  it("baut das PDF des Beispiels auf A4 hoch mit Titel, Firma und wenigen Seiten", async () => {
    const plan = buildPlan(beispiel, HEUTE);
    const doc = { ...toDocument(plan, beispiel, { firma: "Malerei Keller" }), datum: "05.10.2026" };
    const bytes = await buildPdf(doc, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(3);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    expect(pdf.getTitle()).toBe("Kampagnenbrief");
    expect(pdf.getAuthor()).toBe("Malerei Keller");
  });

  it("baut das PDF auch mit 16 Wochen, allen Kanälen, langen Texten und ohne Firma", async () => {
    const plan = buildPlan(lang, HEUTE);
    expect(plan.wochen).toBe(16);
    const bytes = await buildPdf(toDocument(plan, lang), fonts);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(12);
    expect(pdf.getAuthor()).toBe("Alperna");
  });

  it("baut das PDF ohne Budget", async () => {
    const i = { ...beispiel, budget: 0 };
    const pdf = await PDFDocument.load(await buildPdf(toDocument(buildPlan(i, HEUTE), i), fonts));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("baut die Word-Datei mit Steckbrief, Tabellen, Hinweisen und dem Richtwert", async () => {
    const plan = buildPlan(beispiel, HEUTE);
    const zip = await JSZip.loadAsync(await buildDocx(toDocument(plan, beispiel, { firma: "Malerei Keller" })));
    const xml = (await zip.file("word/document.xml")!.async("string")).replace(/&apos;/g, "'");
    for (const text of ["Kampagnenbrief", "Herbstaktion Fassadenanstrich", "Wochenplan", "Hauptphase", "CHF 1'200.-", "Zielwerte setzt du im Ziel- und KPI-Baum", "Richtwert von Alperna, keine Statistik"]) {
      expect(xml).toContain(text);
    }
  });

  it("schreibt die Kalenderdatei als UTF-8 mit Umlauten und einem Ereignis je Meilenstein", () => {
    const plan = buildPlan(lang, HEUTE);
    const file = icsFile(plan, lang, NOW);
    expect(file.mime).toBe(ICS_MIME);
    expect(file.filename.endsWith(".ics")).toBe(true);
    expect(file.filename).toMatch(/^kampagne-[a-z0-9-]+\.ics$/);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n /g, "")).toContain("Märt");
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(plan.meilensteine.length);
  });
});
