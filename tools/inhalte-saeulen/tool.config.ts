import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "inhalte-saeulen",
  name: "Themensäulen",
  category: "inhalte",
  audience: "beide",
  tagline: "Vier bis fünf Themen, aus denen jeder Beitrag kommt, mit Beispielen und einem Wochenplan, der zu dir passt.",
  keyword: "Themensäulen",
  related: ["ideen-aus-website", "text-umschreiber", "persona"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "positionierung", "primaersegment", "personas", "kanaele"],
  writesProfile: ["contentSaeulen"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "inhalte", order: 2 },
  featured: false,
});
