import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "anlass-planer",
  name: "Anlass-Rückwärtsplaner",
  category: "praktisches",
  audience: "beide",
  tagline: "Vom Datum rückwärts planen: Zeitplan mit Aufgaben, Kanälen und Werkzeugen, als Kalender, Checkliste und PDF.",
  keyword: "Anlass planen",
  related: ["medienmitteilung", "post-generator", "feiertagskalender"],
  needsServer: false,
  usesProfile: ["firma", "kanaele", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx", "ics"],
  estimatedMinutes: 5,
  pathStep: { path: "praktisches", order: 5 },
  featured: false,
});
