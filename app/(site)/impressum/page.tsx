import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/site/PlaceholderPage";

export const metadata: Metadata = { title: "Impressum", robots: { index: false, follow: false } };

export default function Page() {
  return <PlaceholderPage title="Impressum" />;
}
