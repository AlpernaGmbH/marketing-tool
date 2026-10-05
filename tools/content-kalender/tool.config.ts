import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "content-kalender",
  name: "Content-Kalender Schweiz",
  category: "content",
  audience: "beide",
  tagline: "Anlässe, Feiertage und Schulferien deines Kantons als Jahresplan mit einem Beitrags-Vorschlag je Anlass.",
  keyword: "Content-Kalender",
  related: ["content-saeulen", "content-ideen", "gbp-feiertage"],
  needsServer: false,
  usesProfile: ["firma", "branche", "kanton", "kanaele", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "ics", "csv", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "content", order: 5 },
  featured: true,
});
