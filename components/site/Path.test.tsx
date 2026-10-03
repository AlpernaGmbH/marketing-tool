// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathCard } from "@/components/site/PathCard";
import { PathGraphic, type PathStep } from "@/components/site/PathGraphic";
import { clearAllLocal, writeLocal } from "@/lib/storage";

const result = JSON.stringify({ v: 1, phase: "result", step: 0, answers: {}, counted: true });
const running = JSON.stringify({ v: 1, phase: "questions", step: 2, answers: {}, counted: false });

const steps: PathStep[] = [
  { slug: "eins", name: "Erster Schritt", minutes: "5 Minuten" },
  { slug: "zwei", name: "Zweiter Schritt", minutes: "8 Minuten" },
  { slug: "drei", name: "Dritter Schritt", minutes: "1 Minute" },
];

beforeEach(() => clearAllLocal());
afterEach(() => cleanup());

describe("PathCard", () => {
  const card = (slugs: string[]) => render(<PathCard href="/strategie" title="Strategie" text="Beschreibung" slugs={slugs} />);

  it("verlinkt auf die Kategorieseite und zeigt Titel und Text", () => {
    card(["eins"]);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/strategie");
    expect(within(link).getByText("Strategie")).toBeInTheDocument();
    expect(within(link).getByText("Beschreibung")).toBeInTheDocument();
  });
  it("sagt «Im Aufbau», solange der Pfad leer ist", () => {
    card([]);
    expect(screen.getByText("Im Aufbau")).toBeInTheDocument();
  });
  it("nennt die Anzahl in Einzahl und Mehrzahl", async () => {
    card(["eins"]);
    expect(await screen.findByText("1 Werkzeug")).toBeInTheDocument();
    cleanup();
    card(["eins", "zwei"]);
    expect(await screen.findByText("2 Werkzeuge")).toBeInTheDocument();
  });
  it("zählt nur erledigte Werkzeuge (Phase result), nicht begonnene", async () => {
    writeLocal("mt:eins", result);
    writeLocal("mt:zwei", running);
    card(["eins", "zwei"]);
    expect(await screen.findByText("1 von 2 erledigt")).toBeInTheDocument();
  });
  it("meldet einen abgeschlossenen Pfad", async () => {
    writeLocal("mt:eins", result);
    writeLocal("mt:zwei", result);
    card(["eins", "zwei"]);
    expect(await screen.findByText("Pfad abgeschlossen")).toBeInTheDocument();
  });
  it("füllt den Balken im Verhältnis zum Fortschritt", async () => {
    writeLocal("mt:eins", result);
    const { container } = card(["eins", "zwei", "drei", "vier"]);
    await screen.findByText("1 von 4 erledigt");
    const bar = container.querySelector("span[style]") as HTMLElement;
    expect(bar.style.width).toBe("25%");
  });
});

describe("PathGraphic", () => {
  it("listet die Schritte nummeriert mit Link und Dauer", () => {
    render(<PathGraphic steps={steps} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const first = within(items[0]).getByRole("link");
    expect(first).toHaveAttribute("href", "/tools/eins");
    expect(first).toHaveTextContent("1");
    expect(first).toHaveTextContent("Erster Schritt");
    expect(first).toHaveTextContent("5 Minuten");
    expect(within(items[2]).getByRole("link")).toHaveTextContent("1 Minute");
  });
  it("markiert den ersten offenen Schritt als «Als Nächstes» und den erledigten als «Erledigt»", async () => {
    writeLocal("mt:eins", result);
    render(<PathGraphic steps={steps} />);
    const items = screen.getAllByRole("listitem");
    await waitFor(() => expect(within(items[0]).getByText("Erledigt")).toBeInTheDocument());
    expect(within(items[1]).getByText("Als Nächstes")).toBeInTheDocument();
    expect(within(items[2]).queryByText("Als Nächstes")).toBeNull();
    expect(screen.getByText(/1 von 3 erledigt/)).toBeInTheDocument();
  });
  it("zeichnet je Schritt einen Knoten mit passendem Zustand", async () => {
    writeLocal("mt:zwei", result);
    const { container } = render(<PathGraphic steps={steps} />);
    await waitFor(() => expect(container.querySelectorAll("g[data-state='done']")).toHaveLength(1));
    expect([...container.querySelectorAll("g[data-state]")].map((g) => g.getAttribute("data-state"))).toEqual(["next", "done", "open"]);
  });
  it("ist als Dekoration für Hilfstechnologien versteckt", () => {
    render(<PathGraphic steps={steps} />);
    expect(screen.getByTestId("path-graphic")).toHaveAttribute("aria-hidden", "true");
  });
  it("reagiert, wenn ein Werkzeug erledigt wird (auch aus einem anderen Tab)", async () => {
    render(<PathGraphic steps={steps} />);
    await screen.findByText(/0 von 3 erledigt/);
    act(() => writeLocal("mt:eins", result));
    expect(await screen.findByText(/1 von 3 erledigt/)).toBeInTheDocument();
    act(() => writeLocal("mt:zwei", result));
    act(() => writeLocal("mt:drei", result));
    expect(await screen.findByText(/3 von 3 erledigt/)).toBeInTheDocument();
    expect(screen.queryByText("Als Nächstes")).toBeNull();
  });
  it("kommt mit einem einzelnen Schritt zurecht", async () => {
    render(<PathGraphic steps={[steps[0]]} />);
    expect(await screen.findByText(/0 von 1 erledigt/)).toBeInTheDocument();
  });
});
