"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MenuGroup } from "@/components/site/menu-data";
import { Search, type SearchItem } from "@/components/site/Search";
import { CategoryIcon, ToolIcon } from "@/lib/tool-icons";
import { cn } from "cn";

/** Menü auf dem Handy: Suche, dann je Kategorie ein Akkordeon mit allen Werkzeugen. */
export function MobileMenu({ groups, searchItems }: { groups: MenuGroup[]; searchItems: SearchItem[] }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const pathname = usePathname();

  // Nach einem Seitenwechsel schliessen.
  useEffect(() => {
    setOpen(false);
    setSection(null);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
        className="h-11 rounded-full border border-line-strong px-5 text-base font-medium"
      >
        {open ? "Schliessen" : "Menü"}
      </button>
      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-b border-line bg-paper px-5 pb-6 pt-4"
        >
          <Search items={searchItems} onNavigate={() => setOpen(false)} />
          <nav aria-label="Kategorien" className="mt-4">
            <ul className="grid divide-y divide-line">
              {groups.map((g) => {
                const isOpen = section === g.page;
                const panelId = `mobile-${g.page}`;
                return (
                  <li key={g.page}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setSection(isOpen ? null : g.page)}
                      className="flex w-full items-center gap-3 py-3.5 text-left text-lg font-medium"
                    >
                      <CategoryIcon page={g.page} className="size-6 shrink-0" />
                      <span className="flex-1">{g.label}</span>
                      <ChevronDown aria-hidden="true" strokeWidth={1.8} className={cn("size-5 transition-transform duration-300", isOpen && "rotate-180")} />
                    </button>
                    <div id={panelId} hidden={!isOpen} className="pb-3">
                      <Link href={g.href} className="block py-2 font-medium underline underline-offset-4">
                        Alle Werkzeuge in «{g.label}»
                      </Link>
                      <ul className="grid">
                        {g.tools.map((t) => (
                          <li key={t.slug}>
                            <Link href={`/tools/${t.slug}`} className="flex items-center gap-3 py-2.5 text-base">
                              <ToolIcon slug={t.slug} className="size-5 shrink-0" />
                              {t.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
