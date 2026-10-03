import Link from "next/link";
import { CATEGORY_LABELS, CATEGORY_PAGES } from "@/lib/registry";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-12 md:grid-cols-3">
        <section aria-labelledby="footer-kategorien">
          <h2 id="footer-kategorien" className="text-base">
            Kategorien
          </h2>
          <ul className="mt-3 grid gap-1">
            {CATEGORY_PAGES.map((page) => (
              <li key={page}>
                <Link href={`/${page}`} className="inline-block py-1 underline-offset-4 hover:underline">
                  {CATEGORY_LABELS[page]}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="footer-rechtliches">
          <h2 id="footer-rechtliches" className="text-base">
            Rechtliches
          </h2>
          <ul className="mt-3 grid gap-1">
            <li>
              <Link href="/impressum" className="inline-block py-1 underline-offset-4 hover:underline">
                Impressum
              </Link>
            </li>
            <li>
              <Link href="/datenschutz" className="inline-block py-1 underline-offset-4 hover:underline">
                Datenschutz
              </Link>
            </li>
          </ul>
        </section>

        <section aria-labelledby="footer-alperna">
          <h2 id="footer-alperna" className="text-base">
            Alperna
          </h2>
          <ul className="mt-3 grid gap-1">
            <li>
              <Link href="/ueber" className="inline-block py-1 underline-offset-4 hover:underline">
                Über diese Werkzeuge
              </Link>
            </li>
            <li>
              <a href="https://alperna.ch" className="inline-block py-1 underline-offset-4 hover:underline">
                alperna.ch
              </a>
            </li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            © {year} Alperna GmbH, Speicher AR
          </p>
        </section>
      </div>
    </footer>
  );
}
