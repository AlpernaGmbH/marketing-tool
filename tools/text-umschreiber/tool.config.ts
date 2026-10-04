import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "text-umschreiber",
  name: "Text-Umschreiber",
  category: "content",
  audience: "kmu",
  tagline: "Schreibe deinen Text als LinkedIn-Post, Newsletter, Medienmitteilung oder in einem anderen Stil neu.",
  keyword: "Text-Umschreiber",
  related: ["textcheck", "digitaler-auftritt-check", "newsletter-check"],
  needsServer: true,
  usesProfile: [],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 3,
  pathStep: { path: "content", order: 2 },
  featured: false,
});
