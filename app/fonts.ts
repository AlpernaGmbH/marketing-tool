import localFont from "next/font/local";

// Selbst gehostet (SIL Open Font License, Lizenztexte in public/fonts/).
// Die gleichen Dateien bettet DocumentExport ins PDF ein.
export const poppins = localFont({
  src: [
    { path: "../public/fonts/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

export const montserrat = localFont({
  src: [
    { path: "../public/fonts/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
});
