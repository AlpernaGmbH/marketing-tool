import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "linkedin-profil",
  name: "LinkedIn-Profil-Score",
  category: "analyse",
  audience: "beide",
  tagline: "Füge Headline und Info-Text ein: Punktwert nach festen Regeln, Verbesserungen und drei Headline-Vorschläge.",
  keyword: "LinkedIn-Profil",
  related: ["positionierung", "nutzenversprechen", "textcheck"],
  needsServer: true,
  usesProfile: ["firma", "branche", "primaersegment"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 3,
  pathStep: { path: "analyse", order: 5 },
  featured: false,
});
