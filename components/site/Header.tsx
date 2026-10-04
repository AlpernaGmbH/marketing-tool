import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/site/AccountMenu";
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
    <header className="sticky top-0 z-40 border-b border-line bg-page/90 backdrop-blur-md">
      <div className="container-page flex h-[4.5rem] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/brand/alperna-mark.svg" alt="" width={32} height={32} unoptimized priority className="size-8" />
          <span className="text-[1.375rem] font-semibold leading-none tracking-[-0.04em]">alperna</span>
          <span className="eyebrow hidden pt-0.5 sm:inline-flex">Marketing-Tools</span>
        </Link>

        <nav aria-label="Kategorien" className="hidden md:block">
          <ul className="flex items-center gap-6 text-[0.95rem]">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="link-slide py-2">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden md:block">
            <Search items={items} hideOn="/" />
          </div>
          <AccountMenu />
          <MobileMenu links={NAV_LINKS} searchItems={items} />
        </div>
      </div>
    </header>
  );
}
