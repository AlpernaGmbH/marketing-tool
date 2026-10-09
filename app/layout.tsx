import type { Metadata, Viewport } from "next";
import { geist, geistMono, instrumentSerif } from "@/app/fonts";
import { isIndexable } from "@/lib/launch";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tools.alperna.ch";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Marketing-Werkzeuge für Schweizer KMU | Alperna",
    template: "%s | Alperna",
  },
  description:
    "Kostenlose Marketing-Werkzeuge für Schweizer KMU: verständlich, mit Ergebnis in Minuten, ohne Konto.",
  applicationName: "Alperna Marketing-Tools",
  openGraph: {
    type: "website",
    locale: "de_CH",
    siteName: "Alperna Marketing-Tools",
  },
  alternates: { canonical: "./" },
  // Vor dem Launch für Suchmaschinen gesperrt (lib/launch.ts, NEXT_PUBLIC_INDEXABLE).
  ...(isIndexable() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F3F1EC",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de-CH" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        {children}
      </body>
    </html>
  );
}
