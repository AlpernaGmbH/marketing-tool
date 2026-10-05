import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "whatsapp-link",
  name: "WhatsApp-Link mit QR",
  category: "schweiz",
  audience: "beide",
  tagline: "Aus deiner Nummer wird ein Link, ein QR-Code und ein Knopf für die Website, in einer Minute.",
  keyword: "WhatsApp-Link",
  related: ["qr-set", "bewertungs-kit", "digitaler-auftritt-check"],
  needsServer: false,
  usesProfile: ["firma"],
  writesProfile: [],
  outputs: ["copy", "png", "pdf"],
  estimatedMinutes: 2,
  pathStep: { path: "schweiz", order: 1 },
  featured: true,
});
