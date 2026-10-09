import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "inhalte-ideen",
  name: "Beitragsideen nach Branche",
  category: "inhalte",
  audience: "beide",
  tagline: "Hunderte Beitragsideen für Schweizer Betriebe nach Branche, Format und Monat; merken und als Plan exportieren.",
  keyword: "Beitragsideen",
  related: ["inhalte-saeulen", "feiertagskalender", "caption-baukasten"],
  needsServer: false,
  usesProfile: ["branche", "contentSaeulen"],
  writesProfile: [],
  outputs: ["copy", "csv", "ics"],
  estimatedMinutes: 3,
  pathStep: { path: "inhalte", order: 4 },
  featured: true,
});
