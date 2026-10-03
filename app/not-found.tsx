import Link from "next/link";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="container-page section">
          <h1>Diese Seite gibt es nicht.</h1>
          <p className="measure mt-4 text-muted-foreground">
            Vielleicht hilft dir die Suche oben weiter, oder du startest bei den Kategorien.
          </p>
          <p className="mt-6">
            <Link href="/" className="underline underline-offset-4">
              Zur Startseite
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
