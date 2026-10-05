import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "medienmitteilung",
  name: "Medienmitteilung für die Lokalpresse",
  category: "content",
  audience: "kmu",
  tagline: "Aus Anlass und W-Fragen eine Medienmitteilung im Nachrichtenstil, geprüft auf Lead, Länge und Superlative.",
  keyword: "Medienmitteilung",
  related: ["positionierung", "textcheck", "content-kalender"],
  needsServer: true,
  usesProfile: ["firma", "ort", "kanton", "website", "positionierung"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "content", order: 8 },
  featured: false,
});
