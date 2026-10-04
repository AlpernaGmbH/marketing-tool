import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "textcheck",
  name: "Textcheck",
  category: "content",
  audience: "kmu",
  tagline: "Wir finden Floskeln und Formfehler, prüfen die Schweizer Schreibweise und messen die Lesbarkeit.",
  keyword: "Textcheck",
  related: ["digitaler-auftritt-check", "newsletter-check", "ideen-aus-website"],
  needsServer: false,
  usesProfile: [],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 2,
  pathStep: { path: "content", order: 1 },
  featured: false,
});
