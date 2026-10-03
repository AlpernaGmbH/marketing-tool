import type { Faq } from "@/lib/content";
import type { CategoryPage, ToolConfig } from "@/lib/registry";
import { CATEGORY_LABELS } from "@/lib/registry";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://tools.alperna.ch").replace(/\/$/, "");

/** JSON-LD sicher in <script> einbetten: «<» wird maskiert, damit kein </script> entstehen kann. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Markdown-Zeichen aus einer Antwort entfernen, damit JSON-LD reinen Text enthält. */
export function stripMarkdown(s: string): string {
  return s
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function faqPage(faq: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: stripMarkdown(f.answer) },
    })),
  };
}

/** Startseite: Organisation, Website und FAQPage. */
export function homeJsonLd(faq: Faq[]) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Alperna GmbH",
      url: "https://alperna.ch",
      address: { "@type": "PostalAddress", addressLocality: "Speicher", addressRegion: "AR", addressCountry: "CH" },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Alperna Marketing-Tools",
      url: SITE_URL,
      inLanguage: "de-CH",
      publisher: { "@type": "Organization", name: "Alperna GmbH" },
    },
    faqPage(faq),
  ];
}

/** Kategorieseite: Sammlung der Werkzeuge, FAQPage und Brotkrumen. */
export function categoryJsonLd(
  page: CategoryPage,
  meta: { h1: string; description: string },
  faq: Faq[],
  tools: Pick<ToolConfig, "slug" | "name">[],
) {
  const url = `${SITE_URL}/${page}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: meta.h1,
      description: meta.description,
      url,
      inLanguage: "de-CH",
      mainEntity: {
        "@type": "ItemList",
        itemListElement: tools.map((t, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: t.name,
          url: `${SITE_URL}/tools/${t.slug}`,
        })),
      },
    },
    faqPage(faq),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Start", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: CATEGORY_LABELS[page], item: url },
      ],
    },
  ];
}

/** SoftwareApplication, FAQPage und BreadcrumbList für eine Tool-Seite. */
export function toolJsonLd(config: ToolConfig, meta: { h1: string; description: string }, faq: Faq[]) {
  const url = `${SITE_URL}/tools/${config.slug}`;
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
    faqPage(faq),
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
