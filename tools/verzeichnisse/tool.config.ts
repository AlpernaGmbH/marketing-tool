import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "verzeichnisse",
  name: "Verzeichnis-Check",
  category: "analyse",
  audience: "beide",
  tagline: "In welchen Verzeichnissen du stehst, was fehlt und wo Name, Adresse und Telefon nicht übereinstimmen.",
  keyword: "Verzeichniseinträge",
  related: ["bewertungs-kit", "qr-set", "digitaler-auftritt-check"],
  needsServer: true,
  usesProfile: ["organisationstyp", "firma", "ort", "website", "branche"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "analyse", order: 8 },
  featured: false,
});
