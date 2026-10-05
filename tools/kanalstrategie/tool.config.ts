import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "kanalstrategie",
  name: "Kanalstrategie",
  category: "strategie",
  audience: "beide",
  tagline: "Welche Kanäle zu Ziel, Kundschaft und Zeit passen: mit Rolle, erstem Schritt und Plan für drei Monate.",
  keyword: "Kanalstrategie",
  related: ["zielgruppen-segmente", "posting-plan", "kundenweg"],
  needsServer: false,
  usesProfile: ["organisationstyp", "firma", "branche", "kanaele"],
  writesProfile: ["kanaele"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "strategie", order: 12 },
  featured: false,
});
