import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/jsonld";
import { getTools } from "@/lib/registry";

// Nur indexierbare Seiten. Kategorieseiten (Etappe 1b) und Rechtsseiten (Etappe 7) kommen dazu,
// sobald sie echten Inhalt haben.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...getTools().map((t) => ({
      url: `${SITE_URL}/tools/${t.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
