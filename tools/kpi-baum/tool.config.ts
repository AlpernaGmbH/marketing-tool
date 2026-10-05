import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "kpi-baum",
  name: "Ziel- und KPI-Baum",
  category: "strategie",
  audience: "beide",
  tagline: "Vom Unternehmensziel zu den Kennzahlen: Baum, SMART-Check, Rückwärtsrechnung und Messplan als PDF und CSV.",
  keyword: "KPI",
  related: ["budget-planer", "reifegrad-check", "strategie-einseiter"],
  needsServer: false,
  usesProfile: ["firma", "branche", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx", "csv"],
  estimatedMinutes: 8,
  pathStep: { path: "strategie", order: 13 },
  featured: false,
});
