import type { ToolConfig } from "@/lib/define-tool";
import smokeTool from "./_smoke/tool.config";

// Explizite Liste aller Tools (kein Glob). Neue Tools trägt `npm run new-tool <slug>` ein.
// Reihenfolge: Etappen-Reihenfolge, nicht alphabetisch.
const productionTools: ToolConfig[] = [
  // new-tool:configs
];

// Nur für den Playwright-Smoke-Test: Die Zugangs-Routen validieren den Tool-Slug
// gegen die Registry, in Etappe 1a gibt es aber noch kein echtes Tool.
// Wird mit Etappe 1b entfernt (Smoke läuft dann gegen digitaler-auftritt-check).
const smokeTools: ToolConfig[] = process.env.MT_SMOKE === "1" ? [smokeTool] : [];

export const tools: ToolConfig[] = [...productionTools, ...smokeTools];
