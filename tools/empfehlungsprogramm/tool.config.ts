import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "empfehlungsprogramm",
  name: "Empfehlungsprogramm-Designer",
  category: "strategie",
  audience: "beide",
  tagline: "Anreiz, Ablauf in fünf Schritten und drei Textvorlagen, damit zufriedene Kundschaft dich weiterempfiehlt.",
  keyword: "Empfehlungsprogramm",
  related: ["bewertungs-kit", "whatsapp-link", "sponsoring-dossier"],
  needsServer: false,
  usesProfile: ["organisationstyp", "firma", "website"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "vereine", order: 4 },
  featured: false,
});
