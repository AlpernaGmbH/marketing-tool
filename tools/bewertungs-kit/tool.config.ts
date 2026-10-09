import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "bewertungs-kit",
  name: "Bewertungs-Kit für Google",
  category: "praktisches",
  audience: "kmu",
  tagline: "QR-Code, Tischaufsteller und drei Anfrage-Texte für mehr Google-Bewertungen, fertig zum Drucken.",
  keyword: "Google-Bewertungen",
  related: ["whatsapp-link", "qr-set", "digitaler-auftritt-check"],
  needsServer: false,
  usesProfile: ["firma", "marke"],
  writesProfile: [],
  outputs: ["copy", "png", "pdf"],
  estimatedMinutes: 3,
  pathStep: { path: "praktisches", order: 3 },
  featured: true,
});
