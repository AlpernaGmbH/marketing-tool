import { brancheOf } from "@/lib/branchen";
import { INDUSTRY_KEYS, type IndustryKey } from "@/lib/check/types";

// Ob ein Online-Shop oder eine Online-Buchung für eine Branche sinnvoll ist (aus dem Agentur-Tool übernommen).
export type Relevance = "hoch" | "mittel" | "gering";

export type IndustryInfo = {
  shop: Relevance;
  booking: Relevance;
  shopHint: string;
  bookingHint: string;
};

export const INDUSTRIES: Record<IndustryKey, IndustryInfo> = {
  gastro: {
    shop: "gering",
    booking: "hoch",
    shopHint: "Gutscheine online zu verkaufen kann sich lohnen.",
    bookingHint: "Eine Tischreservation online spart Telefonate und bringt Gäste auch ausserhalb der Öffnungszeiten.",
  },
  hotel: {
    shop: "gering",
    booking: "hoch",
    shopHint: "Gutscheine und Pakete lassen sich online verkaufen.",
    bookingHint: "Direktbuchungen über die eigene Website sparen Plattform-Provisionen.",
  },
  beauty: {
    shop: "mittel",
    booking: "hoch",
    shopHint: "Pflegeprodukte und Gutscheine online zu verkaufen bringt Zusatzumsatz.",
    bookingHint: "Online-Terminbuchung ist in der Branche Standard, die Kundschaft erwartet sie.",
  },
  health: {
    shop: "gering",
    booking: "hoch",
    shopHint: "Ein Shop ist in der Regel nicht nötig.",
    bookingHint: "Online-Termine entlasten das Praxistelefon spürbar.",
  },
  fitness: {
    shop: "mittel",
    booking: "hoch",
    shopHint: "Abos, Kurse und Gutscheine lassen sich online verkaufen.",
    bookingHint: "Kurs- und Probetraining-Buchung online senkt die Einstiegshürde.",
  },
  retail: {
    shop: "hoch",
    booking: "gering",
    shopHint: "Ein Online-Shop (oder Click & Collect) erweitert die Kundschaft über die Öffnungszeiten hinaus.",
    bookingHint: "Online-Buchung ist meist nicht nötig.",
  },
  producer: {
    shop: "hoch",
    booking: "gering",
    shopHint: "Direktverkauf online steigert die Marge gegenüber dem Zwischenhandel.",
    bookingHint: "Online-Buchung ist meist nicht nötig.",
  },
  craft: {
    shop: "gering",
    booking: "mittel",
    shopHint: "Ein Shop ist in der Regel nicht nötig.",
    bookingHint: "Ein Offertformular oder die Buchung von Besichtigungsterminen bringt qualifizierte Anfragen.",
  },
  b2b: {
    shop: "gering",
    booking: "mittel",
    shopHint: "Ein Shop ist in der Regel nicht nötig.",
    bookingHint: "Ein Buchungslink für Erstgespräche (zum Beispiel Calendly) verkürzt den Weg zum Termin.",
  },
  realestate: {
    shop: "gering",
    booking: "mittel",
    shopHint: "Ein Shop ist in der Regel nicht nötig.",
    bookingHint: "Online-Terminbuchung für Beratungen oder Besichtigungen ist ein Plus.",
  },
  auto: {
    shop: "mittel",
    booking: "hoch",
    shopHint: "Zubehör, Reifen oder Gutscheine lassen sich online verkaufen.",
    bookingHint: "Service-Termine online zu buchen ist für die Kundschaft bequem.",
  },
  other: {
    shop: "mittel",
    booking: "mittel",
    shopHint: "Ob ein Shop Sinn macht, klären wir im Gespräch.",
    bookingHint: "Ob eine Online-Buchung Sinn macht, klären wir im Gespräch.",
  },
};

/** Ordnet eine freie Branchenbezeichnung einer Branche des Checks zu (zum Vorbefüllen aus dem Firmenprofil), über die gemeinsame Liste (lib/branchen.ts). */
export function guessIndustry(text: string | null | undefined): IndustryKey {
  return brancheOf(text)?.check ?? "other";
}

export function isIndustryKey(value: unknown): value is IndustryKey {
  return typeof value === "string" && (INDUSTRY_KEYS as readonly string[]).includes(value);
}
