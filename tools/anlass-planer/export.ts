// Dateien des Anlass-Zeitplans für den Browser: Kalenderdatei (.ics) und Druck-PDF.
// Die Funktionen liefern nur Bytes, Dateiname und Typ; den Download löst Tool.tsx über guardDownload und downloadBytes aus.
// logic.ts importiert diese Datei nicht.

import { dateCH } from "@/lib/ch";
import type { DocumentModel } from "@/lib/export/model";
import type { PdfFonts } from "@/lib/export/pdf";
import { buildIcs, icsFilename, pdfFilename, type Plan, type PlanInput } from "./logic";

export type FileResult = { bytes: Uint8Array; filename: string; mime: string };

export const ICS_MIME = "text/calendar;charset=utf-8";
export const PDF_MIME = "application/pdf";

/** Kalenderdatei als UTF-8: ein ganztägiges Ereignis je Aufgabe und eines für den Anlass. */
export function icsFile(plan: Plan, input: PlanInput, now: Date = new Date()): FileResult {
  return { bytes: new TextEncoder().encode(buildIcs(plan, input, { now })), filename: icsFilename(input), mime: ICS_MIME };
}

/**
 * Druck-PDF (A4 hoch) aus dem Dokument des Zeitplans: Tabelle Datum, Aufgabe, Kanal, Erledigt-Kästchen, Firma im Kopf, Fuss
 * «Erstellt mit tools.alperna.ch». Die Schriften laden erst hier (im Test kommen sie als `fonts` von der Platte).
 */
export async function pdfFile(doc: DocumentModel, input: PlanInput, fonts?: PdfFonts, now: Date = new Date()): Promise<FileResult> {
  const [{ buildPdf }, loaded] = await Promise.all([import("@/lib/export/pdf"), fonts ? Promise.resolve(fonts) : import("@/lib/export/fonts").then((m) => m.loadPdfFonts())]);
  const bytes = await buildPdf({ ...doc, datum: doc.datum ?? dateCH(now) }, loaded);
  return { bytes, filename: pdfFilename(input), mime: PDF_MIME };
}
