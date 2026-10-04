import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "digitaler-auftritt-check",
  name: "Digitaler-Auftritt-Check",
  category: "strategie",
  audience: "kmu",
  tagline: "Wir lesen deine Website, prüfen Technik, Google-Profil und Social Media und sagen dir, was du zuerst angehst.",
  keyword: "Digitaler Auftritt",
  related: ["gbp-check", "bewertungs-kit", "positionierung"],
  needsServer: true,
  usesProfile: ["firma", "website", "ort", "branche", "kanaele"],
  writesProfile: ["firma", "website", "ort", "branche", "kanaele"],
  outputs: ["pdf", "docx", "copy"],
  estimatedMinutes: 2,
  pathStep: { path: "strategie", order: 1 },
  featured: true,
});
