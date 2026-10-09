import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "caption-baukasten",
  name: "Caption-Baukasten",
  category: "inhalte",
  audience: "beide",
  tagline: "Hook, Hauptteil und Aufforderung in drei Schritten, fertig für Instagram, LinkedIn, Facebook und Google.",
  keyword: "Caption schreiben",
  related: ["inhalte-ideen", "textcheck", "post-generator"],
  needsServer: false,
  usesProfile: ["marke"],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 4,
  pathStep: { path: "inhalte", order: 6 },
  featured: false,
});
