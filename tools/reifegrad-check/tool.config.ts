import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "reifegrad-check",
  name: "Reifegrad-Check",
  category: "analyse",
  audience: "beide",
  tagline: "Sechs Fragen, ein Scan deiner Website und ein Reifegrad von 0 bis 100 mit nächsten Schritten.",
  keyword: "Marketing-Reifegrad",
  related: ["digitaler-auftritt-check", "wettbewerbsvergleich", "newsletter-check"],
  needsServer: true,
  usesProfile: ["firma", "website", "branche", "groesse"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 3,
  pathStep: { path: "analyse", order: 1 },
  featured: true,
});
