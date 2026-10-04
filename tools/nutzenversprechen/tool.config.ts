import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "nutzenversprechen",
  name: "Nutzenversprechen",
  category: "strategie",
  audience: "kmu",
  tagline: "Ein Satz, der sagt, was deine Kundschaft von dir hat, in drei Längen und als Textbausteine für jeden Kanal.",
  keyword: "Nutzenversprechen",
  related: ["positionierung", "icp-builder", "text-umschreiber"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "primaersegment", "zielgruppen", "positionierung"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "strategie", order: 5 },
  featured: false,
});
