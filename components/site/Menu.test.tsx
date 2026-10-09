// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MegaMenu } from "@/components/site/MegaMenu";
import { MobileMenu } from "@/components/site/MobileMenu";
import type { MenuGroup } from "@/components/site/menu-data";
import { menuGroups } from "@/components/site/menu-data";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

const groups: MenuGroup[] = [
  { page: "strategie", label: "Strategie", tagline: "Satz eins", href: "/strategie", tools: [{ slug: "persona", name: "Persona-Generator" }] },
  { page: "analyse", label: "Analyse", tagline: "Satz zwei", href: "/analyse", tools: [{ slug: "swot", name: "SWOT-Analyse" }] },
];

describe("menuGroups", () => {
  it("liefert die vier Kategorien mit allen Werkzeugen in Pfadreihenfolge", () => {
    const real = menuGroups();
    expect(real.map((g) => g.label)).toEqual(["Strategie", "Analyse", "Inhalte", "Praktisches"]);
    for (const g of real) {
      expect(g.href).toBe(`/${g.page}`);
      expect(g.tools.length).toBeGreaterThan(0);
    }
    expect(real[0].tools[0].slug).toBe("digitaler-auftritt-check");
  });
});

describe("MegaMenu", () => {
  it("hält die Flächen geschlossen, aber im Dokument (Links bleiben ohne Skript auffindbar)", () => {
    const { container } = render(<MegaMenu groups={groups} />);
    expect(screen.getByRole("button", { name: "Strategie" })).toHaveAttribute("aria-expanded", "false");
    const panel = container.querySelector("#menu-strategie") as HTMLElement;
    expect(panel).toHaveAttribute("hidden");
    expect(within(panel).getByText("Persona-Generator", { selector: "span" })).toBeInTheDocument();
  });

  it("öffnet per Klick, schliesst die andere Fläche und schliesst mit Escape wieder", () => {
    const { container } = render(<MegaMenu groups={groups} />);
    const strategie = screen.getByRole("button", { name: "Strategie" });
    const analyse = screen.getByRole("button", { name: "Analyse" });
    fireEvent.click(strategie);
    expect(strategie).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector("#menu-strategie")).not.toHaveAttribute("hidden");
    expect(screen.getByRole("link", { name: "Alle Werkzeuge in «Strategie»" })).toHaveAttribute("href", "/strategie");
    fireEvent.click(analyse);
    expect(strategie).toHaveAttribute("aria-expanded", "false");
    expect(analyse).toHaveAttribute("aria-expanded", "true");
    analyse.focus();
    fireEvent.keyDown(analyse, { key: "Escape" });
    expect(analyse).toHaveAttribute("aria-expanded", "false");
    expect(analyse).toHaveFocus();
  });

  it("klappt mit einem zweiten Klick wieder zu", () => {
    render(<MegaMenu groups={groups} />);
    const strategie = screen.getByRole("button", { name: "Strategie" });
    fireEvent.click(strategie);
    fireEvent.click(strategie);
    expect(strategie).toHaveAttribute("aria-expanded", "false");
  });
});

describe("MobileMenu", () => {
  it("öffnet das Menü, klappt je Kategorie die Werkzeuge auf und schliesst wieder", () => {
    render(<MobileMenu groups={groups} searchItems={[]} />);
    expect(screen.queryByRole("button", { name: "Strategie" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menü" }));
    const strategie = screen.getByRole("button", { name: "Strategie" });
    expect(strategie).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(strategie);
    expect(strategie).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Persona-Generator" })).toHaveAttribute("href", "/tools/persona");
    expect(screen.getByRole("link", { name: "Alle Werkzeuge in «Strategie»" })).toHaveAttribute("href", "/strategie");
    fireEvent.click(screen.getByRole("button", { name: "Schliessen" }));
    expect(screen.queryByRole("button", { name: "Strategie" })).toBeNull();
  });
});
