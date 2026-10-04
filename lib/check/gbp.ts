import type { CheckItem } from "@/lib/check/types";

// Google-Business-Profil. Mit Schlüssel für die Places API (New) wird der Eintrag gesucht und bewertet.
// Ohne Schlüssel bleibt nur der Hinweis aus der Website (Link auf Google Maps). Das ist keine Bestätigung,
// und das Ergebnis sagt es so. Google selbst wird nicht abgefragt oder ausgelesen.

export type GbpInput = { company: string; city?: string; website: string };

export type GbpResult = {
  verified: boolean;
  found: boolean | "wahrscheinlich" | "unbekannt";
  score: number;
  items: CheckItem[];
  mapsUrl?: string;
  rating?: number | null;
  reviews?: number;
};

type Place = {
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  regularOpeningHours?: unknown;
  photos?: unknown[];
};

const FIELDS =
  "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.businessStatus,places.regularOpeningHours,places.photos";

export type GbpOptions = { placesKey?: string; fetchImpl?: typeof fetch };

function fallback(mapsLink: boolean): GbpResult {
  return {
    verified: false,
    found: mapsLink ? "wahrscheinlich" : "unbekannt",
    score: mapsLink ? 0.5 : 0.25,
    items: [
      {
        id: "gbp.profile",
        ok: mapsLink,
        label: "Google-Business-Profil",
        detail: mapsLink
          ? "Die Website verlinkt auf Google Maps, ein Eintrag existiert wahrscheinlich. Ob er vollständig ist, bestätigt dieser Check nicht."
          : "Nicht automatisch bestätigt. Suche nach «Firma Ort» in Google Maps und prüfe, ob dein Eintrag erscheint.",
      },
    ],
  };
}

export async function checkGoogleBusiness(input: GbpInput, mapsLink: boolean, options: GbpOptions = {}): Promise<GbpResult> {
  const key = options.placesKey;
  if (!key || !input.company) return fallback(mapsLink);
  try {
    const res = await (options.fetchImpl ?? fetch)("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        textQuery: [input.company, input.city].filter(Boolean).join(" "),
        languageCode: "de",
        regionCode: "CH",
        maxResultCount: 3,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fallback(mapsLink);
    const data = (await res.json()) as { places?: Place[] };
    const host = new URL(input.website).hostname.replace(/^www\./, "");
    const places = data.places ?? [];
    const p = places.find((x) => host && x.websiteUri?.includes(host)) ?? places[0];

    if (!p) {
      return {
        verified: true,
        found: false,
        score: 0,
        items: [
          {
            id: "gbp.profile",
            ok: false,
            label: "Google-Business-Profil",
            detail: "Kein Eintrag gefunden. Bei lokalen Suchen und auf Google Maps ist der Betrieb unsichtbar",
          },
        ],
      };
    }

    const rating = p.rating ?? null;
    const reviews = p.userRatingCount ?? 0;
    const photos = p.photos?.length ?? 0;
    const items: CheckItem[] = [
      { id: "gbp.profile", ok: true, label: "Google-Business-Profil", detail: `Gefunden: ${p.displayName?.text ?? ""}, ${p.formattedAddress ?? ""}` },
      {
        id: "gbp.reviews",
        ok: reviews >= 20,
        label: "Anzahl Bewertungen",
        detail: `${reviews} Bewertungen${reviews < 20 ? ". Mehr Bewertungen stärken das Vertrauen" : ""}`,
      },
      {
        id: "gbp.rating",
        ok: rating !== null && rating >= 4.3,
        label: "Durchschnittliche Bewertung",
        detail: rating !== null ? `${rating.toFixed(1).replace(".", ",")} von 5 Sternen` : "Noch keine Bewertung",
      },
      { id: "gbp.website", ok: Boolean(p.websiteUri), label: "Website im Profil hinterlegt", detail: p.websiteUri ? "Ja" : "Nein" },
      { id: "gbp.hours", ok: Boolean(p.regularOpeningHours), label: "Öffnungszeiten hinterlegt", detail: p.regularOpeningHours ? "Ja" : "Nein" },
      { id: "gbp.photos", ok: photos >= 5, label: "Fotos im Profil", detail: `${photos} Fotos (Google liefert höchstens 10)` },
    ];
    const score =
      0.4 +
      0.15 * Math.min(1, reviews / 50) +
      (rating ? 0.15 * Math.max(0, (rating - 3.5) / 1.5) : 0) +
      (p.websiteUri ? 0.1 : 0) +
      (p.regularOpeningHours ? 0.1 : 0) +
      0.1 * Math.min(1, photos / 10);
    return { verified: true, found: true, score: Math.min(1, score), items, mapsUrl: p.googleMapsUri, rating, reviews };
  } catch {
    return fallback(mapsLink);
  }
}
