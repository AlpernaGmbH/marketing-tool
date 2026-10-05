import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "positionierung",
  name: "Positionierungs-Check",
  category: "strategie",
  audience: "kmu",
  tagline: "Prüft, ob deine Startseite sagt, für wen du da bist und was dich unterscheidet, und schreibt den Entwurf.",
  keyword: "Positionierung",
  related: ["icp-builder", "persona", "digitaler-auftritt-check"],
  needsServer: true,
  usesProfile: ["firma", "website", "ort", "kanton", "branche"],
  writesProfile: ["positionierung"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "strategie", order: 5 },
  featured: false,
});
