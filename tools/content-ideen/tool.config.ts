import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "content-ideen",
  name: "Content-Ideen nach Branche",
  category: "content",
  audience: "beide",
  tagline: "Hunderte Beitragsideen für Schweizer Betriebe nach Branche, Format und Monat; merken und als Plan exportieren.",
  keyword: "Content-Ideen",
  related: ["content-saeulen", "content-kalender", "caption-baukasten"],
  needsServer: false,
  usesProfile: ["branche", "contentSaeulen"],
  writesProfile: [],
  outputs: ["copy", "csv", "ics"],
  estimatedMinutes: 3,
  pathStep: { path: "content", order: 6 },
  featured: true,
});
