import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "strategie-einseiter",
  name: "Strategie-Einseiter",
  category: "strategie",
  audience: "kmu",
  tagline: "Alle Ergebnisse deiner Strategie-Werkzeuge auf einer Seite, mit Platzhaltern für das, was noch fehlt.",
  keyword: "Marketingstrategie",
  related: ["swot", "budget-planer", "reifegrad-check"],
  needsServer: false,
  usesProfile: ["firma", "ort", "branche", "positionierung", "primaersegment", "zielgruppen", "personas", "marke", "kanaele", "budgetJahr", "contentSaeulen"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 2,
  pathStep: { path: "strategie", order: 10 },
  featured: true,
});
