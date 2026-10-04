"use client";

import { Check, Minus, X } from "lucide-react";
import Link from "next/link";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ResultCard } from "@/components/tool/ResultCard";
import { ScoreBadge } from "@/components/tool/ScoreBadge";
import { Button } from "@/components/ui/button";
import { dateCH } from "@/lib/ch";
import type { CheckCategory, CheckItem, CheckResult } from "@/lib/check/types";
import { getTool } from "@/lib/registry";
import { scoreBand } from "@/lib/score";
import { countItems, host, measurementNotes, percent, toDocument } from "./logic";

const SHOWN = 8;

function ItemRow({ item }: { item: CheckItem }) {
  const state = item.ok ? "ok" : item.info ? "hinweis" : "offen";
  const Icon = state === "ok" ? Check : state === "offen" ? X : Minus;
  return (
    <li className="grid grid-cols-[1.5rem_1fr] items-start gap-x-2">
      <span
        aria-hidden
        className={`mt-0.5 grid size-6 place-items-center rounded-full border ${state === "offen" ? "border-destructive text-destructive" : "border-line-strong text-ink"}`}
      >
        <Icon className="size-3.5" />
      </span>
      <div>
        <span className="sr-only">{state === "ok" ? "Erfüllt: " : state === "offen" ? "Offen: " : "Hinweis: "}</span>
        <span className="font-medium">{item.label}</span>
        <p className="text-sm text-muted-foreground">{item.detail}</p>
      </div>
    </li>
  );
}

function CategoryBlock({ cat }: { cat: CheckCategory }) {
  const counted = cat.weight > 0;
  const pct = percent(cat.score);
  const band = scoreBand(cat.score);
  return (
    <details className="group rounded-xl border border-line bg-paper">
      <summary className="grid cursor-pointer list-none gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="font-heading font-semibold">{cat.title}</span>
          <span className="text-sm text-muted-foreground">
            {counted ? `${pct} von 100, ${band.text}` : "zählt für deine Branche nicht"}
          </span>
        </span>
        {counted && (
          <span
            role="meter"
            aria-label={cat.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct} von 100, ${band.text}`}
            className="block h-2 w-full overflow-hidden rounded-full bg-line"
          >
            <span className={`block h-full ${band.key === "hoch" ? "bg-ink" : band.key === "mittel" ? "bg-brand" : "bg-yellow"}`} style={{ width: `${pct}%` }} />
          </span>
        )}
        <span className="text-sm underline underline-offset-4 group-open:hidden">Prüfpunkte zeigen</span>
        <span className="hidden text-sm underline underline-offset-4 group-open:inline">Prüfpunkte verbergen</span>
      </summary>
      <div className="grid gap-4 border-t border-line p-4">
        <ul className="grid gap-3">
          {cat.items.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </ul>
        {cat.hint && <p className="text-sm text-muted-foreground">{cat.hint}</p>}
        {cat.note && <p className="text-sm text-muted-foreground">{cat.note}</p>}
      </div>
    </details>
  );
}

type Props = {
  result: CheckResult;
  onRestart: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
};

export function CheckResultView({ result, onRestart, headingRef }: Props) {
  const shown = result.massnahmen.slice(0, SHOWN);
  const { ok, total } = countItems(result);

  return (
    <ResultCard
      title="Dein Ergebnis"
      headingRef={headingRef}
      actions={<DocumentExport model={toDocument(result)} />}
    >
      <ScoreBadge score={result.score} label={`Gesamtpunktzahl für ${host(result.url)}`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ok} von {total} Prüfpunkten erfüllt. Geprüft am {dateCH(result.checkedAt)}.
        </p>
        <Button variant="outline" size="sm" onClick={onRestart}>
          Erneut prüfen
        </Button>
      </div>

      <section aria-labelledby="dac-schritte" className="grid gap-3">
        <h4 id="dac-schritte" className="font-heading text-lg font-semibold">
          Das würde ich zuerst tun
        </h4>
        {shown.length === 0 ? (
          <p>Hier gibt es nichts Dringendes. Prüfe die Punkte in einigen Monaten erneut.</p>
        ) : (
          <ol className="grid gap-4">
            {shown.map((m, i) => {
              const tool = m.tool ? getTool(m.tool) : undefined;
              return (
                <li key={m.id} className="grid gap-1 border-b border-line pb-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-heading font-semibold">{i + 1}.</span>
                    <span className="font-medium">{m.titel}</span>
                  </div>
                  <p className="text-muted-foreground">{m.warum}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.baustein} · Wirkung {m.wirkung} · Aufwand {m.aufwand}
                    {tool && (
                      <>
                        {" · "}
                        <Link href={`/tools/${tool.slug}`} className="underline underline-offset-4">
                          Passendes Werkzeug: {tool.name}
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        {result.massnahmen.length > SHOWN && (
          <p className="text-sm text-muted-foreground">Weitere {result.massnahmen.length - SHOWN} Schritte stehen im Export.</p>
        )}
      </section>

      <section aria-labelledby="dac-bereiche" className="grid gap-3">
        <h4 id="dac-bereiche" className="font-heading text-lg font-semibold">
          Alle Bereiche
        </h4>
        <div className="grid gap-3">
          {result.categories.map((c) => (
            <CategoryBlock key={c.id} cat={c} />
          ))}
        </div>
      </section>

      <section aria-labelledby="dac-messung" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 id="dac-messung" className="font-heading text-base font-semibold">
          Was gemessen ist und was nicht
        </h4>
        <ul className="grid gap-2 text-sm text-muted-foreground">
          {measurementNotes(result).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </ResultCard>
  );
}
