import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "anspruchsgruppen",
  name: "Anspruchsgruppen-Analyse",
  category: "analyse",
  audience: "beide",
  tagline: "Wer Einfluss und Interesse hat: Matrix, Strategie je Gruppe und Kommunikationsplan für Verein oder Betrieb.",
  keyword: "Anspruchsgruppen",
  related: ["vereins-kommunikation", "sponsoring-dossier", "icp-builder"],
  needsServer: false,
  usesProfile: ["organisationstyp", "firma"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 6,
  pathStep: { path: "analyse", order: 7 },
  featured: true,
});
