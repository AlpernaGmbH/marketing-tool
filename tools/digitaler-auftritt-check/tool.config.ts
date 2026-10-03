import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "digitaler-auftritt-check",
  name: "Digitaler-Auftritt-Check",
  category: "strategie",
  audience: "kmu",
  tagline: "Sechs Bausteine, ein Ergebnis: Wo dein Auftritt im Netz Lücken hat und was du zuerst angehst.",
  keyword: "Digitaler Auftritt",
  related: ["gbp-check", "bewertungs-kit", "positionierung"],
  needsServer: false,
  usesProfile: ["organisationstyp", "branche", "ort", "kanton", "groesse"],
  writesProfile: ["organisationstyp", "branche", "ort", "kanton", "groesse"],
  outputs: ["pdf", "docx", "copy"],
  estimatedMinutes: 6,
  pathStep: { path: "strategie", order: 1 },
  featured: true,
});
