import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "smoke-test",
  name: "Smoke-Test",
  category: "strategie",
  audience: "kmu",
  tagline: "Nur für automatische Tests, nie im Index und nie in Production aktiv.",
  keyword: "Smoke-Test",
  related: [],
  needsServer: false,
  usesProfile: [],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 1,
  pathStep: { path: "strategie", order: 99 },
  featured: false,
});
