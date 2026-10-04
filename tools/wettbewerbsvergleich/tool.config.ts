import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "wettbewerbsvergleich",
  name: "Wettbewerbsvergleich",
  category: "analyse",
  audience: "kmu",
  tagline: "Deine Website gegen bis zu drei Mitbewerber: Punkte je Bereich, wo du vorne liegst und was du zuerst angehst.",
  keyword: "Wettbewerbsvergleich",
  related: ["digitaler-auftritt-check", "reifegrad-check", "positionierung"],
  needsServer: true,
  usesProfile: ["firma", "website", "ort", "branche"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 3,
  pathStep: { path: "analyse", order: 2 },
  featured: false,
});
