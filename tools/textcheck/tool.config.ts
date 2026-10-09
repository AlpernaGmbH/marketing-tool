import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "textcheck",
  name: "Textcheck",
  category: "analyse",
  audience: "kmu",
  tagline: "Floskeln, Formfehler und Schweizer Schreibweise sofort, Rechtschreibung und Grammatik mit KI.",
  keyword: "Textcheck",
  related: ["digitaler-auftritt-check", "newsletter-check", "ideen-aus-website"],
  needsServer: true,
  usesProfile: [],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 2,
  pathStep: { path: "analyse", order: 6 },
  featured: false,
});
