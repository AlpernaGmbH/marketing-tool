import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { loadBausteine, usable, type BausteinName } from "@/lib/pitch";

type ToolFields = { problem?: string; baustein?: string; beweis?: string };

type Props = {
  /** «short» auf Tool-Seiten, «long» auf Startseite und Kategorieseiten (alle sechs Bausteine). */
  variant?: "short" | "long";
  toolName?: string;
  toolSlug?: string;
  /** problem, baustein, beweis aus content/tools/<slug>.md */
  fields?: ToolFields;
};

/** wa.me-Link mit vorausgefülltem Text. Nummer aus NEXT_PUBLIC_WHATSAPP_NUMBER (nur Ziffern). */
export function whatsappUrl(number: string | undefined, toolName?: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = toolName
    ? `Hallo Alperna, ich habe das Werkzeug «${toolName}» auf tools.alperna.ch genutzt und hätte eine Frage.`
    : "Hallo Alperna, ich habe tools.alperna.ch besucht und hätte eine Frage.";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function AlpernaPitch({ variant = "short", toolName, toolSlug, fields }: Props) {
  const bausteine = loadBausteine();
  const wa = whatsappUrl(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER, toolName);
  const erstgespraech = process.env.NEXT_PUBLIC_ERSTGESPRAECH_URL;

  const items = (bausteine?.items ?? []).filter((b) => usable(b.text));
  const gewaehlt = items.find((b) => b.name === (fields?.baustein as BausteinName | undefined));
  // «beweis: @baustein» nimmt den Beweis aus content/pitch/bausteine.md, statt ihn im Seitentext zu wiederholen.
  const beweis =
    fields?.beweis === "@baustein"
      ? bausteine?.items.find((b) => b.name === (fields?.baustein as BausteinName | undefined))?.beweis
      : fields?.beweis;
  const angebot = bausteine && usable(bausteine.einstiegsangebot) ? bausteine.einstiegsangebot : null;

  // Ohne Text und ohne Knöpfe (Bausteine noch offen, Ziele nicht gesetzt) bleibt der Abschnitt weg,
  // statt eine Überschrift über einem leeren Kasten zu zeigen.
  const hasText = variant === "short" ? usable(fields?.problem) || !!gewaehlt || usable(beweis) : items.length > 0;
  if (!hasText && !erstgespraech && !wa) return null;

  return (
    <section aria-labelledby="alperna-pitch" className="rounded-lg border border-line bg-surface p-6 md:p-10">
      <h2 id="alperna-pitch">Wenn du das lieber abgibst</h2>

      {variant === "short" ? (
        <div className="content mt-4">
          {usable(fields?.problem) && <p>{fields.problem}</p>}
          {gewaehlt && <p>{gewaehlt.text}</p>}
          {usable(beweis) && <p>{beweis}</p>}
          {gewaehlt?.name === "Website" && angebot && <p>{angebot}</p>}
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {items.map((b) => (
            <article key={b.name}>
              <h3>{b.name}</h3>
              <p className="mt-2">{b.text}</p>
              {usable(b.beweis) && <p className="mt-2 text-muted-foreground">{b.beweis}</p>}
              {b.name === "Website" && angebot && <p className="mt-2 font-medium">{angebot}</p>}
            </article>
          ))}
        </div>
      )}

      {(erstgespraech || wa) && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {erstgespraech && (
            <a
              href={erstgespraech}
              className={cn(buttonVariants({ size: "lg" }))}
              data-umami-event="pitch_erstgespraech"
              data-umami-event-tool={toolSlug}
            >
              Kostenloses Erstgespräch
            </a>
          )}
          {wa && (
            <a
              href={wa}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              data-umami-event="pitch_whatsapp"
              data-umami-event-tool={toolSlug}
            >
              Kurz schreiben
            </a>
          )}
        </div>
      )}
    </section>
  );
}
