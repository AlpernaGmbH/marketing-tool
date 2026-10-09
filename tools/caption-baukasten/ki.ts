import type { FormatKey, KategorieKey, PostInput, PostOutput } from "@/tools/post-generator/generator";
import { inputProblem as postProblem, paragraphs, toInput, type FormValues, type ProfileFields } from "@/tools/post-generator/logic";
import { fragenProblem, type Anrede, type KiFragen, type KiText, type Problem } from "./logic";

// Weg «ki» des Caption-Baukastens: drei Fragen (Idee, Worum geht es, Ziel), den Rest schreibt der Generator des Post-Generators.
// Reine Funktionen, kein React, kein DOM. Der Aufruf selbst läuft über useGenerator(postGenerator) in Tool.tsx.
// Die Caption entsteht für Instagram (die strengste Länge); der Baukasten setzt daraus die Texte aller vier Plattformen.
// Spec: specs/caption-baukasten.md

/** Das Format, das zur Kategorie passt; ohne Kategorie eine kleine Geschichte. */
export const FORMAT_JE_KATEGORIE: Record<KategorieKey | "", FormatKey> = {
  "": "geschichte",
  angebot: "liste",
  team: "geschichte",
  kundenprojekt: "geschichte",
  kulissen: "geschichte",
  frage: "fachtipp",
  tipp: "fachtipp",
  saison: "geschichte",
};

/** Die Eingaben des Post-Generators aus den drei Fragen, dem Profil und der Anrede. Emojis gibt es in diesem Weg nicht. */
export function kiInput(fields: ProfileFields, fragen: KiFragen, anrede: Anrede): PostInput {
  const form: FormValues = {
    idee: fragen.idee,
    plattform: "instagram",
    format: FORMAT_JE_KATEGORIE[fragen.kategorie],
    ziel: fragen.ziel,
    kategorie: fragen.kategorie,
    saeule: "",
    anrede,
    emojis: false,
  };
  return toInput(fields, form);
}

/** Meldung, warum es nicht losgehen kann (Betrieb fehlt, Idee zu kurz oder zu lang). null: in Ordnung. */
export function kiProblem(fields: Pick<ProfileFields, "firma">, fragen: KiFragen): Problem | null {
  const firma = postProblem(fields, {
    idee: fragen.idee,
    plattform: "instagram",
    format: "geschichte",
    ziel: fragen.ziel,
    kategorie: fragen.kategorie,
    saeule: "",
    anrede: "du",
    emojis: false,
  });
  if (firma && firma.fieldId === "pg-firma") return { step: 1, message: firma.message, fieldId: "cb-firma" };
  return fragenProblem(fragen);
}

/** Das Ergebnis der KI als Text des Baukastens: der erste Hook gilt, der zweite ist die Alternative. */
export function kiTextVon(output: PostOutput): KiText {
  return {
    hooks: [output.hooks[0], output.hooks[1]],
    hook: 0,
    teile: paragraphs(output.hauptteil),
    cta: output.cta,
  };
}
