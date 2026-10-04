import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "newsletter-check",
  name: "Newsletter-Check",
  category: "analyse",
  audience: "beide",
  tagline: "Betreff, Ziel, Abmeldung, Adresse und Spam-Signale in Sekunden geprüft, mit Punktzahl und Hinweisen.",
  keyword: "Newsletter-Check",
  related: ["textcheck", "text-umschreiber", "digitaler-auftritt-check"],
  needsServer: false,
  usesProfile: [],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 3,
  pathStep: { path: "analyse", order: 3 },
  featured: false,
});
