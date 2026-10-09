import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "feiertagskalender",
  name: "Feiertagskalender Schweiz",
  category: "praktisches",
  audience: "beide",
  tagline: "Anlässe, Feiertage und Schulferien deines Kantons als Jahresplan mit einem Beitrags-Vorschlag je Anlass.",
  keyword: "Feiertagskalender",
  related: ["inhalte-saeulen", "inhalte-ideen", "gbp-feiertage"],
  needsServer: false,
  usesProfile: ["firma", "branche", "kanton", "kanaele", "organisationstyp"],
  writesProfile: [],
  outputs: ["copy", "ics", "csv", "pdf", "docx"],
  estimatedMinutes: 4,
  pathStep: { path: "praktisches", order: 6 },
  featured: true,
});
