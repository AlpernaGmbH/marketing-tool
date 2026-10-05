// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

// Bedienung des Werkzeugs im Browser-Ersatz (jsdom): Formular, E-Mail-Fenster, Ergebnis, CRM-Aufruf, Stand unter mt:angebotsarchitektur.

const fetchMock = vi.fn();

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  clearAllLocal();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillKeller(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Firma"), "Malerei Keller, Gossau");
  const rows: [string, string, string, string][] = [
    ["Zimmer auffrischen", "1500", "9", "150"],
    ["Wohnung streichen (3 Zimmer)", "3000", "22", "500"],
    ["Fassade Einfamilienhaus", "6400", "36", "1000"],
  ];
  for (const [i, [name, preis, aufwand, kosten]] of rows.entries()) {
    const n = i + 1;
    await user.type(screen.getByLabelText(`Leistung ${n}`, { exact: true }), name);
    await user.type(document.getElementById(`aa-preis-${n}`) as HTMLInputElement, preis);
    await user.type(document.getElementById(`aa-aufwand-${n}`) as HTMLInputElement, aufwand);
    const k = document.getElementById(`aa-kosten-${n}`) as HTMLInputElement;
    await user.clear(k);
    await user.type(k, kosten);
  }
  await user.type(screen.getByLabelText("Interner Stundensatz in CHF"), "85");
}

async function enterEmail(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
  await user.click(within(dialog).getByRole("checkbox"));
  await user.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
}

