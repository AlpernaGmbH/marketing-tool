import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "story-post",
  name: "Story-Post-Builder",
  category: "inhalte",
  audience: "beide",
  tagline: "Aus sechs Antworten wird ein Beitrag mit Hook für LinkedIn und Instagram, mit Zeichengrenze und Lesezeit.",
  keyword: "Story-Post",
  related: ["caption-baukasten", "post-generator", "inhalte-saeulen"],
  needsServer: false,
  usesProfile: ["firma", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "docx", "pdf"],
  estimatedMinutes: 6,
  pathStep: { path: "inhalte", order: 7 },
  featured: false,
});
