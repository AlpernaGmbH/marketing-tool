import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import anlaesseJson from "@/data/anlaesse-ch.json";
import feiertageJson from "@/data/feiertage.json";
import schulferienJson from "@/data/schulferien.json";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS } from "@/lib/export/fonts";
import { buildPdf, type PdfFonts } from "@/lib/export/pdf";
import { buildCalendar, parseAnlaesse, parseFeiertage, parseSchulferien, toDocument } from "./logic";

// Die Jahresübersicht muss sich als PDF und als Word-Datei bauen lassen, auch mit vielen Terminen und langen Titeln.

const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };
const data = { anlaesse: parseAnlaesse(anlaesseJson), ferien: parseSchulferien(schulferienJson), feiertage: parseFeiertage(feiertageJson) };

const termine = Array.from({ length: 20 }, (_, i) => ({ datum: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`, titel: `Termin ${i} mit einem längeren Titel für den Umbruch äöü` }));

describe("feiertagskalender: PDF und Word", () => {
  it("baut die Jahresübersicht als PDF über mehrere A4-Seiten", async () => {
    const cal = buildCalendar({ jahr: 2026, kanton: "SG", branche: "handwerk", kanaele: ["instagram", "google"], termine }, data);
    const doc = toDocument(cal, "Malerei Keller, Gossau");
    const bytes = await buildPdf({ ...doc, datum: "05.10.2026" }, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(10);
    expect(pdf.getTitle()).toBe("Feiertagskalender 2026");
  });

  it("baut die Jahresübersicht als Word-Datei mit allen Monaten", async () => {
    const cal = buildCalendar({ jahr: 2027, kanton: "ZH", branche: "gastronomie", kanaele: ["instagram"], termine: [] }, data);
    const bytes = await buildDocx(toDocument(cal, "Restaurant Sonne"));
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const monat of ["Januar 2027", "Juni 2027", "Dezember 2027", "Muttertag", "Quellen und Hinweise"]) expect(xml).toContain(monat);
  });
});
