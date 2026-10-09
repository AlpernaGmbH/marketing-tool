import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "caption-baukasten",
  name: "Caption-Baukasten",
  category: "inhalte",
  audience: "kmu",
  tagline: "Drei Fragen, eine KI schreibt Hook, Text und Aufforderung für Instagram, LinkedIn, Facebook und Google.",
  keyword: "Caption schreiben",
  related: ["inhalte-ideen", "textcheck", "post-generator"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "positionierung", "marke", "personas"],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 3,
  pathStep: { path: "inhalte", order: 6 },
  featured: false,
});
