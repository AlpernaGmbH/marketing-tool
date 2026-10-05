// Datei des Kampagnen-Planers für den Browser: die Kalenderdatei (.ics).
// Die Funktion liefert nur Bytes, Dateiname und Typ; den Download löst Tool.tsx über guardDownload und downloadBytes aus.
// PDF und Word kommen aus DocumentExport (lib/export). logic.ts importiert diese Datei nicht.

import { buildIcs, icsFilename, type Plan, type PlanInput } from "./logic";

export type FileResult = { bytes: Uint8Array; filename: string; mime: string };

export const ICS_MIME = "text/calendar;charset=utf-8";

/** Kalenderdatei als UTF-8: ein ganztägiges Ereignis je Meilenstein (Start jeder Phase, Ende, Auswertung). */
export function icsFile(plan: Plan, input: PlanInput, now: Date = new Date()): FileResult {
  return { bytes: new TextEncoder().encode(buildIcs(plan, input, { now })), filename: icsFilename(input), mime: ICS_MIME };
}
