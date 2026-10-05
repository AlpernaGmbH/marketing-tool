import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "bewertungsantwort",
  name: "Bewertungsantwort mit KI",
  category: "ki",
  audience: "kmu",
  tagline: "Zwei Antworten auf eine Google-Bewertung in deinem Ton: dankbar bei Lob, ruhig und konkret bei Kritik.",
  keyword: "Bewertung beantworten",
  related: ["bewertungs-kit", "markenplattform", "text-umschreiber"],
  needsServer: true,
  usesProfile: ["firma", "marke"],
  writesProfile: ["marke"],
  outputs: ["copy"],
  estimatedMinutes: 2,
  pathStep: { path: "ki", order: 3 },
  featured: true,
});
