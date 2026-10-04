import localFont from "next/font/local";

// Selbst gehostet (SIL Open Font License, Lizenztexte in public/fonts/).
// Geist trägt Text und Titel (Titel Gewicht 500), Instrument Serif kursiv die Betonungen,
// Geist Mono die Zahlen und kleinen Beschriftungen (wie auf der Alperna-Website).
// Die woff-Dateien bettet DocumentExport ins PDF ein.
export const geist = localFont({
  src: [
    { path: "../public/fonts/geist-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/geist-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-geist",
  display: "swap",
  // Ersatzschrift mit angepassten Massen: der Wechsel zu Geist verschiebt kein Layout und setzt den LCP nicht zurück.
  adjustFontFallback: "Arial",
});

export const geistMono = localFont({
  src: [
    { path: "../public/fonts/geist-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false, // nur kleine Beschriftungen: nicht im kritischen Pfad
});

export const instrumentSerif = localFont({
  src: [{ path: "../public/fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" }],
  variable: "--font-instrument",
  display: "swap",
  preload: false, // Betonungen: nicht im kritischen Pfad
  adjustFontFallback: "Times New Roman",
});
