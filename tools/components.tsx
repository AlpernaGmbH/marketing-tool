import type { ComponentType } from "react";

// Zuordnung slug → Tool-Client-Komponente. Getrennt von tools/index.ts (nur Konfigurationen),
// damit API-Routen und Sitemap keine Komponenten laden. `npm run new-tool <slug>` trägt hier ein
// (und ergänzt `import dynamic from "next/dynamic"`, falls es fehlt).
export const toolComponents: Record<string, ComponentType> = {
  // new-tool:components
};
