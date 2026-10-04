import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "persona",
  name: "Persona-Generator",
  category: "strategie",
  audience: "kmu",
  tagline: "Aus deiner Zielgruppe wird eine konkrete Person, an die du jeden Text richtest.",
  keyword: "Persona",
  related: ["icp-builder", "positionierung", "text-umschreiber"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "primaersegment", "zielgruppen"],
  writesProfile: ["personas"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "strategie", order: 3 },
  featured: false,
});
