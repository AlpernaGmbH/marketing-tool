import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "story-post",
  name: "Story-Post-Builder",
  category: "inhalte",
  audience: "kmu",
  tagline: "Aus sechs Stichworten schreibt eine KI einen Beitrag mit Hook für LinkedIn und Instagram, mit Lesezeit.",
  keyword: "Story-Post",
  related: ["caption-baukasten", "post-generator", "inhalte-saeulen"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "marke", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "docx", "pdf"],
  estimatedMinutes: 5,
  pathStep: { path: "inhalte", order: 7 },
  featured: false,
});
