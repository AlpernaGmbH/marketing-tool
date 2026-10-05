import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/jsonld";
import { isIndexable, robotsFor } from "@/lib/launch";

// Vor dem Launch ist alles gesperrt (lib/launch.ts); danach alles erlaubt ausser /api und /profil.
export default function robots(): MetadataRoute.Robots {
  return robotsFor(isIndexable(), SITE_URL);
}
