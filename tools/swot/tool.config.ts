import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "swot",
  name: "SWOT-Analyse",
  category: "strategie",
  audience: "beide",
  tagline: "Stärken, Schwächen, Chancen und Risiken deines Marketings, mit Fakten aus deinen Checks und Folgerungen.",
  keyword: "SWOT-Analyse",
  related: ["reifegrad-check", "digitaler-auftritt-check", "positionierung"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "groesse", "positionierung"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "strategie", order: 9 },
  featured: false,
});
