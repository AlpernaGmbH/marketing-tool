import type { MetadataRoute } from "next";

// Launch-Sperre: Bis NEXT_PUBLIC_INDEXABLE=true gesetzt ist, bleibt die ganze Seite für Suchmaschinen gesperrt (robots.txt und
// meta robots). Grund: Die Seite nimmt E-Mail-Adressen und Eingaben entgegen; vor der Veröffentlichung der Datenschutzerklärung
// (content/legal/eigene-datenschutz.md, Freigabe durch einen Menschen) soll sie nicht über Suchmaschinen gefunden werden.
// NEXT_PUBLIC_-Werte werden beim Build eingesetzt: Nach dem Ändern in Vercel neu deployen.

export function isIndexable(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEXT_PUBLIC_INDEXABLE === "true";
}

/** Inhalt von robots.txt: offen mit der Sitemap, oder alles gesperrt. */
export function robotsFor(indexable: boolean, siteUrl: string): MetadataRoute.Robots {
  if (!indexable) return { rules: [{ userAgent: "*", disallow: "/" }] };
  // Alles erlaubt ausser /api und /profil (persönliche Ansicht, nichts zum Indexieren).
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/profil"] }], sitemap: `${siteUrl}/sitemap.xml` };
}
