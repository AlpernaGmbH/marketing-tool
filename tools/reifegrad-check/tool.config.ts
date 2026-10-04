import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "reifegrad-check",
  name: "Reifegrad-Check",
  category: "analyse",
  audience: "beide",
  tagline: "Zehn Fragen, ein Reifegrad von 0 bis 100 und je Dimension zwei nächste Schritte.",
  keyword: "Marketing-Reifegrad",
  related: ["digitaler-auftritt-check", "wettbewerbsvergleich", "newsletter-check"],
  needsServer: false,
  usesProfile: ["branche", "groesse"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "analyse", order: 1 },
  featured: true,
});
