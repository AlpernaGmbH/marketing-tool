import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "angebotsgrafik",
  name: "Angebotsgrafik",
  category: "inhalte",
  audience: "beide",
  tagline: "Angebot der Woche als Grafik: drei Vorlagen, vier Formate, PNG zum Herunterladen, Logo bleibt im Browser.",
  keyword: "Angebotsgrafik",
  related: ["post-generator", "caption-baukasten", "anlass-planer"],
  needsServer: false,
  usesProfile: ["firma", "organisationstyp", "website", "ort"],
  writesProfile: [],
  outputs: ["png", "zip"],
  estimatedMinutes: 5,
  pathStep: { path: "inhalte", order: 13 },
  featured: false,
});
