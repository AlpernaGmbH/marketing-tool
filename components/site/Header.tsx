import Image from "next/image";
import Link from "next/link";
import { HeaderCta } from "@/components/site/GlobalCta";
import { MegaMenu } from "@/components/site/MegaMenu";
import { MobileMenu } from "@/components/site/MobileMenu";
import { Search, type SearchItem } from "@/components/site/Search";
import { menuGroups } from "@/components/site/menu-data";
import { getTools } from "@/lib/registry";

export function searchItems(): SearchItem[] {
  return getTools().map((t) => ({
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    keyword: t.keyword,
    category: t.category,
  }));
}

export function Header() {
  const items = searchItems();
  const groups = menuGroups();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur-md">
      <div className="container-page flex h-[4.5rem] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/brand/alperna-mark.svg" alt="" width={32} height={32} unoptimized priority className="size-8" />
          <span className="text-[1.375rem] font-semibold leading-none tracking-[-0.04em]">alperna</span>
          <span className="eyebrow hidden pt-0.5 sm:inline-flex">Marketing-Tools</span>
        </Link>

        <MegaMenu groups={groups} />

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden md:block">
            <Search items={items} hideOn="/" />
          </div>
          <Link
            href="/profil"
            className="inline-flex h-11 items-center whitespace-nowrap rounded-full border border-line-strong px-4 text-[0.95rem] font-medium transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-page sm:px-5"
          >
            Mein Profil
          </Link>
          <HeaderCta />
          <MobileMenu groups={groups} searchItems={items} />
        </div>
      </div>
    </header>
  );
}
