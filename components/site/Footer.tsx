import Image from "next/image";
import Link from "next/link";
import { CATEGORY_LABELS, CATEGORY_PAGES } from "@/lib/registry";

const link = "inline-block py-1 text-page/80 underline-offset-4 transition-colors hover:text-page hover:underline";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="on-night mt-auto overflow-hidden bg-navy text-page">
      <div className="container-page pt-16">
        <div className="grid gap-10 md:grid-cols-4">
          <section aria-labelledby="footer-alperna" className="md:col-span-1">
            <h2 id="footer-alperna" className="sr-only">
              Alperna
            </h2>
            <Image src="/brand/alperna-mark.svg" alt="" width={44} height={44} unoptimized className="size-11" />
            <p className="mt-4 max-w-[26ch] text-page/80">Marketing-Werkzeuge für Schweizer KMU und Vereine, von der Alperna GmbH in Speicher AR.</p>
          </section>

          <section aria-labelledby="footer-kategorien">
            <h2 id="footer-kategorien" className="eyebrow !text-page/60">
              Kategorien
            </h2>
            <ul className="mt-4 grid gap-1">
              {CATEGORY_PAGES.map((page) => (
                <li key={page}>
                  <Link href={`/${page}`} className={link}>
                    {CATEGORY_LABELS[page]}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="footer-rechtliches">
            <h2 id="footer-rechtliches" className="eyebrow !text-page/60">
              Rechtliches
            </h2>
            <ul className="mt-4 grid gap-1">
              <li>
                <Link href="/impressum" className={link}>
                  Impressum
                </Link>
              </li>
              <li>
                <Link href="/datenschutz" className={link}>
                  Datenschutz
                </Link>
              </li>
            </ul>
          </section>

          <section aria-labelledby="footer-mehr">
            <h2 id="footer-mehr" className="eyebrow !text-page/60">
              Mehr
            </h2>
            <ul className="mt-4 grid gap-1">
              <li>
                <Link href="/ueber" className={link}>
                  Über diese Werkzeuge
                </Link>
              </li>
              <li>
                <a href="https://alperna.ch" className={link}>
                  alperna.ch
                </a>
              </li>
            </ul>
          </section>
        </div>

        <p className="mt-12 font-mono text-xs uppercase tracking-wide text-page/60">© {year} Alperna GmbH, Speicher AR</p>
      </div>
      <div aria-hidden="true" className="footer-wordmark" />
    </footer>
  );
}
