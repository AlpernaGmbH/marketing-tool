import type { PdfFonts } from "@/lib/export/pdf";

// Die Schriften liegen unter public/fonts (SIL Open Font License) und werden erst beim Export geladen.
// Bewusst .woff statt .woff2: @pdf-lib/fontkit liest woff2, scheitert beim Subsetting aber mit
// «RangeError: Index out of range», und das PDF käme nie zustande. Die Webseite selbst nutzt woff2.
export const FONT_PATHS = {
  title: "/fonts/geist-latin-600-normal.woff",
  heading: "/fonts/geist-latin-500-normal.woff",
  body: "/fonts/geist-latin-400-normal.woff",
  bodyMedium: "/fonts/geist-latin-500-normal.woff",
} as const;

let cache: Promise<PdfFonts> | null = null;

/** Lädt die vier Schriften einmal pro Seitenaufruf. */
export function loadPdfFonts(fetchImpl: typeof fetch = fetch): Promise<PdfFonts> {
  if (!cache) {
    const get = async (path: string) => {
      const res = await fetchImpl(path);
      if (!res.ok) throw new Error(`Schrift ${path} nicht ladbar (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    };
    cache = Promise.all([get(FONT_PATHS.title), get(FONT_PATHS.heading), get(FONT_PATHS.body), get(FONT_PATHS.bodyMedium)])
      .then(([title, heading, body, bodyMedium]) => ({ title, heading, body, bodyMedium }))
      .catch((e) => {
        cache = null; // nächster Versuch darf neu laden
        throw e;
      });
  }
  return cache;
}

/** Nur für Tests: vergisst die geladenen Schriften. */
export function resetPdfFontCache(): void {
  cache = null;
}
