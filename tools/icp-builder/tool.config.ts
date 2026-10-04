import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "icp-builder",
  name: "ICP-Builder",
  category: "strategie",
  audience: "kmu",
  tagline: "Dein Idealkunde aus fünf Angaben, mit Punktekarte zum Bewerten neuer Anfragen.",
  keyword: "Idealkundenprofil",
  related: ["persona", "positionierung", "digitaler-auftritt-check"],
  needsServer: true,
  usesProfile: ["firma", "branche", "ort", "kanton", "groesse"],
  writesProfile: ["zielgruppen", "primaersegment"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "strategie", order: 2 },
  featured: true,
});
