import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "ideen-aus-website",
  name: "Ideen aus deiner Website",
  category: "content",
  audience: "kmu",
  tagline: "Aus dem Text deiner Startseite werden 8 bis 12 Ideen für Beiträge, mit Kanal, Format und erstem Satz.",
  keyword: "Content-Ideen",
  related: ["text-umschreiber", "textcheck", "digitaler-auftritt-check"],
  needsServer: true,
  usesProfile: ["firma", "website", "ort", "branche"],
  writesProfile: ["firma", "website", "ort", "branche"],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 3,
  pathStep: { path: "content", order: 3 },
  featured: true,
});
