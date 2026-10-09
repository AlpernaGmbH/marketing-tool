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
import botschaftenConfig from "./botschaften/tool.config";
import markenplattformConfig from "./markenplattform/tool.config";
import swotConfig from "./swot/tool.config";
import contentSaeulenConfig from "./inhalte-saeulen/tool.config";
import whatsappLinkConfig from "./whatsapp-link/tool.config";
import qrSetConfig from "./qr-set/tool.config";
import bewertungsKitConfig from "./bewertungs-kit/tool.config";
import budgetPlanerConfig from "./budget-planer/tool.config";
import strategieEinseiterConfig from "./strategie-einseiter/tool.config";
import captionBaukastenConfig from "./caption-baukasten/tool.config";
import gbpFeiertageConfig from "./gbp-feiertage/tool.config";
import contentIdeenConfig from "./inhalte-ideen/tool.config";
import contentKalenderConfig from "./feiertagskalender/tool.config";
import postGeneratorConfig from "./post-generator/tool.config";
import medienmitteilungConfig from "./medienmitteilung/tool.config";
import bewertungsantwortConfig from "./bewertungsantwort/tool.config";
import anspruchsgruppenConfig from "./anspruchsgruppen/tool.config";
import vereinsKommunikationConfig from "./vereins-kommunikation/tool.config";
import sponsoringDossierConfig from "./sponsoring-dossier/tool.config";
import empfehlungsprogrammConfig from "./empfehlungsprogramm/tool.config";
import engagementRateConfig from "./engagement-rate/tool.config";
import anlassPlanerConfig from "./anlass-planer/tool.config";
import angebotsarchitekturConfig from "./angebotsarchitektur/tool.config";
import kpiBaumConfig from "./kpi-baum/tool.config";
import storyPostConfig from "./story-post/tool.config";
import postingPlanConfig from "./posting-plan/tool.config";
import kundenwegConfig from "./kundenweg/tool.config";
import kampagnenPlanerConfig from "./kampagnen-planer/tool.config";
import linkedinProfilConfig from "./linkedin-profil/tool.config";
import vorherNachherConfig from "./vorher-nachher/tool.config";
import angebotsgrafikConfig from "./angebotsgrafik/tool.config";
import zielgruppenSegmenteConfig from "./zielgruppen-segmente/tool.config";
import verzeichnisseConfig from "./verzeichnisse/tool.config";
import kanalstrategieConfig from "./kanalstrategie/tool.config";
import testimonialConfig from "./testimonial/tool.config";
import contentStrategieConfig from "./inhalte-strategie/tool.config";
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
  botschaftenConfig,
  markenplattformConfig,
  swotConfig,
  contentSaeulenConfig,
  whatsappLinkConfig,
  qrSetConfig,
  bewertungsKitConfig,
  budgetPlanerConfig,
  strategieEinseiterConfig,
  captionBaukastenConfig,
  gbpFeiertageConfig,
  contentIdeenConfig,
  contentKalenderConfig,
  postGeneratorConfig,
  medienmitteilungConfig,
  bewertungsantwortConfig,
  anspruchsgruppenConfig,
  vereinsKommunikationConfig,
  sponsoringDossierConfig,
  empfehlungsprogrammConfig,
  engagementRateConfig,
  anlassPlanerConfig,
  angebotsarchitekturConfig,
  kpiBaumConfig,
  storyPostConfig,
  postingPlanConfig,
  kundenwegConfig,
  kampagnenPlanerConfig,
  linkedinProfilConfig,
  vorherNachherConfig,
  angebotsgrafikConfig,
  zielgruppenSegmenteConfig,
  verzeichnisseConfig,
  kanalstrategieConfig,
  testimonialConfig,
  contentStrategieConfig,
  // new-tool:configs
];
