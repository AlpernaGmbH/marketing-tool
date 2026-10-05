import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "botschaften",
  name: "Kernbotschaften",
  category: "strategie",
  audience: "kmu",
  tagline: "Eine Hauptbotschaft und je ein Satz pro Zielgruppe und Kanal, mit Beleg statt Behauptung.",
  keyword: "Kernbotschaften",
  related: ["nutzenversprechen", "positionierung", "persona"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "positionierung", "primaersegment", "personas", "zielgruppen"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "strategie", order: 8 },
  featured: false,
});
