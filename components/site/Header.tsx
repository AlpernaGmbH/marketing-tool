import Link from "next/link";
import { MobileMenu } from "@/components/site/MobileMenu";
import { Search, type SearchItem } from "@/components/site/Search";
import { CATEGORY_LABELS, CATEGORY_PAGES, getTools } from "@/lib/registry";

export function searchItems(): SearchItem[] {
  return getTools().map((t) => ({
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    keyword: t.keyword,
    category: t.category,
  }));
}

export const NAV_LINKS = CATEGORY_PAGES.map((page) => ({ href: `/${page}`, label: CATEGORY_LABELS[page] }));

export function Header() {
  const items = searchItems();
  return (
    <header className="relative border-b border-line bg-paper">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="font-heading text-xl font-bold tracking-tight"
          aria-label="Alperna Marketing-Tools, zur Startseite"
        >
          Alperna
          <span className="ml-2 hidden text-sm font-semibold text-muted-foreground sm:inline">Marketing-Tools</span>
        </Link>

        <nav aria-label="Kategorien" className="hidden md:block">
          <ul className="flex items-center gap-5 text-[0.95rem] font-medium">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Search items={items} hideOn="/" />
          <Link href="/profil" className="whitespace-nowrap text-[0.95rem] font-medium underline-offset-4 hover:underline">
            Mein Profil
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Link href="/profil" className="px-2 py-3 text-base font-medium underline-offset-4 hover:underline">
            Mein Profil
          </Link>
          <MobileMenu links={NAV_LINKS} searchItems={items} />
        </div>
      </div>
    </header>
  );
}
