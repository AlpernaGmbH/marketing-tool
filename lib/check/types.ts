import { z } from "zod";

// Marketing-Check: Typen, Eingabe-Schema und feste Listen.
// Die Prüf-Engine stammt aus dem Agentur-Tool von Alperna (lib/marketing-check/analyzer.mjs, Stand 02.10.2026)
// und wurde für dieses Projekt in TypeScript übertragen. Punktzahlen und Gewichte sind absichtlich gleich geblieben,
// damit beide Systeme dieselbe Seite gleich bewerten.

export const INDUSTRY_KEYS = [
  "gastro",
  "hotel",
  "beauty",
  "health",
  "fitness",
  "retail",
  "producer",
  "craft",
  "b2b",
  "realestate",
  "auto",
  "other",
] as const;
export type IndustryKey = (typeof INDUSTRY_KEYS)[number];

export const INDUSTRY_LABELS: Record<IndustryKey, string> = {
  gastro: "Gastronomie / Restaurant / Café",
  hotel: "Hotel / Ferienwohnung / B&B",
  beauty: "Coiffeur / Kosmetik / Beauty",
  health: "Gesundheit / Praxis / Therapie",
  fitness: "Fitness / Sport / Kurse",
  retail: "Detailhandel / Laden",
  producer: "Produktion / Manufaktur / Hofladen",
  craft: "Handwerk / Bau / Garten",
  b2b: "Beratung / Dienstleistung (B2B)",
  realestate: "Immobilien / Treuhand",
  auto: "Garage / Auto / Mobilität",
  other: "Andere Branche",
};

export const SOCIAL_NETWORKS = [
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/deinbetrieb" },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/deinbetrieb" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/company/…" },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@deinbetrieb" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@deinbetrieb" },
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]["key"];

export const POSTING_FREQUENCIES = [
  { key: "none", label: "Gar nicht" },
  { key: "rare", label: "Seltener als monatlich" },
  { key: "monthly", label: "Etwa monatlich" },
  { key: "weekly", label: "Etwa wöchentlich" },
  { key: "several", label: "Mehrmals pro Woche" },
] as const;
export type PostingFrequency = (typeof POSTING_FREQUENCIES)[number]["key"];

const social = z
  .object({
    url: z.string().trim().max(300).optional(),
    freq: z.enum(["none", "rare", "monthly", "weekly", "several"]).optional(),
  })
  .optional();

/** Eingabe des Checks. Unbekannte Branchen werden zu «other». */
export const checkInputSchema = z.object({
  company: z.string().trim().min(1, "Bitte gib den Firmennamen an.").max(200),
  city: z.string().trim().max(100).optional(),
  industry: z.string().trim().max(40).optional(),
  website: z.string().trim().min(3, "Bitte gib eine Website an.").max(300),
  /** Fremde Website (Wettbewerbsvergleich): robots.txt wird beachtet; verbietet sie den Abruf, bleibt die Seite ungelesen. */
  respectRobots: z.boolean().optional(),
  socials: z
    .object({
      instagram: social,
      facebook: social,
      linkedin: social,
      tiktok: social,
      youtube: social,
    })
    .optional(),
});
export type CheckInput = z.infer<typeof checkInputSchema>;

export type CheckCategoryId = "seo" | "gbp" | "social" | "sea" | "newsletter" | "shop" | "booking";

export type CheckItem = {
  /** Stabile Kennung, z. B. «seo.title». Massnahmen und spätere KI-Texte verweisen darauf. */
  id: string;
  ok: boolean;
  label: string;
  detail: string;
  weight?: number;
  /** Hinweis ohne Wertung (zählt für die Punktzahl, steht aber nicht als Mangel da). */
  info?: boolean;
};

export type CheckChannel = {
  network: string;
  label: string;
  url?: string;
  linkedOnSite: boolean;
  freq: PostingFrequency | null;
  freqLabel: string;
  freqScore: number;
  /** true: Der Besucher hat die Häufigkeit nicht angegeben, der Wert ist eine Annahme. */
  freqAssumed?: boolean;
};

export type CheckCategory = {
  id: CheckCategoryId;
  title: string;
  /** Gewicht an der Gesamtpunktzahl. */
  weight: number;
  /** 0 bis 1 */
  score: number;
  items: CheckItem[];
  /** false: nicht automatisch bestätigt (Google-Profil ohne Schlüssel). */
  verified?: boolean;
  /** Angaben stammen vom Besucher, nicht aus einer Messung. */
  selfReported?: boolean;
  channels?: CheckChannel[];
  note?: string;
  relevance?: "hoch" | "mittel" | "gering";
  hint?: string;
};

export type Aufwand = "klein" | "mittel" | "gross";
export type Wirkung = "hoch" | "mittel" | "gering";
export type BausteinLabel = "Website" | "Google Business Profil" | "Social Media" | "Online-Shop" | "Buchungstool";

export type Massnahme = {
  id: string;
  /** Kennung des Prüfpunkts, aus dem sie entsteht. */
  itemId: string;
  titel: string;
  warum: string;
  baustein: BausteinLabel;
  aufwand: Aufwand;
  wirkung: Wirkung;
  /** Slug eines passenden Werkzeugs auf dieser Seite, falls vorhanden. */
  tool?: string;
};

export type CheckFacts = {
  hasShop: boolean;
  hasBooking: boolean;
  hasNewsletter: boolean;
  tracking: Record<string, boolean>;
  gbpFound: boolean | "wahrscheinlich" | "unbekannt";
  gbpVerified: boolean;
  socialCount: number;
  seoScore: number;
  shopRelevance: string;
  bookingRelevance: string;
  title: string;
  description: string;
};

export type CheckResult = {
  v: 1;
  checkedAt: string;
  company: string;
  city: string;
  industry: IndustryKey;
  industryLabel: string;
  url: string;
  /** 0 bis 100 */
  score: number;
  categories: CheckCategory[];
  facts: CheckFacts;
  massnahmen: Massnahme[];
  /**
   * Signatur des Servers über alle anderen Felder (lib/check/sign.ts). Sie belegt, dass /api/check das Ergebnis erzeugt hat.
   * /api/ai nimmt nur signierte Ergebnisse an, damit niemand beliebigen Text an die KI schicken kann.
   */
  sig?: string;
};

export const CHECK_STEPS = [
  { id: "fetch", label: "Website laden" },
  { id: "seo", label: "SEO und Technik prüfen" },
  { id: "gbp", label: "Google-Business-Profil suchen" },
  { id: "social", label: "Social-Media-Kanäle abgleichen" },
  { id: "detect", label: "Tracking, Newsletter, Shop und Buchung erkennen" },
  { id: "score", label: "Bewertung berechnen" },
] as const;
export type CheckStepId = (typeof CHECK_STEPS)[number]["id"];

/** Ereignisse, die /api/check zeilenweise (NDJSON) an den Browser schickt. */
export type CheckEvent =
  | { type: "step"; id: CheckStepId; state: "start" | "done" }
  | { type: "result"; result: CheckResult }
  | { type: "error"; code: CheckErrorCode; message: string };

export type CheckErrorCode = "invalid" | "gate" | "rate_limited" | "unreachable" | "blocked" | "failed";

export class CheckError extends Error {
  constructor(
    message: string,
    readonly code: CheckErrorCode = "failed",
  ) {
    super(message);
    this.name = "CheckError";
  }
}
