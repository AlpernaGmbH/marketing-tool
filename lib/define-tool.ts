import { z } from "zod";
import { PROFILE_FIELDS } from "@/lib/profile-fields";

// Getrennt von lib/registry.ts: tool.config.ts-Dateien importieren defineTool,
// die Registry importiert tools/index.ts (und damit alle tool.config.ts).
// Läge defineTool in der Registry, entstünde ein Zirkelimport.

export const CATEGORIES = ["strategie", "content", "analyse", "schweiz", "ki"] as const;
export type Category = (typeof CATEGORIES)[number];

// Seiten unter /[kategorie]: die fünf Kategorien plus «vereine» (nach audience).
export const CATEGORY_PAGES = [...CATEGORIES, "vereine"] as const;
export type CategoryPage = (typeof CATEGORY_PAGES)[number];

export const CATEGORY_LABELS: Record<CategoryPage, string> = {
  strategie: "Strategie",
  content: "Content",
  analyse: "Analyse",
  schweiz: "Schweiz",
  ki: "KI",
  vereine: "Für Vereine",
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
