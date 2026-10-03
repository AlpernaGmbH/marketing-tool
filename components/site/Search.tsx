"use client";

import Fuse from "fuse.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

export type SearchItem = {
  slug: string;
  name: string;
  tagline: string;
  keyword: string;
  category: string;
};

type Props = {
  items: SearchItem[];
  /** «hero» ist grösser und steht auf der Startseite. */
  variant?: "header" | "hero";
  onNavigate?: () => void;
};

export function Search({ items, variant = "header", onNavigate }: Props) {
  const id = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: [
          { name: "name", weight: 3 },
          { name: "keyword", weight: 2 },
          { name: "tagline", weight: 1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [items],
  );

  const trimmed = query.trim();
  const results = trimmed.length >= 2 ? fuse.search(trimmed, { limit: 6 }).map((r) => r.item) : [];
  const listId = `${id}-results`;

  function go(slug: string) {
    setQuery("");
    onNavigate?.();
    router.push(`/tools/${slug}`);
  }

  return (
    <div className={variant === "hero" ? "w-full max-w-xl" : "w-full md:w-64"}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) go(results[0].slug);
        }}
      >
        <label htmlFor={id} className="sr-only">
          Werkzeug suchen
        </label>
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Werkzeug suchen"
          autoComplete="off"
          aria-controls={listId}
          className="h-11 w-full rounded-lg border border-input bg-paper px-3 text-base placeholder:text-muted-foreground"
        />
      </form>
      <div id={listId} aria-live="polite" className={trimmed.length >= 2 ? "mt-2" : "sr-only"}>
        {trimmed.length >= 2 &&
          (results.length > 0 ? (
            <ul className="rounded-lg border border-line bg-paper p-1 text-left">
              {results.map((tool) => (
                <li key={tool.slug}>
                  <Link
                    href={`/tools/${tool.slug}`}
                    onClick={() => {
                      setQuery("");
                      onNavigate?.();
                    }}
                    className="block rounded-md px-3 py-2 hover:bg-surface"
                  >
                    <span className="block font-medium">{tool.name}</span>
                    <span className="block text-sm text-muted-foreground">{tool.tagline}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 text-sm text-muted-foreground">Kein Werkzeug gefunden.</p>
          ))}
      </div>
    </div>
  );
}
