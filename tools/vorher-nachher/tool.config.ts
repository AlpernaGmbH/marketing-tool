import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "vorher-nachher",
  name: "Vorher-Nachher-Collage",
  category: "content",
  audience: "beide",
  tagline: "Zwei Fotos zur Collage: nebeneinander, untereinander oder als Schieber, mit Logo, PNG in drei Formaten.",
  keyword: "Vorher-Nachher",
  related: ["angebotsgrafik", "caption-baukasten", "post-generator"],
  needsServer: false,
  usesProfile: ["firma", "organisationstyp"],
  writesProfile: [],
  outputs: ["png", "zip"],
  estimatedMinutes: 5,
  pathStep: { path: "content", order: 13 },
  featured: false,
});
