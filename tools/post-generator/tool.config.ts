import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "post-generator",
  name: "Post-Generator",
  category: "inhalte",
  audience: "beide",
  tagline: "Aus einer Idee ein Beitrag für Instagram, LinkedIn, Facebook oder Google, in deinem Ton und mit zwei Hooks.",
  keyword: "Social-Media-Beitrag schreiben",
  related: ["inhalte-ideen", "caption-baukasten", "markenplattform"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "positionierung", "marke", "contentSaeulen", "personas"],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 3,
  pathStep: { path: "inhalte", order: 5 },
  featured: true,
});
