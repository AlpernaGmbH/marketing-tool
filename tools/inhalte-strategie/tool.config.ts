import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "inhalte-strategie",
  name: "Inhaltsstrategie",
  category: "inhalte",
  audience: "beide",
  tagline: "Wofür dein Inhalt da ist, welche Themen und Kanäle er braucht und was in den ersten 90 Tagen passiert.",
  keyword: "Inhaltsstrategie",
  related: ["inhalte-saeulen", "posting-plan", "kanalstrategie"],
  needsServer: true,
  usesProfile: ["organisationstyp", "firma", "branche", "ort", "positionierung", "primaersegment", "kanaele", "contentSaeulen", "marke"],
  writesProfile: ["contentSaeulen"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "inhalte", order: 1 },
  featured: false,
});
