import { CATEGORY_LABELS, CATEGORY_PAGES, CATEGORY_TAGLINES, getPath, type CategoryPage } from "@/lib/registry";

/** Eine Kategorie im Menü: Kopf (Name, Satz, Link) und die Werkzeuge in Pfadreihenfolge. */
export type MenuGroup = {
  page: CategoryPage;
  label: string;
  tagline: string;
  href: string;
  tools: { slug: string; name: string }[];
};

export function menuGroups(): MenuGroup[] {
  return CATEGORY_PAGES.map((page) => ({
    page,
    label: CATEGORY_LABELS[page],
    tagline: CATEGORY_TAGLINES[page],
    href: `/${page}`,
    tools: getPath(page).map((t) => ({ slug: t.slug, name: t.name })),
  }));
}
