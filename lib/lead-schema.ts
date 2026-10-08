import { z } from "zod";

// Gemeinsam für das E-Mail-Fenster (Browser) und /api/lead (Server). Zugang v3: die Adresse (Pflicht) und die Einwilligung zur
// Kontaktaufnahme (freiwillig, nDSG Art. 6 Abs. 6); ohne Häkchen gibt es das Ergebnis trotzdem, im CRM steht dann «Nein».
export const leadSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Bitte gib eine gültige E-Mail-Adresse an."),
  consent: z.boolean().default(false),
  tool: z.string().min(1).max(80),
  // Honeypot: für Menschen unsichtbar, muss leer bleiben.
  honeypot: z.string().max(0).optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;

/** Ein Ergebnis für das CRM (/api/result): Werkzeug, was die Person eingegeben hat und was herauskam. */
export const resultSchema = z.object({
  tool: z.string().min(1).max(80),
  eingabe: z.string().max(20_000),
  ausgabe: z.string().max(20_000),
  /** Firma aus dem Firmenprofil, falls vorhanden (wie shortText dort). */
  firma: z.string().trim().max(200).optional(),
});

export type ResultInput = z.infer<typeof resultSchema>;
