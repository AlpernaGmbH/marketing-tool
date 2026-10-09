"use client";

import Link from "next/link";
import { PATH_VIEW, pathPoints, segmentPath } from "@/components/site/path-geometry";
import { summarizePath } from "@/lib/progress";
import { useDoneSlugs } from "@/lib/use-progress";

export type PathStep = { slug: string; name: string; minutes: string };

type Props = { steps: PathStep[] };

/**
 * Pfad als SVG mit Fortschritt aus dem lokalen Speicher (mt:<slug>, Phase «result»).
 * Die Grafik ist Dekoration; die nummerierte Liste darunter trägt Links und Zustand.
 */
export function PathGraphic({ steps }: Props) {
  const { done, ready } = useDoneSlugs(steps.map((s) => s.slug));
  const summary = summarizePath(
    steps.map((s) => s.slug),
    done,
  );
  const points = pathPoints(steps.length);

  return (
    <div>
      {steps.length > 1 && (
        <svg
          viewBox={`0 0 ${PATH_VIEW.width} ${PATH_VIEW.height}`}
          aria-hidden="true"
          focusable="false"
          className="h-auto w-full"
          style={{ maxWidth: Math.max(160, Math.min(PATH_VIEW.width, steps.length * 110)) }}
          data-testid="path-graphic"
        >
          {points.slice(1).map((p, i) => {
            const walked = ready && done.has(steps[i].slug) && done.has(steps[i + 1].slug);
            return (
              <path
                key={steps[i + 1].slug}
                d={segmentPath(points[i], p)}
                fill="none"
                strokeWidth={walked ? 4 : 3}
                strokeLinecap="round"
                strokeDasharray={walked ? undefined : "2 9"}
                className={walked ? "stroke-ink" : "stroke-line"}
              />
            );
          })}
          {points.map((p, i) => {
            const isDone = ready && done.has(steps[i].slug);
            const isNext = ready && summary.next === steps[i].slug;
            return (
              <g key={steps[i].slug} data-state={isDone ? "done" : isNext ? "next" : "open"}>
                {isNext && <circle cx={p.x} cy={p.y} r={19} className="fill-none stroke-yellow" strokeWidth={4} />}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12}
                  strokeWidth={3}
                  className={isDone ? "fill-yellow stroke-ink" : isNext ? "fill-paper stroke-ink" : "fill-paper stroke-line"}
                />
                {isDone && (
                  <path d={`M${p.x - 5} ${p.y} L${p.x - 1} ${p.y + 4} L${p.x + 6} ${p.y - 4}`} fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="stroke-ink" />
              )}
            </g>
          );
        })}
      </svg>
      )}

      <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        {steps.map((s, i) => {
          const isDone = ready && done.has(s.slug);
          const isNext = ready && summary.next === s.slug;
          return (
            <li key={s.slug}>
              <Link
                href={`/tools/${s.slug}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-line bg-paper px-4 py-3 hover:border-ink"
              >
                <span className="w-6 shrink-0 font-heading font-semibold">{i + 1}</span>
                <span className="min-w-0 flex-1 font-medium">{s.name}</span>
                <span className="text-sm text-muted-foreground">{s.minutes}</span>
                {isDone && <span className="rounded-full bg-yellow px-2 py-0.5 text-sm font-medium text-ink">Erledigt</span>}
                {isNext && !isDone && <span className="rounded-full border border-ink px-2 py-0.5 text-sm font-medium">Als Nächstes</span>}
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        {ready ? `${summary.done} von ${summary.total} erledigt. Der Stand bleibt in deinem Browser.` : " "}
      </p>
    </div>
  );
}
