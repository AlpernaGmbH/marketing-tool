import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "gbp-feiertage",
  name: "Feiertagsplaner für das Google-Unternehmensprofil",
  category: "schweiz",
  audience: "beide",
  tagline: "Sonderöffnungszeiten für alle Feiertage deines Kantons: zum Abtippen, als Kalender mit Erinnerung und als CSV.",
  keyword: "Feiertagsplaner",
  related: ["bewertungs-kit", "qr-set", "digitaler-auftritt-check"],
  needsServer: false,
  usesProfile: ["firma", "kanton"],
  writesProfile: [],
  outputs: ["copy", "ics", "csv"],
  estimatedMinutes: 3,
  pathStep: { path: "schweiz", order: 4 },
  featured: false,
});
