import { z } from "zod";

// Gemeinsam für Formular (Browser) und /api/lead (Server).
export const leadSchema = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(120),
  firma: z.string().trim().min(2, "Bitte gib deine Firma oder deinen Verein an.").max(160),
  email: z.string().trim().toLowerCase().max(254).email("Bitte gib eine gültige E-Mail-Adresse an."),
  telefon: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+()/\s.-]*$/, "Bitte gib eine gültige Telefonnummer an.")
    .optional(),
  consent: z.literal(true, { message: "Bitte stimm der Kontaktaufnahme zu." }),
  tool: z.string().min(1).max(80),
  // Honeypot: für Menschen unsichtbar, muss leer bleiben.
  honeypot: z.string().max(0).optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;
