import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "engagement-rate",
  name: "Engagement-Rate-Rechner",
  category: "analyse",
  audience: "beide",
  tagline: "Interaktionsrate deiner Beiträge nach zwei Formeln: pro Beitrag, im Schnitt, mit Balkendiagramm und Erklärung.",
  keyword: "Engagement-Rate",
  related: ["newsletter-check", "reifegrad-check", "inhalte-saeulen"],
  needsServer: false,
  usesProfile: ["firma", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "csv", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "analyse", order: 4 },
  featured: false,
});
