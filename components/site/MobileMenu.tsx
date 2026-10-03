"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, type SearchItem } from "@/components/site/Search";

type NavLink = { href: string; label: string };

export function MobileMenu({ links, searchItems }: { links: NavLink[]; searchItems: SearchItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Nach einem Seitenwechsel schliessen.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
        className="h-11 rounded-lg border border-input px-4 text-base font-medium"
      >
        {open ? "Schliessen" : "Menü"}
      </button>
      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-40 border-b border-line bg-paper px-5 pb-6 pt-4"
        >
          <Search items={searchItems} onNavigate={() => setOpen(false)} />
          <nav aria-label="Kategorien" className="mt-4">
            <ul className="grid">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block py-3 text-lg font-medium">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
