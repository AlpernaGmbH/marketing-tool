import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "text-umschreiber",
  name: "Text-Umschreiber",
  category: "inhalte",
  audience: "kmu",
  tagline: "Schreibe deinen Text als LinkedIn-Post, Newsletter, Medienmitteilung oder in einem anderen Stil neu.",
  keyword: "Text-Umschreiber",
  related: ["textcheck", "digitaler-auftritt-check", "newsletter-check"],
  needsServer: true,
  usesProfile: [],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 3,
  pathStep: { path: "inhalte", order: 8 },
  featured: false,
});
