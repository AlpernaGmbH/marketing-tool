import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "budget-planer",
  name: "Marketing-Budget-Planer",
  category: "strategie",
  audience: "beide",
  tagline: "Dein Marketing-Budget für zwölf Monate: Rahmen, Kanäle, Eigenleistung und Werbebudget, als Tabelle und CSV.",
  keyword: "Marketing-Budget",
  related: ["swot", "content-saeulen", "reifegrad-check"],
  needsServer: false,
  usesProfile: ["firma", "branche", "groesse", "kanaele", "budgetJahr", "organisationstyp"],
  writesProfile: ["budgetJahr"],
  outputs: ["copy", "pdf", "docx", "csv"],
  estimatedMinutes: 4,
  pathStep: { path: "strategie", order: 13 },
  featured: false,
});
