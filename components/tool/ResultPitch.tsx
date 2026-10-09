"use client";

import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { usePitchData } from "@/components/tool/pitch-context";
import { cn } from "cn";
import type { PitchSpec } from "@/lib/pitch";

/** wa.me-Link mit vorausgefülltem Text, der das Werkzeug und den Anlass nennt. Ohne Nummer null. */
export function resultWhatsappUrl(number: string | undefined, toolName: string, satz: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = `Hallo Alperna, ich habe «${toolName}» auf tools.alperna.ch genutzt. ${satz} Könnt ihr mir dabei helfen?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Hinweis auf Alperna im Ergebnis, aus dem Ergebnis hergeleitet statt als allgemeiner Werbetext. Ruhig, ohne Preis. Zeigt nichts, wenn der Baustein
 * keinen Text hat (TODO) oder das Werkzeug keinen Anlass sieht (spec = null).
 */
export function ResultPitch({ spec }: { spec: PitchSpec | null }) {
  const data = usePitchData();
  if (!spec || !data) return null;
  const baustein = data.bausteine.find((b) => b.name === spec.baustein);
  if (!baustein) return null;
  const wa = resultWhatsappUrl(data.whatsappNumber, data.toolName, spec.satz);
  if (!wa && !data.erstgespraechUrl) return null;

  return (
    <aside aria-labelledby="result-pitch" className="grid gap-5 rounded-xl bg-ink p-6 text-paper md:p-8" data-testid="result-pitch">
      <p id="result-pitch" className="font-mono text-xs uppercase tracking-wide text-paper/70">
        Das machen wir für dich
      </p>
      <p className="max-w-[44ch] font-heading text-2xl font-medium leading-snug md:text-3xl">{spec.satz}</p>
      <p className="max-w-[60ch] text-paper/80">{baustein.text}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        {data.erstgespraechUrl && (
          <a
            href={data.erstgespraechUrl}
            className={cn(buttonVariants({ size: "lg" }), "gap-3 bg-yellow pr-2 text-ink hover:bg-paper")}
            data-umami-event="pitch_result_erstgespraech"
            data-umami-event-tool={data.toolSlug}
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
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-paper/50 bg-transparent text-paper hover:bg-paper hover:text-ink")}
            data-umami-event="pitch_result_whatsapp"
            data-umami-event-tool={data.toolSlug}
          >
            Kurz schreiben
          </a>
        )}
      </div>
    </aside>
  );
}
