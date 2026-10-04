import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "textcheck",
  name: "Textcheck",
  category: "content",
  audience: "kmu",
  tagline: "Floskeln, Formfehler und Schweizer Schreibweise sofort, Rechtschreibung und Grammatik mit KI.",
  keyword: "Textcheck",
  related: ["digitaler-auftritt-check", "newsletter-check", "ideen-aus-website"],
  needsServer: true,
  usesProfile: [],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 2,
  pathStep: { path: "content", order: 1 },
  featured: false,
});
