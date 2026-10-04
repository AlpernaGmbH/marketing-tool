// Feldnamen des Firmenprofils. Reine Konstanten, ohne Browser-Zugriff,
// damit Registry (Server) und lib/profile.ts (Client) dieselbe Liste teilen.
export const PROFILE_FIELDS = [
  "organisationstyp",
  "firma",
  "branche",
  "rechtsform",
  "ort",
  "website",
  "kanton",
  "groesse",
  "zielgruppen",
  "primaersegment",
  "personas",
  "positionierung",
  "marke",
  "kanaele",
  "budgetJahr",
  "contentSaeulen",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
