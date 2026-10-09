import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "vorher-nachher",
  name: "Vorher-Nachher-Collage",
  category: "inhalte",
  audience: "beide",
  tagline: "Zwei Fotos zur Collage: nebeneinander, untereinander oder als Schieber, mit Logo, PNG in drei Formaten.",
  keyword: "Vorher-Nachher",
  related: ["angebotsgrafik", "caption-baukasten", "post-generator"],
  needsServer: false,
  usesProfile: ["firma", "organisationstyp"],
  writesProfile: [],
  outputs: ["png", "zip"],
  estimatedMinutes: 5,
  pathStep: { path: "inhalte", order: 14 },
  featured: false,
});
