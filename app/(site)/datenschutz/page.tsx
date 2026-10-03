import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/site/PlaceholderPage";

export const metadata: Metadata = { title: "Datenschutz", robots: { index: false, follow: false } };

export default function Page() {
  return <PlaceholderPage title="Datenschutz" />;
}
