import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "angebotsgrafik",
  name: "Angebotsgrafik",
  category: "content",
  audience: "beide",
  tagline: "Angebot der Woche als Grafik: drei Vorlagen, vier Formate, PNG zum Herunterladen, Logo bleibt im Browser.",
  keyword: "Angebotsgrafik",
  related: ["post-generator", "caption-baukasten", "anlass-planer"],
  needsServer: false,
  usesProfile: ["firma", "organisationstyp", "website", "ort"],
  writesProfile: [],
  outputs: ["png", "zip"],
  estimatedMinutes: 5,
  pathStep: { path: "content", order: 12 },
  featured: false,
});
