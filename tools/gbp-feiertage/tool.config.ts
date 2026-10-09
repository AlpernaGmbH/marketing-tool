import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "gbp-feiertage",
  name: "Öffnungszeiten an Feiertagen",
  category: "praktisches",
  audience: "beide",
  tagline: "Sonderöffnungszeiten für alle Feiertage deines Kantons: zum Abtippen, als Kalender mit Erinnerung und als CSV.",
  keyword: "Öffnungszeiten an Feiertagen",
  related: ["bewertungs-kit", "qr-set", "digitaler-auftritt-check"],
  needsServer: false,
  usesProfile: ["firma", "kanton"],
  writesProfile: [],
  outputs: ["copy", "ics", "csv"],
  estimatedMinutes: 3,
  pathStep: { path: "praktisches", order: 4 },
  featured: false,
});
