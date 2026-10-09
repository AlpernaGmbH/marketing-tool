import { z } from "zod";
import { PROFILE_FIELDS } from "@/lib/profile-fields";

// Getrennt von lib/registry.ts: tool.config.ts-Dateien importieren defineTool,
// die Registry importiert tools/index.ts (und damit alle tool.config.ts).
// Läge defineTool in der Registry, entstünde ein Zirkelimport.

// Vier Kategorien (Entscheid 09.10.2026). «KI», «Schweiz», «Content» und «Vereine» sind weder Kategorie noch Menüpunkt;
// alte Adressen leitet lib/redirects.ts weiter. Ein Pfad (pathStep) ist die Reihenfolge der Werkzeuge innerhalb einer Kategorie.
export const CATEGORIES = ["strategie", "analyse", "inhalte", "praktisches"] as const;
export type Category = (typeof CATEGORIES)[number];

// Seiten unter /[kategorie]: genau die Kategorien.
export const CATEGORY_PAGES = CATEGORIES;
export type CategoryPage = (typeof CATEGORY_PAGES)[number];

export const CATEGORY_LABELS: Record<CategoryPage, string> = {
  strategie: "Strategie",
  analyse: "Analyse",
  inhalte: "Inhalte",
  praktisches: "Praktisches",
};

/** Eine Zeile je Kategorie für Menü, Startseite und Fusszeile. */
export const CATEGORY_TAGLINES: Record<CategoryPage, string> = {
  strategie: "Wen du erreichst, was du versprichst, wo du auftrittst.",
  analyse: "Wo du stehst: Auftritt, Konkurrenz, Zahlen.",
  inhalte: "Beiträge, Texte und Grafiken, die du wirklich veröffentlichst.",
  praktisches: "QR-Codes, Links, Öffnungszeiten und Termine, sofort einsatzbereit.",
};

export const OUTPUTS = ["pdf", "docx", "copy", "csv", "ics", "png", "zip"] as const;

const toolSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: nur a-z, 0-9 und Bindestriche"),
  name: z.string().min(2),
  category: z.enum(CATEGORIES),
  audience: z.enum(["kmu", "verein", "beide"]),
  tagline: z.string().min(10).max(110),
  keyword: z.string().min(3),
  related: z.array(z.string()).max(3),
  needsServer: z.boolean(),
  usesProfile: z.array(z.enum(PROFILE_FIELDS)),
  writesProfile: z.array(z.enum(PROFILE_FIELDS)),
  outputs: z.array(z.enum(OUTPUTS)).min(1),
  estimatedMinutes: z.number().int().positive(),
  pathStep: z.object({
    path: z.enum(CATEGORY_PAGES),
    order: z.number().int().positive(),
  }),
  featured: z.boolean(),
});

export type ToolConfig = z.infer<typeof toolSchema>;

/** Validiert eine Tool-Konfiguration beim Laden (Build schlägt bei Fehlern fehl). */
export function defineTool(config: ToolConfig): ToolConfig {
  return toolSchema.parse(config);
}
