// Alte Adressen, die nach dem Umbau der Kategorien und Slugs (09.10.2026) weitergeleitet werden.
// Dauerhaft (301), damit Suchmaschinen und gespeicherte Links die neuen Seiten finden.

export const OLD_CATEGORY_PAGES: Record<string, string> = {
  content: "/inhalte",
  ki: "/inhalte",
  schweiz: "/praktisches",
  vereine: "/",
};

export const OLD_TOOL_SLUGS: Record<string, string> = {
  "content-ideen": "inhalte-ideen",
  "content-saeulen": "inhalte-saeulen",
  "content-strategie": "inhalte-strategie",
  "content-kalender": "feiertagskalender",
  "vereins-kommunikation": "kommunikationskonzept",
};

export type Redirect = { source: string; destination: string; statusCode: 301 };

export function redirects(): Redirect[] {
  return [
    ...Object.entries(OLD_CATEGORY_PAGES).map(([from, to]) => ({ source: `/${from}`, destination: to, statusCode: 301 as const })),
    ...Object.entries(OLD_TOOL_SLUGS).map(([from, to]) => ({ source: `/tools/${from}`, destination: `/tools/${to}`, statusCode: 301 as const })),
  ];
}
