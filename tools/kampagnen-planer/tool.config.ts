import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "kampagnen-planer",
  name: "Kampagnen-Planer",
  category: "strategie",
  audience: "beide",
  tagline: "Eine Kampagne in vier Phasen: Wochenplan, Massnahmen je Kanal, Budget je Woche und Kampagnenbrief.",
  keyword: "Kampagne planen",
  related: ["kpi-baum", "botschaften", "budget-planer"],
  needsServer: false,
  usesProfile: ["firma", "branche", "primaersegment", "kanaele", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx", "ics"],
  estimatedMinutes: 8,
  pathStep: { path: "strategie", order: 15 },
  featured: false,
});
