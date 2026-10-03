import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/site/PlaceholderPage";

export const metadata: Metadata = { title: "Über diese Werkzeuge", robots: { index: false, follow: false } };

export default function Page() {
  return <PlaceholderPage title="Über diese Werkzeuge" />;
}
