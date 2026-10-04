import type { ToolConfig } from "@/lib/define-tool";
import digitalerAuftrittCheckConfig from "./digitaler-auftritt-check/tool.config";
import textcheckConfig from "./textcheck/tool.config";
import textUmschreiberConfig from "./text-umschreiber/tool.config";
import newsletterCheckConfig from "./newsletter-check/tool.config";
import reifegradCheckConfig from "./reifegrad-check/tool.config";
import wettbewerbsvergleichConfig from "./wettbewerbsvergleich/tool.config";
import ideenAusWebsiteConfig from "./ideen-aus-website/tool.config";
import icpBuilderConfig from "./icp-builder/tool.config";
import nutzenversprechenConfig from "./nutzenversprechen/tool.config";
import personaConfig from "./persona/tool.config";
import positionierungConfig from "./positionierung/tool.config";
// new-tool:imports

// Explizite Liste aller Tools (kein Glob). Neue Tools trägt `npm run new-tool <slug>` ein.
// Reihenfolge: Etappen-Reihenfolge, nicht alphabetisch.
export const tools: ToolConfig[] = [
  digitalerAuftrittCheckConfig,
  textcheckConfig,
  textUmschreiberConfig,
  newsletterCheckConfig,
  reifegradCheckConfig,
  wettbewerbsvergleichConfig,
  ideenAusWebsiteConfig,
  icpBuilderConfig,
  nutzenversprechenConfig,
  personaConfig,
  positionierungConfig,
  // new-tool:configs
];