describe("Angebotsarchitektur im Browser", () => {
  it("zeigt Felder mit Beschriftung, drei leere Zeilen und die Standardwerte", async () => {
    render(<Tool />);
    expect(await screen.findByRole("list", { name: "Leistungen" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Leistungen" })).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByLabelText("Zielmarge in % vom Preis")).toHaveValue(30);
    expect(screen.getByLabelText("Interner Stundensatz in CHF")).toHaveValue(null);
    expect(screen.getByLabelText("Form")).toHaveValue("einzel");
    expect(screen.getByLabelText("Premium zuerst zeigen (Anker)", { selector: "#aa-anker" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leistung 1 entfernen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Angebot aufbauen" })).toBeInTheDocument();
    expect(screen.getAllByText(/Die Preisabstände sind eine Faustregel von Alperna, keine Statistik und keine Marktaussage/).length).toBeGreaterThan(0);
  });

  it("meldet Fehler im Formular mit role=alert und fragt noch nicht nach der Adresse", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Tool />);
    await user.click(await screen.findByRole("button", { name: "Angebot aufbauen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Gib den Namen deines Betriebs an.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("vom Formular zum Ergebnis: Fenster, drei Karten, Warnung, CRM-Aufruf, Stand gespeichert", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Tool />);
    await fillKeller(user);
    // Standardzuordnung sichtbar
    expect(screen.getByLabelText("Welche Leistung ist dein Kern?")).toHaveValue("l2");
    expect(screen.getByLabelText("Welche Leistung ist dein Einstieg?")).toHaveValue("l1");
    expect(screen.getByLabelText("Welche Leistung ist dein Premium?")).toHaveValue("l3");

    await user.click(screen.getByRole("button", { name: "Angebot aufbauen" }));
    await enterEmail(user);

    const heading = await screen.findByRole("heading", { name: "Dein Angebot in drei Stufen" });
    expect(screen.getByRole("region", { name: "Dein Angebot in drei Stufen" })).toBeInTheDocument();
    await waitFor(() => expect(heading).toHaveFocus());

    const vergleich = screen.getByRole("list", { name: "Vergleich der drei Stufen" });
    const cards = within(vergleich).getAllByRole("listitem");
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(["aa-stufe-einstieg", "aa-stufe-kern", "aa-stufe-premium"]);
    expect(screen.getByTestId("aa-stufe-kern")).toHaveTextContent("CHF 3'000.-");
    expect(screen.getByTestId("aa-stufe-kern")).toHaveTextContent("Unter deiner Zielmarge von 30 %. Preis für die Zielmarge: CHF 3'390.-.");
    expect(screen.getByTestId("aa-stufe-einstieg")).toHaveTextContent("Zielmarge von 30 % erreicht.");
    expect(screen.getByTestId("aa-dokument")).toHaveTextContent("Warnungen");
    expect(screen.getByTestId("aa-richtwert")).toHaveTextContent("Faustregel von Alperna");
    expect(screen.getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();

    // CRM: /api/lead, dann /api/result mit lesbarer Eingabe und Ausgabe
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/result")).toBe(true));
    const resultCall = fetchMock.mock.calls.find(([url]) => url === "/api/result");
    const body = JSON.parse((resultCall?.[1] as { body: string }).body);
    expect(body.tool).toBe("angebotsarchitektur");
    expect(body.firma).toBe("Malerei Keller, Gossau");
    expect(body.eingabe).toContain("Leistung 1: Zimmer auffrischen, Preis CHF 1'500.-");
    expect(body.eingabe).toContain("Zielmarge: 30 % vom Preis");
    expect(body.ausgabe.startsWith("# Angebotsarchitektur und Preisstrategie")).toBe(true);
    expect(body.ausgabe).toContain("| Kern | Wohnung streichen (3 Zimmer) | CHF 3'000.- |");

    // Stand
    const state = JSON.parse(readLocal("mt:angebotsarchitektur") ?? "null");
    expect(state.phase).toBe("result");
    expect(state.output.stufen.kern.preis).toBe(3000);
    expect(state.leistungen).toHaveLength(3);
  });

  it("nach dem Neuladen steht das Ergebnis wieder da, ohne zweiten CRM-Eintrag", async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<Tool />);
    await fillKeller(user);
    await user.click(screen.getByRole("button", { name: "Angebot aufbauen" }));
    await enterEmail(user);
    await screen.findByRole("heading", { name: "Dein Angebot in drei Stufen" });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/result")).toHaveLength(1));
    unmount();
    cleanup();
    render(<Tool />);
    expect(await screen.findByRole("heading", { name: "Dein Angebot in drei Stufen" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/result")).toHaveLength(1);
  });

  it("«Später» im Fenster lässt das Formular stehen", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Tool />);
    await fillKeller(user);
    await user.click(screen.getByRole("button", { name: "Angebot aufbauen" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Leistung 2", { exact: true })).toHaveValue("Wohnung streichen (3 Zimmer)");
    expect(screen.queryByRole("heading", { name: "Dein Angebot in drei Stufen" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/result")).toBe(false);
  });

  it("Anker dreht die Karten: Premium links", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Tool />);
    await fillKeller(user);
    await user.click(screen.getByLabelText("Premium zuerst zeigen (Anker)", { selector: "#aa-anker" }));
    await user.click(screen.getByRole("button", { name: "Angebot aufbauen" }));
    await enterEmail(user);
    const vergleich = await screen.findByRole("list", { name: "Vergleich der drei Stufen" });
    expect(within(vergleich).getAllByRole("listitem").map((c) => c.getAttribute("data-testid"))).toEqual(["aa-stufe-premium", "aa-stufe-kern", "aa-stufe-einstieg"]);
  });

  it("Form «Pakete» ändert die Beschriftungen der Karten", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Tool />);
    await fillKeller(user);
    await user.selectOptions(screen.getByLabelText("Form"), "pakete");
    await user.click(screen.getByRole("button", { name: "Angebot aufbauen" }));
    await enterEmail(user);
    await screen.findByRole("list", { name: "Vergleich der drei Stufen" });
    expect(screen.getByTestId("aa-stufe-einstieg")).toHaveTextContent("Basis");
    expect(screen.getByTestId("aa-stufe-kern")).toHaveTextContent("Standard");
    expect(screen.getByTestId("aa-stufe-premium")).toHaveTextContent("Komplett");
  });

  it("eine einzige Leistung: Einstieg und Premium sind Vorschläge", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Tool />);
    await user.type(await screen.findByLabelText("Firma"), "Malerei Keller");
    await user.type(screen.getByLabelText("Leistung 1", { exact: true }), "Fassade streichen");
    await user.type(document.getElementById("aa-preis-1") as HTMLInputElement, "1250");
    await user.type(document.getElementById("aa-aufwand-1") as HTMLInputElement, "8");
    await user.clear(document.getElementById("aa-kosten-1") as HTMLInputElement);
    await user.type(document.getElementById("aa-kosten-1") as HTMLInputElement, "150");
    await user.type(screen.getByLabelText("Interner Stundensatz in CHF"), "85");
    expect(screen.getByLabelText("Welche Leistung ist dein Einstieg?")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Angebot aufbauen" }));
    await enterEmail(user);
    await screen.findByRole("list", { name: "Vergleich der drei Stufen" });
    expect(screen.getByTestId("aa-stufe-einstieg")).toHaveTextContent("Vorschlag nach Faustregel");
    expect(screen.getByTestId("aa-stufe-einstieg")).toHaveTextContent("CHF 625.-");
    expect(screen.getByTestId("aa-stufe-premium")).toHaveTextContent("CHF 2'500.-");
    expect(screen.getByTestId("aa-stufe-premium")).toHaveTextContent("Was müsste dieses Angebot enthalten?");
  });

  it("Leistungen hinzufügen bis sechs, danach gesperrt; Entfernen räumt Auswahl auf", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Tool />);
    const add = await screen.findByRole("button", { name: "Leistung hinzufügen" });
    await user.click(add);
    await user.click(add);
    await user.click(add);
    expect(within(screen.getByRole("list", { name: "Leistungen" })).getAllByRole("listitem")).toHaveLength(6);
    expect(add).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Leistung 6 entfernen" }));
    expect(within(screen.getByRole("list", { name: "Leistungen" })).getAllByRole("listitem")).toHaveLength(5);
    expect(add).toBeEnabled();
  });

  it("Zwischenstand: eingetippte Leistungen bleiben nach dem Neuladen", async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<Tool />);
    await user.type(await screen.findByLabelText("Leistung 1", { exact: true }), "Fassade streichen");
    await waitFor(() => expect(JSON.parse(readLocal("mt:angebotsarchitektur") ?? "{}").leistungen?.[0]?.name).toBe("Fassade streichen"), { timeout: 3000 });
    unmount();
    cleanup();
    render(<Tool />);
    expect(await screen.findByLabelText("Leistung 1", { exact: true })).toHaveValue("Fassade streichen");
  });

  it("kaputter Stand im Speicher: leeres Formular statt Absturz", async () => {
    writeLocal("mt:angebotsarchitektur", "{kaputt");
    render(<Tool />);
    expect(await screen.findByRole("list", { name: "Leistungen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Angebot aufbauen" })).toBeInTheDocument();
  });
});
