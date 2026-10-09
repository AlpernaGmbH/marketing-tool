// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DocView } from "@/components/tool/DocView";
import type { DocBlock } from "@/lib/export/model";

afterEach(cleanup);
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null })) as typeof window.matchMedia;
});

const show = (blocks: DocBlock[]) => render(<DocView blocks={blocks} />);

describe("Bildschirm-Bausteine in DocView", () => {
  it("stat: grosse Zahl mit Einstufung, Balken als Messwert und Anmerkung", () => {
    show([{ type: "stat", label: "Marketing-Reife", value: "72", of: "100", band: "Solide Basis", note: "Es fehlt vor allem das Messen." }]);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("Solide Basis")).toBeInTheDocument();
    const meter = screen.getByRole("meter", { name: "Marketing-Reife, Solide Basis" });
    expect(meter).toHaveAttribute("aria-valuenow", "72");
    expect(meter).toHaveAttribute("aria-valuetext", "72 von 100, Solide Basis");
    expect(screen.getByText("Es fehlt vor allem das Messen.")).toBeInTheDocument();
  });

  it("stat: ohne Zahlen kein Balken, nur Text", () => {
    show([{ type: "stat", label: "Stufe", value: "Aufbau" }]);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText("Aufbau")).toBeInTheDocument();
  });

  it("bars: jeder Balken ist ein Messwert mit Beschriftung, Wert in Schweizer Schreibweise und Obergrenze", () => {
    show([{ type: "bars", title: "Beiträge je Woche", unit: "%", items: [{ label: "Instagram", value: 62.5, note: "Hauptkanal" }, { label: "Google", value: 120 }] }]);
    expect(screen.getByRole("heading", { name: "Beiträge je Woche" })).toBeInTheDocument();
    const insta = screen.getByRole("meter", { name: "Instagram" });
    expect(insta).toHaveAttribute("aria-valuetext", "62,5 %");
    expect(screen.getByText("62,5 %")).toBeInTheDocument();
    expect(screen.getByText("Hauptkanal")).toBeInTheDocument();
    // Werte über der Skala laufen nicht aus dem Balken heraus
    const google = screen.getByRole("meter", { name: "Google" });
    expect(google).toHaveAttribute("aria-valuenow", "120");
    expect((google.firstChild as HTMLElement).style.width).toBe("100%");
  });

  it("steps und cards: nummerierte Karten und Karten mit Marke", () => {
    show([
      { type: "steps", title: "So geht es weiter", items: [{ title: "Profil prüfen", text: "Lies es einmal laut." }, { title: "Beitrag planen", text: "Wähle einen Tag." }] },
      { type: "cards", title: "Ideen", items: [{ title: "Team vorstellen", text: "Ein Foto, drei Sätze.", tag: "Reel" }, { title: "Baustelle zeigen" }] },
    ]);
    const steps = screen.getByRole("heading", { name: "So geht es weiter" }).parentElement!;
    expect(within(steps).getAllByRole("listitem")).toHaveLength(2);
    expect(within(steps).getByText("Profil prüfen")).toBeInTheDocument();
    const cards = screen.getByRole("heading", { name: "Ideen" }).parentElement!;
    expect(within(cards).getByText("Reel")).toBeInTheDocument();
    expect(within(cards).getByText("Baustelle zeigen")).toBeInTheDocument();
  });

  it("split: Legende nennt jeden Anteil, bezogen auf 100 Prozent, Kuchen für Vorlesegeräte versteckt", () => {
    const { container } = show([{ type: "split", title: "Themen", items: [{ label: "Wissen", value: 50 }, { label: "Team", value: 30 }, { label: "Angebote", value: 20 }] }]);
    expect(screen.getByText("50 %")).toBeInTheDocument();
    expect(screen.getByText("30 %")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    // Summe ≠ 100: auf 100 % bezogen
    cleanup();
    show([{ type: "split", items: [{ label: "A", value: 1 }, { label: "B", value: 1 }] }]);
    expect(screen.getAllByText("50 %")).toHaveLength(2);
  });

  it("grid: Spalten und Zeilen als Tabelle, leere Zellen als Punkt", () => {
    show([{ type: "grid", title: "Woche", columns: ["Mo", "Di", "Mi"], rows: [{ label: "Vormittag", cells: ["Beitrag", "", "Story"] }] }]);
    expect(screen.getByRole("columnheader", { name: "Di" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Vormittag" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Beitrag" })).toBeInTheDocument();
    expect(screen.getByText("·")).toHaveAttribute("aria-hidden", "true");
  });

  it("slides: Folien mit Zähler, Punkte und Pfeile blättern, Pfeiltasten in der Liste", async () => {
    const u = userEvent.setup();
    show([{ type: "slides", title: "Nächste Schritte", items: [{ title: "Eins", text: "a" }, { title: "Zwei", text: "b", tag: "Heute" }, { title: "Drei", text: "c" }] }]);
    const region = screen.getByRole("region", { name: "Nächste Schritte" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(3);
    expect(within(region).getByText("1 von 3")).toBeInTheDocument();
    expect(within(region).getByText("Heute")).toBeInTheDocument();
    const prev = within(region).getByRole("button", { name: "Vorherige Folie" });
    const next = within(region).getByRole("button", { name: "Nächste Folie" });
    expect(prev).toBeDisabled();
    await u.click(next);
    expect(prev).toBeEnabled();
    expect(within(region).getByRole("button", { name: "Folie 2" })).toHaveAttribute("aria-current", "true");
    await u.click(within(region).getByRole("button", { name: "Folie 3" }));
    expect(next).toBeDisabled();
    const list = within(region).getByRole("list");
    list.focus();
    await u.keyboard("{ArrowLeft}");
    expect(within(region).getByRole("button", { name: "Folie 2" })).toHaveAttribute("aria-current", "true");
  });

  it("slides: eine einzelne Folie braucht keine Bedienung", () => {
    show([{ type: "slides", items: [{ title: "Nur eine", text: "x" }] }]);
    expect(screen.queryByRole("button", { name: "Nächste Folie" })).not.toBeInTheDocument();
  });

  it("radar: Netzdiagramm für Vorlesegeräte versteckt, Legende nennt jeden Wert, der hervorgehobene hat den goldenen Punkt", () => {
    const { container } = show([
      {
        type: "radar",
        title: "Fünf Dimensionen",
        items: [
          { label: "Strategie", value: 60 },
          { label: "Auftritt", value: 25, note: "Stufe «Aufbau»", highlight: true },
          { label: "Inhalte", value: 80 },
        ],
      },
    ]);
    const radar = screen.getByTestId("visual-radar");
    expect(radar.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    const items = within(radar).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveTextContent("Auftritt");
    expect(items[1]).toHaveTextContent("25");
    expect(items[1]).toHaveTextContent("Stufe «Aufbau»");
    // genau ein goldener Punkt im Bild, passend zum hervorgehobenen Wert
    expect(container.querySelectorAll("svg circle[fill='var(--yellow)']")).toHaveLength(1);
  });

  it("radar: mit weniger als drei Werten gibt es kein Diagramm", () => {
    show([{ type: "radar", items: [{ label: "A", value: 1 }, { label: "B", value: 2 }] }]);
    expect(screen.queryByTestId("visual-radar")).not.toBeInTheDocument();
  });

  it("details: zugeklappt, mit Titel und Zusammenfassung, der Inhalt ist darin und lässt sich öffnen", async () => {
    const u = userEvent.setup();
    const { container } = show([
      {
        type: "details",
        title: "Annahmen",
        summary: "Aufwand je Format",
        blocks: [{ type: "heading", level: 3, text: "Format" }, { type: "table", header: ["Format", "Aufwand"], rows: [["Story", "15 Minuten"]] }],
      },
    ]);
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("Annahmen")).toBeInTheDocument();
    expect(within(details).getByText("Aufwand je Format")).toBeInTheDocument();
    expect(within(details).getByRole("table")).toBeInTheDocument();
    await u.click(within(details).getByText("Annahmen"));
    expect(details).toHaveAttribute("open");
  });
});
