import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "sponsoring-dossier",
  name: "Sponsoring-Dossier",
  category: "inhalte",
  audience: "verein",
  tagline: "Verein in Zahlen, Zielgruppe und drei Pakete als Vergleich: ein Dossier, das du Sponsoren schicken kannst.",
  keyword: "Sponsoring-Dossier",
  related: ["vereins-kommunikation", "anspruchsgruppen", "empfehlungsprogramm"],
  needsServer: true,
  usesProfile: ["organisationstyp", "firma", "ort", "kanton", "website"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 20,
  pathStep: { path: "inhalte", order: 12 },
  featured: false,
});
