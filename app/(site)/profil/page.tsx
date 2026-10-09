import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { ToolShell } from "@/components/tool/ToolShell";
import { ProfilEditor } from "./ProfilEditor";

export const metadata: Metadata = {
  title: "Mein Firmenprofil",
  description: "Dein Firmenprofil verbindet die Werkzeuge miteinander. Es liegt nur in deinem Browser.",
  robots: { index: false, follow: false },
};

export default function ProfilPage() {
  return (
    <div className="container-page section">
      <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: "Mein Firmenprofil" }]} />
      <h1 className="mt-6">Mein Firmenprofil</h1>
      <p className="measure mt-4 text-lg text-muted-foreground">Wird nur in deinem Browser gespeichert. Exportiere es, wenn du es behalten willst.</p>
      <ToolShell slug="profil" name="Mein Firmenprofil" bare>
        <ProfilEditor />
      </ToolShell>
    </div>
  );
}
