import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "qr-set",
  name: "QR-Set für Flyer und Aufkleber",
  category: "schweiz",
  audience: "beide",
  tagline: "Bis zu sechs QR-Codes mit Beschriftung: Druckbogen als PDF, Dateien als ZIP, fertig für Flyer und Aufkleber.",
  keyword: "QR-Code",
  related: ["whatsapp-link", "bewertungs-kit", "digitaler-auftritt-check"],
  needsServer: false,
  usesProfile: ["firma", "website"],
  writesProfile: [],
  outputs: ["pdf", "zip", "png"],
  estimatedMinutes: 4,
  pathStep: { path: "schweiz", order: 2 },
  featured: false,
});
