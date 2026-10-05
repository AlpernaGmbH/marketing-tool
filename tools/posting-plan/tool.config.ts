import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "posting-plan",
  name: "Posting-Plan nach Zeitbudget",
  category: "content",
  audience: "beide",
  tagline: "Aus deinen Wochenstunden wird ein Plan für vier Wochen: Kanäle, Formate, Säulen und ein fester Produktionstag.",
  keyword: "Posting-Plan",
  related: ["content-saeulen", "content-kalender", "caption-baukasten"],
  needsServer: false,
  usesProfile: ["firma", "kanaele", "contentSaeulen", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx", "csv"],
  estimatedMinutes: 5,
  pathStep: { path: "content", order: 11 },
  featured: false,
});
