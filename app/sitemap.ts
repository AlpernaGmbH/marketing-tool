import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/jsonld";
import { CATEGORY_PAGES, getTools } from "@/lib/registry";

// Nur indexierbare Seiten. Rechtsseiten (Etappe 7) kommen dazu, sobald sie echten Inhalt haben.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...CATEGORY_PAGES.map((page) => ({
      url: `${SITE_URL}/${page}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...getTools().map((t) => ({
      url: `${SITE_URL}/tools/${t.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
