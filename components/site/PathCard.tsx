"use client";

import Link from "next/link";
import { summarizePath } from "@/lib/progress";
import { useDoneSlugs } from "@/lib/use-progress";

type Props = {
  href: string;
  title: string;
  text: string;
  /** Slugs der Werkzeuge im Pfad, in Pfadreihenfolge. */
  slugs: string[];
};

/** Karte auf der Startseite: Pfad, Beschreibung und Fortschritt aus dem lokalen Speicher. */
export function PathCard({ href, title, text, slugs }: Props) {
  const { done, ready } = useDoneSlugs(slugs);
  const s = summarizePath(slugs, done);
  const count = slugs.length;
  const status =
    count === 0
      ? "Im Aufbau"
      : !ready
        ? `${count} ${count === 1 ? "Werkzeug" : "Werkzeuge"}`
        : s.complete
          ? "Pfad abgeschlossen"
          : s.done > 0
            ? `${s.done} von ${count} erledigt`
            : `${count} ${count === 1 ? "Werkzeug" : "Werkzeuge"}`;
  const ratio = ready && count > 0 ? s.done / count : 0;

  return (
    <Link href={href} className="group flex h-full flex-col rounded-xl border border-line bg-paper p-5 transition-colors hover:border-ink">
      <span className="font-heading text-xl font-semibold group-hover:underline group-hover:underline-offset-4">{title}</span>
      <span className="mt-2 flex-1 text-base text-muted-foreground">{text}</span>
      <span className="mt-4 text-sm font-medium">{status}</span>
      <span aria-hidden="true" className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-line">
        <span className="block h-full bg-ink" style={{ width: `${ratio * 100}%` }} />
      </span>
    </Link>
  );
}
