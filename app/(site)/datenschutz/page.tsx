import type { Metadata } from "next";
import { LegalPageView } from "@/components/site/LegalPageView";

export const metadata: Metadata = { title: "Datenschutz", robots: { index: false, follow: false } };

export default function Page() {
  return <LegalPageView page="datenschutz" />;
}
