import type { Metadata, Viewport } from "next";
import { montserrat, poppins } from "@/app/fonts";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tools.alperna.ch";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Marketing-Werkzeuge für Schweizer KMU und Vereine | Alperna",
    template: "%s | Alperna",
  },
  description:
    "Kostenlose Marketing-Werkzeuge für Schweizer KMU und Vereine: verständlich, mit Ergebnis in Minuten, ohne Konto.",
  applicationName: "Alperna Marketing-Tools",
  openGraph: {
    type: "website",
    locale: "de_CH",
    siteName: "Alperna Marketing-Tools",
  },
  alternates: { canonical: "./" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de-CH" className={`${poppins.variable} ${montserrat.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        {children}
      </body>
    </html>
  );
}
