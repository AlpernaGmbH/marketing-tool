import type { GeneratorDef } from "@/lib/generator";
import { profilScanGenerator } from "@/lib/profile-scan";
import ideenAusWebsiteGenerator from "./ideen-aus-website/generator";
import icpBuilderGenerator from "./icp-builder/generator";
import nutzenversprechenGenerator from "./nutzenversprechen/generator";
import personaGenerator from "./persona/generator";
import positionierungGenerator from "./positionierung/generator";
import botschaftenGenerator from "./botschaften/generator";
import markenplattformGenerator from "./markenplattform/generator";
import swotGenerator from "./swot/generator";
import contentSaeulenGenerator from "./inhalte-saeulen/generator";
import postGeneratorGenerator from "./post-generator/generator";
import medienmitteilungGenerator from "./medienmitteilung/generator";
import bewertungsantwortGenerator from "./bewertungsantwort/generator";
import vereinsKommunikationGenerator from "./vereins-kommunikation/generator";
import sponsoringDossierGenerator from "./sponsoring-dossier/generator";
import contentStrategieGenerator from "./inhalte-strategie/generator";
// new-tool:generator-imports

// Explizite Liste aller Generatoren (kein Glob), wie tools/index.ts. Jeder Eintrag ist tools/<slug>/generator.ts.
// Die Route /api/generate findet den Generator über den Slug; Werkzeuge ohne KI-Entwurf stehen hier nicht.
// Ein- und Ausgabetypen sind je Generator verschieden; die Route arbeitet nur über die Schemas des Eintrags.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGenerator = GeneratorDef<any, any>;

export const generators: AnyGenerator[] = [
  ideenAusWebsiteGenerator,
  icpBuilderGenerator,
  nutzenversprechenGenerator,
  personaGenerator,
  positionierungGenerator,
  botschaftenGenerator,
  markenplattformGenerator,
  swotGenerator,
  contentSaeulenGenerator,
  postGeneratorGenerator,
  medienmitteilungGenerator,
  bewertungsantwortGenerator,
  vereinsKommunikationGenerator,
  sponsoringDossierGenerator,
  contentStrategieGenerator,
  // Kein Werkzeug: liest die Website für das Firmenprofil (lib/profile-scan.ts).
  profilScanGenerator,
  // new-tool:generators
];

export function getGenerator(slug: string): AnyGenerator | undefined {
  return generators.find((g) => g.slug === slug);
}
