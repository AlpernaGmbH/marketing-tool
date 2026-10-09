import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "empfehlungsprogramm",
  name: "Empfehlungsprogramm-Designer",
  category: "strategie",
  audience: "beide",
  tagline: "Was dir eine Empfehlung bringt, welcher Anreiz sich lohnt, dazu Ablauf und Vorlagen für zufriedene Kundschaft.",
  keyword: "Empfehlungsprogramm",
  related: ["bewertungs-kit", "whatsapp-link", "sponsoring-dossier"],
  needsServer: false,
  usesProfile: ["organisationstyp", "firma", "website"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "strategie", order: 17 },
  featured: false,
});
