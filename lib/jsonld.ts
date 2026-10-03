import type { Faq } from "@/lib/content";
import type { ToolConfig } from "@/lib/registry";
import { CATEGORY_LABELS } from "@/lib/registry";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://tools.alperna.ch").replace(/\/$/, "");

/** JSON-LD sicher in <script> einbetten: «<» wird maskiert, damit kein </script> entstehen kann. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** SoftwareApplication, FAQPage und BreadcrumbList für eine Tool-Seite. */
export function toolJsonLd(config: ToolConfig, meta: { h1: string; description: string }, faq: Faq[]) {
  const url = `${SITE_URL}/tools/${config.slug}`;
  const strip = (s: string) =>
    s
      .replace(/[*_`#>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: config.name,
      headline: meta.h1,
      description: meta.description,
      url,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "de-CH",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "CHF" },
      provider: { "@type": "Organization", name: "Alperna GmbH", url: "https://alperna.ch" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: strip(f.answer) },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Start", item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: CATEGORY_LABELS[config.category],
          item: `${SITE_URL}/${config.category}`,
        },
        { "@type": "ListItem", position: 3, name: config.name, item: url },
      ],
    },
  ];
}
