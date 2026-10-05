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
  "nutzenversprechen": dynamic(() => import("./nutzenversprechen/Tool")),
  "persona": dynamic(() => import("./persona/Tool")),
  "positionierung": dynamic(() => import("./positionierung/Tool")),
  "botschaften": dynamic(() => import("./botschaften/Tool")),
  "markenplattform": dynamic(() => import("./markenplattform/Tool")),
  "swot": dynamic(() => import("./swot/Tool")),
  "content-saeulen": dynamic(() => import("./content-saeulen/Tool")),
  "whatsapp-link": dynamic(() => import("./whatsapp-link/Tool")),
  "qr-set": dynamic(() => import("./qr-set/Tool")),
  "bewertungs-kit": dynamic(() => import("./bewertungs-kit/Tool")),
  "budget-planer": dynamic(() => import("./budget-planer/Tool")),
  "strategie-einseiter": dynamic(() => import("./strategie-einseiter/Tool")),
  "caption-baukasten": dynamic(() => import("./caption-baukasten/Tool")),
  "gbp-feiertage": dynamic(() => import("./gbp-feiertage/Tool")),
  "content-ideen": dynamic(() => import("./content-ideen/Tool")),
  "content-kalender": dynamic(() => import("./content-kalender/Tool")),
  "post-generator": dynamic(() => import("./post-generator/Tool")),
  // new-tool:components
};
