import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "linkedin-profil",
  name: "LinkedIn-Profil-Score",
  category: "analyse",
  audience: "beide",
  tagline: "Acht Fragen zu deinem LinkedIn-Profil: Punktwert, priorisierte Verbesserungen und Headline-Vorschläge.",
  keyword: "LinkedIn-Profil",
  related: ["positionierung", "nutzenversprechen", "textcheck"],
  needsServer: false,
  usesProfile: ["firma", "branche", "primaersegment", "positionierung", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "analyse", order: 5 },
  featured: false,
});
