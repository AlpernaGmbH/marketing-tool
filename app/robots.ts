import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/jsonld";

// Alles erlaubt ausser /api und /profil (persönliche Ansicht, nichts zum Indexieren).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/profil"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
