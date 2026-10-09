import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "kommunikationskonzept",
  name: "Kommunikationskonzept",
  category: "strategie",
  audience: "beide",
  tagline: "Ziele, Zielgruppen, Kernbotschaft, Kanalplan und Jahreskalender als Konzept für Betrieb oder Verein.",
  keyword: "Kommunikationskonzept",
  related: ["anspruchsgruppen", "kanalstrategie", "posting-plan"],
  needsServer: true,
  usesProfile: ["organisationstyp", "firma", "ort", "kanton", "website", "kanaele"],
  writesProfile: ["kanaele"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 8,
  pathStep: { path: "strategie", order: 18 },
  featured: true,
});
