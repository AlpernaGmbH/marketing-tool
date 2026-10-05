import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "verzeichnisse",
  name: "Verzeichnis-Check",
  category: "schweiz",
  audience: "beide",
  tagline: "In welchen Verzeichnissen du stehst, was fehlt und wo Name, Adresse und Telefon nicht übereinstimmen.",
  keyword: "Verzeichniseinträge",
  related: ["bewertungs-kit", "qr-set", "digitaler-auftritt-check"],
  needsServer: false,
  usesProfile: ["organisationstyp", "firma", "ort", "website", "branche"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "schweiz", order: 5 },
  featured: false,
});
