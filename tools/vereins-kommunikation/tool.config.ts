import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "vereins-kommunikation",
  name: "Vereins-Kommunikationskonzept",
  category: "strategie",
  audience: "verein",
  tagline: "Ziele, Zielgruppen, Kernbotschaft, Kanalplan und Jahreskalender deines Vereins als Konzept für die GV.",
  keyword: "Kommunikationskonzept Verein",
  related: ["anspruchsgruppen", "sponsoring-dossier", "content-kalender"],
  needsServer: true,
  usesProfile: ["organisationstyp", "firma", "ort", "kanton", "kanaele"],
  writesProfile: ["organisationstyp", "kanaele"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 8,
  pathStep: { path: "vereine", order: 2 },
  featured: true,
});
