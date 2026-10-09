import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "posting-plan",
  name: "Posting-Plan nach Zeitbudget",
  category: "inhalte",
  audience: "beide",
  tagline: "Aus deinen Wochenstunden wird ein Plan für vier Wochen: Kanäle, Formate, Säulen und ein fester Produktionstag.",
  keyword: "Posting-Plan",
  related: ["inhalte-saeulen", "feiertagskalender", "caption-baukasten"],
  needsServer: false,
  usesProfile: ["firma", "kanaele", "contentSaeulen", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx", "csv"],
  estimatedMinutes: 5,
  pathStep: { path: "inhalte", order: 15 },
  featured: false,
});
