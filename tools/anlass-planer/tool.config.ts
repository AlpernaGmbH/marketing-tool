import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "anlass-planer",
  name: "Anlass-Rückwärtsplaner",
  category: "content",
  audience: "beide",
  tagline: "Vom Datum rückwärts planen: Zeitplan mit Aufgaben, Kanälen und Werkzeugen, als Kalender, Checkliste und PDF.",
  keyword: "Anlass planen",
  related: ["medienmitteilung", "post-generator", "content-kalender"],
  needsServer: false,
  usesProfile: ["firma", "kanaele", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx", "ics"],
  estimatedMinutes: 5,
  pathStep: { path: "content", order: 9 },
  featured: false,
});
