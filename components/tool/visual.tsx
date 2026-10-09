"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "cn";
import { Contours } from "@/components/site/Contours";
import type { VisualBlock } from "@/lib/export/model";

// Bildschirm-Bausteine für Ergebnisse (Beschluss vom 09.10.2026): grosse Zahlen, Balken, Karten, Kuchen, Raster und Folien statt
// Fliesstext. Reine SVG und CSS ohne Bibliothek, in den Farben von Alperna (Tinte, Gold, Grautöne). Jeder Baustein trägt seinen Inhalt
// als Text, nie nur als Farbe oder Form; die Diagramme sind für Vorlesegeräte versteckt und ihre Legende ist der Text.

type Of<T extends VisualBlock["type"]> = Extract<VisualBlock, { type: T }>;

const nf = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

function BlockTitle({ text }: { text?: string }) {
  return text ? <h5 className="font-heading font-medium">{text}</h5> : null;
}

/** Grosse Kennzahl mit Einstufung und, wenn beides Zahlen sind, einem Balken. */
export function Stat({ label, value, of, band, note }: Omit<Of<"stat">, "type">) {
  const v = Number(value.replace(",", "."));
  const max = of ? Number(of.replace(",", ".")) : NaN;
  const numeric = Number.isFinite(v) && Number.isFinite(max) && max > 0;
  return (
    <figure className="relative isolate grid gap-4 overflow-hidden rounded-xl border border-line bg-paper p-6 md:p-8" data-testid="visual-stat">
      <Contours className="!opacity-[0.07]" />
      <figcaption className="eyebrow">{label}</figcaption>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-6xl font-medium leading-none tracking-tight md:text-7xl">{value}</span>
        {of && <span className="font-mono text-xl text-muted-foreground">von {of}</span>}
        {band && <span className="font-serif text-2xl italic leading-tight md:text-3xl">{band}</span>}
      </div>
      {numeric && (
        <div
          role="meter"
          aria-label={band ? `${label}, ${band}` : label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.min(Math.max(v, 0), max)}
          aria-valuetext={`${value} von ${of}${band ? `, ${band}` : ""}`}
          className="h-2 w-full overflow-hidden rounded-full bg-line"
        >
          <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(Math.max(v / max, 0), 1) * 100}%` }} />
        </div>
      )}
      {note && <p className="measure text-muted-foreground">{note}</p>}
    </figure>
  );
}

/** Waagrechte Balken mit Beschriftung und Wert. */
export function Bars({ title, unit, max, items }: Omit<Of<"bars">, "type">) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const suffix = unit === "%" ? " %" : unit ? ` ${unit}` : "";
  return (
    <div className="grid gap-3" data-testid="visual-bars">
      <BlockTitle text={title} />
      <ul className="grid gap-4">
        {items.map((it) => (
          <li key={it.label} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-4">
              <span>{it.label}</span>
              <span className="font-mono text-sm">
                {nf(it.value)}
                {suffix}
              </span>
            </div>
            <div
              role="meter"
              aria-label={it.label}
              aria-valuemin={0}
              aria-valuemax={top}
              aria-valuenow={Math.min(Math.max(it.value, 0), top)}
              aria-valuetext={`${nf(it.value)}${suffix}`}
              className="h-2.5 w-full overflow-hidden rounded-full bg-line"
            >
              <div className={cn("h-full rounded-full", it.highlight ? "border border-ink bg-yellow" : "bg-ink")} style={{ width: `${Math.min(Math.max(it.value / top, 0), 1) * 100}%` }} />
            </div>
            {it.note && <p className="text-sm text-muted-foreground">{it.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Nummerierte Schritte als Karten mit grosser Ziffer in Instrument Serif. */
export function Steps({ title, items }: Omit<Of<"steps">, "type">) {
  return (
    <div className="grid gap-3" data-testid="visual-steps">
      <BlockTitle text={title} />
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it, i) => (
          <li key={`${i}-${it.title}`} className="grid content-start gap-2 rounded-xl border border-line bg-paper p-5">
            <span aria-hidden="true" className="font-serif text-5xl italic leading-none">
              {i + 1}
            </span>
            <span className="font-heading font-medium">{it.title}</span>
            <span className="text-muted-foreground">{it.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Karten im Raster, optional mit Marke. */
export function Cards({ title, items }: Omit<Of<"cards">, "type">) {
  return (
    <div className="grid gap-3" data-testid="visual-cards">
      <BlockTitle text={title} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((it, i) => (
          <li key={`${i}-${it.title}`} className="grid content-start gap-2 rounded-xl border border-line bg-paper p-5">
            {it.tag && <span className="eyebrow">{it.tag}</span>}
            <span className="font-heading font-medium">{it.title}</span>
            {it.text && <span className="text-muted-foreground">{it.text}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Farben der Kuchenstücke: Tinte, Gold, dann Abstufungen der Tinte. Die Legende nennt jedes Stück mit Namen und Wert. */
const SLICE_COLORS = ["var(--ink)", "var(--yellow)", "rgb(15 15 14 / 0.6)", "rgb(15 15 14 / 0.4)", "rgb(15 15 14 / 0.25)", "rgb(15 15 14 / 0.14)"];

/** Anteile als Kuchen mit Legende. Werte werden auf 100 % bezogen, auch wenn die Summe davon abweicht. */
export function Split({ title, items }: Omit<Of<"split">, "type">) {
  const total = items.reduce((n, i) => n + Math.max(i.value, 0), 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="grid gap-3" data-testid="visual-split">
      <BlockTitle text={title} />
      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-line bg-paper p-5">
        <svg viewBox="0 0 140 140" className="size-36 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth="22" />
          {items.map((it, i) => {
            const len = (Math.max(it.value, 0) / total) * C;
            const seg = (
              <circle
                key={it.label}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
                strokeWidth="22"
                strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <ul className="grid min-w-0 flex-1 gap-2">
          {items.map((it, i) => (
            <li key={it.label} className="flex items-center gap-3">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-sm border border-line-strong" style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }} />
              <span className="min-w-0 flex-1">{it.label}</span>
              <span className="font-mono text-sm">{nf((Math.max(it.value, 0) / total) * 100)} %</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Raster mit Spalten und beschrifteten Zeilen, zum Beispiel Wochentage und Zeitfenster. Zellen ohne Text zeigen einen Punkt. */
export function Grid({ title, columns, rows }: Omit<Of<"grid">, "type">) {
  return (
    <div className="grid gap-3" data-testid="visual-grid">
      <BlockTitle text={title} />
      <div className="overflow-x-auto rounded-xl border border-line bg-paper">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr>
              <td className="w-24 border-b border-line p-3" />
              {columns.map((c) => (
                <th key={c} scope="col" className="border-b border-line p-3 text-left font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="border-b border-line p-3 text-left font-medium">
                  {r.label}
                </th>
                {columns.map((c, i) => (
                  <td key={c} className="border-b border-line p-2 align-top">
                    {r.cells[i]?.trim() ? (
                      <span className="block whitespace-pre-line rounded-lg bg-surface px-2.5 py-1.5">{r.cells[i]}</span>
                    ) : (
                      <span aria-hidden="true" className="block px-2.5 py-1.5 text-muted-foreground/40">
                        ·
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Karten zum Durchblättern: Wischen am Handy, Pfeile und Punkte am Bildschirm, Pfeiltasten in der Liste. */
export function Slides({ title, items }: Omit<Of<"slides">, "type">) {
  const list = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  const go = useCallback(
    (to: number) => {
      const el = list.current;
      if (!el) return;
      const index = Math.min(Math.max(to, 0), items.length - 1);
      const child = el.children[index] as HTMLElement | undefined;
      child?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "start", block: "nearest" });
      setActive(index);
    },
    [items.length],
  );

  function onScroll() {
    const el = list.current;
    if (!el || el.children.length === 0) return;
    const first = el.children[0] as HTMLElement;
    const step = first.offsetWidth + 16;
    setActive(Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / step))));
  }

  return (
    <section aria-roledescription="Karussell" aria-label={title ?? "Karten"} className="grid gap-3" data-testid="visual-slides">
      <BlockTitle text={title} />
      <ul
        ref={list}
        tabIndex={0}
        aria-label={`${title ?? "Karten"}, Pfeiltasten blättern`}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") (e.preventDefault(), go(active + 1));
          if (e.key === "ArrowLeft") (e.preventDefault(), go(active - 1));
        }}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-scrollbar]:hidden"
      >
        {items.map((it, i) => (
          <li
            key={`${i}-${it.title}`}
            aria-roledescription="Folie"
            aria-label={`${i + 1} von ${items.length}`}
            className="grid w-[82%] shrink-0 snap-start content-start gap-2 rounded-xl border border-line bg-paper p-6 sm:w-[46%] xl:w-[32%]"
          >
            <span className="eyebrow">{it.tag ?? `${i + 1} von ${items.length}`}</span>
            <span className="font-heading text-xl font-medium leading-snug">{it.title}</span>
            <span className="text-muted-foreground">{it.text}</span>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2" role="group" aria-label="Folie wählen">
            {items.map((it, i) => (
              <button
                key={`${i}-${it.title}`}
                type="button"
                onClick={() => go(i)}
                aria-label={`Folie ${i + 1}`}
                aria-current={i === active}
                className={cn("h-2.5 rounded-full border border-ink transition-[width] motion-reduce:transition-none", i === active ? "w-8 bg-ink" : "w-2.5 bg-transparent")}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Vorherige Folie" className="grid size-10 place-items-center rounded-full border border-ink disabled:opacity-30">
              <span aria-hidden="true">←</span>
            </button>
            <button type="button" onClick={() => go(active + 1)} disabled={active === items.length - 1} aria-label="Nächste Folie" className="grid size-10 place-items-center rounded-full border border-ink disabled:opacity-30">
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Wählt den Baustein zum Block. */
export function VisualBlockView({ block }: { block: VisualBlock }) {
  switch (block.type) {
    case "stat":
      return <Stat {...block} />;
    case "bars":
      return <Bars {...block} />;
    case "steps":
      return <Steps {...block} />;
    case "cards":
      return <Cards {...block} />;
    case "split":
      return <Split {...block} />;
    case "grid":
      return <Grid {...block} />;
    case "slides":
      return <Slides {...block} />;
  }
}
