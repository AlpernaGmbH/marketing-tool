import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "zielgruppen-segmente",
  name: "Zielgruppen-Segmente",
  category: "strategie",
  audience: "beide",
  tagline: "Bis zu vier Segmente bewerten: Matrix aus Attraktivität und Erreichbarkeit, Fokus und Botschaft je Segment.",
  keyword: "Zielgruppen-Segmente",
  related: ["icp-builder", "persona", "positionierung"],
  needsServer: false,
  usesProfile: ["firma", "branche", "organisationstyp", "zielgruppen", "primaersegment"],
  writesProfile: ["zielgruppen", "primaersegment"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 8,
  pathStep: { path: "strategie", order: 2 },
  featured: false,
});
