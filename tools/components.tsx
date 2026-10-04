import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Zuordnung slug → Tool-Client-Komponente. Getrennt von tools/index.ts (nur Konfigurationen),
// damit API-Routen und Sitemap keine Komponenten laden. `npm run new-tool <slug>` trägt hier ein
// (und ergänzt `import dynamic from "next/dynamic"`, falls es fehlt).
export const toolComponents: Record<string, ComponentType> = {
  "digitaler-auftritt-check": dynamic(() => import("./digitaler-auftritt-check/Tool")),
  "textcheck": dynamic(() => import("./textcheck/Tool")),
  "text-umschreiber": dynamic(() => import("./text-umschreiber/Tool")),
  "newsletter-check": dynamic(() => import("./newsletter-check/Tool")),
  "reifegrad-check": dynamic(() => import("./reifegrad-check/Tool")),
  "wettbewerbsvergleich": dynamic(() => import("./wettbewerbsvergleich/Tool")),
  "ideen-aus-website": dynamic(() => import("./ideen-aus-website/Tool")),
  "icp-builder": dynamic(() => import("./icp-builder/Tool")),
  // new-tool:components
};
