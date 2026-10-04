import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { KontoKarte } from "./KontoKarte";
import { ProfilHinweis } from "./ProfilHinweis";
import { ProfilEditor } from "./ProfilEditor";

export const metadata: Metadata = {
  title: "Mein Firmenprofil",
  description: "Dein Firmenprofil verbindet die Werkzeuge miteinander. Mit Konto liegt es bei deinem Konto, sonst in deinem Browser.",
  robots: { index: false, follow: false },
};

export default function ProfilPage() {
  return (
    <div className="container-page section">
      <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: "Mein Firmenprofil" }]} />
      <h1 className="mt-6">Mein Firmenprofil</h1>
      <ProfilHinweis />
      <KontoKarte />
      <ProfilEditor />
    </div>
  );
}
