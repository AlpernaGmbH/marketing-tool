import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { SITE_FILES, readSimple } from "@/lib/site-content";

const content = readSimple(SITE_FILES.ueber);

export const metadata: Metadata = {
  title: content.front.title,
  description: content.front.description,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="container-page section">
      <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: content.front.title ?? "Über diese Werkzeuge" }]} />
      <h1 className="mt-6">{content.front.title}</h1>
      <div className="content measure mt-6">
        {content.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <p className="measure mt-6 text-sm text-muted-foreground">
        Mehr dazu in der{" "}
        <Link href="/datenschutz" className="underline underline-offset-4">
          Datenschutzerklärung
        </Link>{" "}
        und im{" "}
        <Link href="/impressum" className="underline underline-offset-4">
          Impressum
        </Link>
        .
      </p>
    </div>
  );
}
