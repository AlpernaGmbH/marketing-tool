import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

/** Der eine Satz, der auf jeder Seite wieder auftaucht (Entscheid 09.10.2026). */
export const CTA_LINE = "Wir machen Marketing für dich.";

/** wa.me-Link mit einer ersten Nachricht. Nummer aus NEXT_PUBLIC_WHATSAPP_NUMBER (nur Ziffern); ohne Nummer null. */
export function ctaWhatsappUrl(number: string | undefined): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent("Hallo Alperna, ich habe tools.alperna.ch besucht und möchte mit euch über mein Marketing sprechen.")}`;
}

function links() {
  return { erstgespraech: process.env.NEXT_PUBLIC_ERSTGESPRAECH_URL || null, wa: ctaWhatsappUrl(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER) };
}

/** Band am Fuss jeder Seite, auf dunklem Grund. Ruhig, ohne Preis; ohne beide Links bleibt es weg. */
export function GlobalCta() {
  const { erstgespraech, wa } = links();
  if (!erstgespraech && !wa) return null;
  return (
    <section aria-labelledby="global-cta" className="border-b border-page/15 pb-12 md:pb-16">
      <p className="eyebrow !text-page/60">Alperna</p>
      <h2 id="global-cta" className="mt-3 max-w-[16ch] text-4xl font-medium leading-[1.05] tracking-[-0.04em] text-page md:text-6xl">
        Wir machen <em className="font-serif font-normal italic">Marketing</em> für dich.
      </h2>
      <p className="mt-4 max-w-[48ch] text-lg text-page/80">
        Du hast die Antworten aus den Werkzeugen. Wenn dir die Zeit für die Umsetzung fehlt, übernimmt Alperna als Partner für den digitalen Auftritt.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {erstgespraech && (
          <a
            href={erstgespraech}
            className={cn(buttonVariants({ size: "lg" }), "gap-3 bg-yellow pr-2 text-ink hover:bg-page")}
            data-umami-event="cta_footer_erstgespraech"
          >
            Kostenloses Erstgespräch
            <span className="btn-icon" aria-hidden="true">
              <ArrowRight />
            </span>
          </a>
        )}
        {wa && (
          <a
            href={wa}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-page/50 bg-transparent text-page hover:bg-page hover:text-ink")}
            data-umami-event="cta_footer_whatsapp"
          >
            Kurz schreiben
          </a>
        )}
      </div>
    </section>
  );
}
