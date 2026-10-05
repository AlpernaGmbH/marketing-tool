import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "angebotsarchitektur",
  name: "Angebotsarchitektur und Preisstrategie",
  category: "strategie",
  audience: "kmu",
  tagline: "Einstieg, Kern, Premium aus deinen Leistungen: Preisabstände, Deckungsbeitrag, Warnung bei kleiner Marge.",
  keyword: "Angebotsarchitektur",
  related: ["nutzenversprechen", "positionierung", "budget-planer"],
  needsServer: false,
  usesProfile: ["firma", "branche"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 7,
  pathStep: { path: "strategie", order: 10 },
  featured: false,
});
