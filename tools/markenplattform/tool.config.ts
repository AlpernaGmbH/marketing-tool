import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "markenplattform",
  name: "Markenplattform",
  category: "strategie",
  audience: "kmu",
  tagline: "Werte, Ton und Wörter deiner Marke auf einer Seite, damit jeder im Betrieb gleich schreibt.",
  keyword: "Markenplattform",
  related: ["positionierung", "nutzenversprechen", "text-umschreiber"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "website", "positionierung", "primaersegment"],
  writesProfile: ["marke"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "strategie", order: 7 },
  featured: false,
});
