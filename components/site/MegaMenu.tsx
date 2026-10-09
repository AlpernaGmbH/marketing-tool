"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuGroup } from "@/components/site/menu-data";
import { CategoryIcon, ToolIcon } from "@/lib/tool-icons";
import { cn } from "cn";

const OPEN_DELAY_MS = 80;
const CLOSE_DELAY_MS = 180;

/**
 * Menü der vier Kategorien. Jede Kategorie öffnet eine Fläche mit allen Werkzeugen und ihren Piktogrammen.
 * Öffnet per Überfahren (Maus), Fokus-und-Enter, Leertaste oder Klick; Escape schliesst und gibt den Fokus zurück.
 * Die Flächen stehen immer im Dokument (nur ausgeblendet), damit die Links ohne Skript auffindbar bleiben.
 */
export function MegaMenu({ groups }: { groups: MenuGroup[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const later = useCallback((value: string | null, ms: number) => {
    clear();
    timer.current = setTimeout(() => setOpen(value), ms);
  }, []);

  // Nach einem Seitenwechsel schliessen, beim Abbau den Zeitgeber löschen.
  useEffect(() => setOpen(null), [pathname]);
  useEffect(() => clear, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    e.preventDefault();
    triggers.current.get(open)?.focus();
    clear();
    setOpen(null);
  };

  return (
    <nav
      aria-label="Kategorien"
      className="hidden md:block"
      onKeyDown={onKeyDown}
      onPointerLeave={(e) => e.pointerType === "mouse" && later(null, CLOSE_DELAY_MS)}
      onBlur={(e) => {
        // Fokus verlässt Menü und Fläche: schliessen. Die Fläche liegt in diesem nav.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(null);
      }}
    >
      <ul className="flex items-center gap-1 text-[0.95rem]">
        {groups.map((g) => {
          const isOpen = open === g.page;
          const panelId = `menu-${g.page}`;
          return (
            <li key={g.page}>
              <button
                type="button"
                ref={(el) => {
                  if (el) triggers.current.set(g.page, el);
                  else triggers.current.delete(g.page);
                }}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => {
                  clear();
                  setOpen(isOpen ? null : g.page);
                }}
                onPointerEnter={(e) => e.pointerType === "mouse" && later(g.page, open ? 0 : OPEN_DELAY_MS)}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full px-4 font-medium transition-colors duration-300 hover:bg-surface",
                  isOpen && "bg-surface",
                )}
              >
                {g.label}
                <ChevronDown aria-hidden="true" strokeWidth={1.8} className={cn("size-4 transition-transform duration-300", isOpen && "rotate-180")} />
              </button>
              <div
                id={panelId}
                hidden={!isOpen}
                onPointerEnter={(e) => e.pointerType === "mouse" && clear()}
                className="absolute inset-x-0 top-full border-b border-line bg-paper"
              >
                <div className="container-page grid gap-8 py-8 lg:grid-cols-[18rem_1fr]">
                  <div>
                    <CategoryIcon page={g.page} className="size-8" />
                    <p className="mt-3 font-heading text-2xl font-medium tracking-[-0.03em]">{g.label}</p>
                    <p className="mt-2 text-muted-foreground">{g.tagline}</p>
                    <Link href={g.href} className="link-slide mt-4 inline-block py-1 font-medium">
                      Alle Werkzeuge in «{g.label}»
                    </Link>
                  </div>
                  <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                    {g.tools.map((t) => (
                      <li key={t.slug}>
                        <Link href={`/tools/${t.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface">
                          <ToolIcon slug={t.slug} className="size-6 shrink-0" />
                          <span className="font-medium">{t.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
