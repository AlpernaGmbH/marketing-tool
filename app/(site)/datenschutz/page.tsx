import type { Metadata } from "next";
import { LegalPageView } from "@/components/site/LegalPageView";

export const metadata: Metadata = {
  title: "Datenschutz",
  description: "Datenschutzerklärung zu tools.alperna.ch: welche Angaben die Werkzeuge verarbeiten und wohin sie gehen.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <LegalPageView page="datenschutz" />;
}
