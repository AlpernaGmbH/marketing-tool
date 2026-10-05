import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "testimonial",
  name: "Testimonial-Baukasten",
  category: "content",
  audience: "beide",
  tagline: "Aus einem Kundenzitat werden Kachel, Beitrag und Fallstudie, dazu die Nachricht, mit der du darum bittest.",
  keyword: "Testimonial",
  related: ["bewertungs-kit", "story-post", "caption-baukasten"],
  needsServer: false,
  usesProfile: ["organisationstyp", "firma"],
  writesProfile: [],
  outputs: ["copy", "pdf", "docx"],
  estimatedMinutes: 5,
  pathStep: { path: "content", order: 15 },
  featured: false,
});
