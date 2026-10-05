import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "kundenweg",
  name: "Kundenweg-Mapper",
  category: "strategie",
  audience: "beide",
  tagline: "Der Weg deiner Kundschaft in sechs Phasen: wo sie dir begegnet, was fehlt, und was du zuerst ergänzt.",
  keyword: "Kundenweg",
  related: ["positionierung", "bewertungs-kit", "empfehlungsprogramm"],
  needsServer: false,
  usesProfile: ["firma", "branche", "kanaele", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 8,
  pathStep: { path: "strategie", order: 13 },
  featured: false,
});
