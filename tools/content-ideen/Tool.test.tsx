// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { downloadBytes } from "@/lib/download";
import { PROFILE_KEY } from "@/lib/profile";
import { isToolDone } from "@/lib/progress";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { EMPTY_FILTER, IDEEN, PAGE_SIZE, filterIdeen, type Filter } from "./logic";
import Tool from "./Tool";

// Durchlauf im Browser (jsdom): Filter, Suche, Merkliste im Browser, Export hinter dem E-Mail-Fenster, ein CRM-Eintrag je Liste.
// Der Download selbst (Blob, Anker) ist ersetzt; geprüft werden Dateiname und Inhalt.
vi.mock("@/lib/download", () => ({ downloadBytes: vi.fn() }));

const TODAY = new Date("2026-10-05T10:00:00Z");

function mockApi() {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
  return calls;
}

const filter = (patch: Partial<Filter> = {}): Filter => ({ ...EMPTY_FILTER, ...patch });

beforeEach(() => {
  clearAllLocal();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(downloadBytes).mockClear();
});

/** Rendert das Werkzeug und wartet, bis das Profil gelesen ist (dann steht der laufende Monat im Filter). */
async function open() {
  render(<Tool />);
  await waitFor(() => expect(screen.getByLabelText("Monat")).toHaveValue("10"));
  return userEvent.setup();
}

const cards = () => within(screen.getByRole("list", { name: "Ideen" })).getAllByTestId("ci-card");
const merkSection = () => screen.getByRole("region", { name: "Deine Merkliste" });

describe("Content-Ideen im Browser: Filter und Liste", () => {
  it("belegt Branche und Monat aus Profil und Uhr vor und zeigt die erste Seite", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", branche: "Malerei", ort: "Gossau" }));
    await open();
    const form = screen.getByRole("form", { name: "Filter" });
    await waitFor(() => expect(within(form).getByLabelText("Branche")).toHaveValue("handwerk"));
    expect(within(form).getByLabelText("Monat")).toHaveValue("10");
    expect(within(form).getByLabelText("Format")).toHaveValue("alle");
    expect(screen.getByText(/Vorbelegt aus deinem Firmenprofil \(Branche: Malerei\)/)).toBeInTheDocument();
    const expected = filterIdeen(IDEEN, filter({ branche: "handwerk", monat: 10 }));
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${expected.length} Ideen`);
    expect(cards()).toHaveLength(PAGE_SIZE);
    expect(cards()[0]).toHaveAttribute("data-idea-id", expected[0].id);
    expect(screen.getByText(/Dein Firmenprofil:/)).toBeInTheDocument();
  });

  it("ohne Profil: alle Branchen, laufender Monat, Ideen aus allen Branchen", async () => {
    await open();
    expect(screen.getByLabelText("Branche")).toHaveValue("alle");
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${filterIdeen(IDEEN, filter({ monat: 10 })).length} Ideen`);
  });

  it("Format, Ziel, Säule und Monat schränken die Liste ein und zählen mit", async () => {
    const u = await open();
    await u.selectOptions(screen.getByLabelText("Monat"), "alle");
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${IDEEN.length} Ideen`);

    await u.selectOptions(screen.getByLabelText("Format"), "gbp-post");
    const gbp = filterIdeen(IDEEN, filter({ format: "gbp-post" }));
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${gbp.length} Ideen`);
    for (const card of cards()) expect(within(card).getByText("Google-Beitrag")).toBeInTheDocument();

    await u.selectOptions(screen.getByLabelText("Ziel"), "anfragen");
    await u.selectOptions(screen.getByLabelText("Säule"), "angebot");
    await u.selectOptions(screen.getByLabelText("Monat"), "11");
    const combined = filterIdeen(IDEEN, filter({ format: "gbp-post", ziel: "anfragen", saeule: "angebot", monat: 11 }));
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${combined.length} ${combined.length === 1 ? "Idee" : "Ideen"}`);
    expect(combined.length).toBeGreaterThan(0);
  });

  it("die Suche findet «Küche» auch als «kueche» und zeigt «0 Ideen» mit Hinweis, wenn nichts passt", async () => {
    const u = await open();
    await u.selectOptions(screen.getByLabelText("Monat"), "alle");
    await u.type(screen.getByLabelText("Suchen"), "kueche");
    const expected = filterIdeen(IDEEN, EMPTY_FILTER, "küche");
    expect(expected.length).toBeGreaterThan(0);
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${expected.length} ${expected.length === 1 ? "Idee" : "Ideen"}`);

    await u.clear(screen.getByLabelText("Suchen"));
    await u.type(screen.getByLabelText("Suchen"), "zzzzzzzz");
    expect(screen.getByTestId("ci-count")).toHaveTextContent("0 Ideen");
    expect(screen.getByTestId("ci-empty")).toHaveTextContent("Keine Idee passt zu diesen Filtern.");
    expect(screen.getByTestId("ci-random")).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Ideen" })).not.toBeInTheDocument();

    await u.click(within(screen.getByTestId("ci-empty")).getByRole("button", { name: "Alle Filter aufheben" }));
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${IDEEN.length} Ideen`);
    expect(screen.getByLabelText("Suchen")).toHaveValue("");
  });

  it("«Nur Ideen für alle Betriebe» zeigt nur diese; bei einer Branche lassen sich sie mit dem Kästchen abwählen", async () => {
    const u = await open();
    await u.selectOptions(screen.getByLabelText("Monat"), "alle");
    expect(screen.queryByLabelText("Ideen für alle Betriebe mitzeigen")).not.toBeInTheDocument();

    await u.selectOptions(screen.getByLabelText("Branche"), "uebergreifend");
    const nurAlle = filterIdeen(IDEEN, filter({ branche: "uebergreifend" }));
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${nurAlle.length} Ideen`);

    await u.selectOptions(screen.getByLabelText("Branche"), "gastronomie");
    const mit = filterIdeen(IDEEN, filter({ branche: "gastronomie" }));
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${mit.length} Ideen`);
    const box = screen.getByLabelText("Ideen für alle Betriebe mitzeigen");
    expect(box).toBeChecked();
    await u.click(box);
    const ohne = filterIdeen(IDEEN, filter({ branche: "gastronomie", mitAllgemein: false }));
    expect(ohne.length).toBeLessThan(mit.length);
    expect(screen.getByTestId("ci-count")).toHaveTextContent(`${ohne.length} Ideen`);
  });

  it("legt mit «Mehr Ideen anzeigen» eine Seite nach und setzt den Fokus auf die erste neue Karte", async () => {
    const u = await open();
    await u.selectOptions(screen.getByLabelText("Monat"), "alle");
    expect(cards()).toHaveLength(PAGE_SIZE);
    expect(screen.getByTestId("ci-shown")).toHaveTextContent(`${PAGE_SIZE} von ${IDEEN.length} Ideen angezeigt.`);
    await u.click(screen.getByTestId("ci-more"));
    expect(cards()).toHaveLength(PAGE_SIZE * 2);
    expect(document.activeElement).toBe(cards()[PAGE_SIZE]);
  });

  it("nennt die eigenen Säulen aus dem Profil, filtert aber nur nach den festen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ branche: "Malerei", contentSaeulen: [{ name: "Handwerk zeigen" }, { name: "Team und Lehre" }, { name: "" }] }));
    await open();
    expect(screen.getByTestId("ci-saeulen-hint")).toHaveTextContent("Deine Säulen: Handwerk zeigen, Team und Lehre.");
    const options = within(screen.getByLabelText("Säule")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Alle Säulen", "Arbeit", "Wissen", "Team", "Angebot", "Region"]);
  });

  it("jede Karte zeigt Titel, Beschrieb, ersten Satz, Format, Aufwand, Ziel und Monate", async () => {
    const u = await open();
    await u.selectOptions(screen.getByLabelText("Branche"), "handwerk");
    await u.selectOptions(screen.getByLabelText("Monat"), "alle");
    const card = cards().find((c) => c.getAttribute("data-idea-id") === "handwerk-01")!;
    expect(card).toBeTruthy();
    expect(within(card).getByText("Eine Wand erhält neue Farbe, Schritt für Schritt")).toBeInTheDocument();
    expect(within(card).getByText(/Filme die Arbeit vom Abdecken/)).toBeInTheDocument();
    expect(within(card).getByText("«Diese Wand hat lange auf einen neuen Anstrich gewartet.»")).toBeInTheDocument();
    expect(within(card).getByText("Erster Satz:")).toBeInTheDocument();
    for (const [term, value] of [["Format", "Reel"], ["Aufwand", "mittel"], ["Ziel", "Sichtbarkeit"], ["Monate", "März bis Mai, September und Oktober"]]) {
      expect(within(card).getByText(term).nextElementSibling).toHaveTextContent(value);
    }
  });
});

describe("Content-Ideen im Browser: Zufall", () => {
  it("hebt eine Karte hervor und setzt den Fokus darauf, auch wenn sie hinter der ersten Seite liegt", async () => {
    const u = await open();
    await u.selectOptions(screen.getByLabelText("Monat"), "alle");
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    await u.click(screen.getByTestId("ci-random"));
    const list = filterIdeen(IDEEN, EMPTY_FILTER);
    const picked = list[Math.floor(0.99 * list.length)];
    const card = cards().find((c) => c.getAttribute("data-idea-id") === picked.id)!;
    expect(card).toBeTruthy();
    expect(card).toHaveAttribute("data-highlight", "true");
    expect(document.activeElement).toBe(card);
    expect(cards().filter((c) => c.hasAttribute("data-highlight"))).toHaveLength(1);
  });

  it("wählt beim zweiten Klick eine andere Karte", async () => {
    const u = await open();
    vi.spyOn(Math, "random").mockReturnValue(0);
    await u.click(screen.getByTestId("ci-random"));
    const first = cards().find((c) => c.hasAttribute("data-highlight"))!.getAttribute("data-idea-id");
    await u.click(screen.getByTestId("ci-random"));
    const second = cards().find((c) => c.hasAttribute("data-highlight"))!.getAttribute("data-idea-id");
    expect(second).not.toBe(first);
  });
});

describe("Content-Ideen im Browser: Merkliste", () => {
  it("«Merken» schreibt Merkliste und Stand, «Gemerkt» nimmt zurück, «Entfernen» in der Liste auch", async () => {
    const u = await open();
    const first = within(screen.getByRole("list", { name: "Ideen" })).getAllByRole("button", { name: "Merken" })[0];
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(merkSection()).toHaveTextContent("Noch nichts gemerkt");
    expect(readLocal("mt:content-ideen")).toBeNull();

    await u.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveTextContent("Gemerkt");
    const stored = JSON.parse(readLocal("mt:merkliste")!);
    expect(stored.v).toBe(1);
    expect(stored.ideen).toHaveLength(1);
    expect(stored.ideen[0].id).toBe(cards()[0].getAttribute("data-idea-id"));
    expect(Number.isNaN(Date.parse(stored.ideen[0].gemerktAm))).toBe(false);
    expect(JSON.parse(readLocal("mt:content-ideen")!)).toEqual({ v: 1, output: { gemerkt: 1 } });
    expect(isToolDone(readLocal("mt:content-ideen"))).toBe(true);
    expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("1 Idee gemerkt");
    const items = within(screen.getByRole("list", { name: "Gemerkte Ideen" })).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(IDEEN.find((i) => i.id === stored.ideen[0].id)!.titel);

    await u.click(within(merkSection()).getByRole("button", { name: "Entfernen" }));
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(first).toHaveTextContent("Merken");
    expect(JSON.parse(readLocal("mt:merkliste")!).ideen).toEqual([]);
    expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("Noch nichts gemerkt");
    // Der Stand bleibt: Das Werkzeug zählt im Pfad weiter als erledigt.
    expect(isToolDone(readLocal("mt:content-ideen"))).toBe(true);
    expect(document.activeElement).toBe(screen.getByText("Deine Merkliste"));

    await u.click(first);
    await u.click(first);
    expect(JSON.parse(readLocal("mt:merkliste")!).ideen).toEqual([]);
  });

  it("liest die gespeicherte Merkliste beim Öffnen und lässt unbekannte IDs in Ruhe", async () => {
    writeLocal("mt:merkliste", JSON.stringify({ v: 1, ideen: [{ id: "handwerk-01", gemerktAm: "2026-10-01T08:00:00.000Z" }, { id: "gibt-es-nicht", gemerktAm: "" }, { id: "alle-02", gemerktAm: "" }] }));
    const u = await open();
    await waitFor(() => expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("2 Ideen gemerkt"));
    const titles = within(screen.getByRole("list", { name: "Gemerkte Ideen" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(titles[0]).toContain("Eine Wand erhält neue Farbe, Schritt für Schritt");
    expect(titles[1]).toContain("Ein Arbeitstag im Zeitraffer");

    await u.click(within(merkSection()).getAllByRole("button", { name: "Entfernen" })[0]);
    const stored = JSON.parse(readLocal("mt:merkliste")!);
    expect(stored.ideen.map((e: { id: string }) => e.id)).toEqual(["gibt-es-nicht", "alle-02"]); // fremde Einträge bleiben
  });

  it("kaputte Daten unter mt:merkliste ergeben eine leere Liste, ohne Absturz", async () => {
    writeLocal("mt:merkliste", "{kaputt");
    writeLocal("mt:content-ideen", "[1,2");
    await open();
    expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("Noch nichts gemerkt");
    expect(screen.queryByRole("button", { name: "CSV herunterladen" })).not.toBeInTheDocument();
  });

  it("«Liste leeren» fragt nach und leert erst nach «Ja, leeren»", async () => {
    writeLocal("mt:merkliste", JSON.stringify({ v: 1, ideen: [{ id: "handwerk-01", gemerktAm: "" }, { id: "handwerk-03", gemerktAm: "" }] }));
    const u = await open();
    await waitFor(() => expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("2 Ideen gemerkt"));
    await u.click(within(merkSection()).getByRole("button", { name: "Liste leeren" }));
    await u.click(within(merkSection()).getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("2 Ideen gemerkt");
    await u.click(within(merkSection()).getByRole("button", { name: "Liste leeren" }));
    await u.click(within(merkSection()).getByRole("button", { name: "Ja, leeren" }));
    expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("Noch nichts gemerkt");
    expect(JSON.parse(readLocal("mt:merkliste")!).ideen).toEqual([]);
  });

  it("die Karten kommen auch nach dem Neuladen als «Gemerkt» zurück", async () => {
    const id = filterIdeen(IDEEN, filter({ monat: 10 }))[0].id;
    writeLocal("mt:merkliste", JSON.stringify({ v: 1, ideen: [{ id, gemerktAm: "" }] }));
    await open();
    const card = cards()[0];
    expect(card).toHaveAttribute("data-idea-id", id);
    await waitFor(() => expect(within(card).getByRole("button", { name: "Gemerkt" })).toHaveAttribute("aria-pressed", "true"));
    expect(cards()[1]).toBeTruthy();
    expect(within(cards()[1]).getByRole("button", { name: "Merken" })).toHaveAttribute("aria-pressed", "false");
  });

  it("kopiert die Merkliste als Markdown, ohne E-Mail-Adresse", async () => {
    writeLocal("mt:merkliste", JSON.stringify({ v: 1, ideen: [{ id: "handwerk-03", gemerktAm: "" }] }));
    const u = await open();
    await waitFor(() => expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("1 Idee gemerkt"));
    await u.click(within(merkSection()).getByRole("button", { name: "Merkliste kopieren" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toContain("# Content-Ideen: Merkliste (1 Idee)"));
    expect(await navigator.clipboard.readText()).toContain("Erster Satz: «Das Wichtigste an einem guten Anstrich sieht später niemand mehr.»");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Content-Ideen im Browser: Export", () => {
  const MERKT = { v: 1, ideen: [{ id: "handwerk-01", gemerktAm: "" }, { id: "handwerk-03", gemerktAm: "" }] };

  it("ohne Adresse kommt erst das Fenster; danach lädt die Datei, und das Ergebnis geht einmal ins CRM", async () => {
    const calls = mockApi();
    writeLocal("mt:merkliste", JSON.stringify(MERKT));
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller, Gossau", branche: "Malerei" }));
    const u = await open();
    await waitFor(() => expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("2 Ideen gemerkt"));
    expect(screen.getByText(/Für Dateien brauchen wir deine E-Mail-Adresse/)).toBeInTheDocument();
    await u.type(screen.getByLabelText("Suchen"), "wand");

    await u.click(screen.getByRole("button", { name: "CSV herunterladen" }));
    const dialog = await screen.findByRole("dialog");
    expect(downloadBytes).not.toHaveBeenCalled();
    await u.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));

    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1));
    const [bytes, filename, mime] = vi.mocked(downloadBytes).mock.calls[0];
    expect(filename).toBe("content-ideen-malerei-keller-gossau.csv");
    expect(mime).toBe("text/csv;charset=utf-8");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain("Titel;Beschrieb;Hook;Format;Ziel;Aufwand;Monate");
    expect(csv).toContain("Eine Wand erhält neue Farbe, Schritt für Schritt");
    expect(screen.getByTestId("ci-notice")).toHaveTextContent("CSV heruntergeladen.");

    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const result = calls.find((c) => c.path === "/api/result")!.body;
    expect(result.tool).toBe("content-ideen");
    expect(result.firma).toBe("Malerei Keller, Gossau");
    expect(String(result.eingabe).split("\n").slice(0, 3)).toEqual(["Branche: Handwerk (mit Ideen für alle Betriebe)", "Monat: Oktober", "Format: alle"]);
    expect(result.eingabe).toContain("Suche: wand");
    expect(result.eingabe).toContain("Export: CSV");
    expect(result.eingabe).toContain("- Eine Wand erhält neue Farbe, Schritt für Schritt");
    expect(String(result.ausgabe).startsWith("# Content-Ideen: Merkliste (2 Ideen)")).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Später» im Fenster lässt die Merkliste stehen und lädt nichts", async () => {
    const calls = mockApi();
    writeLocal("mt:merkliste", JSON.stringify(MERKT));
    const u = await open();
    await waitFor(() => expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("2 Ideen gemerkt"));
    await u.click(screen.getByRole("button", { name: "Kalender-Entwurf (.ics) herunterladen" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(downloadBytes).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("2 Ideen gemerkt");
  });

  it("mit bekannter Adresse lädt die Datei sofort; dieselbe Liste noch einmal löst keinen zweiten CRM-Eintrag aus, eine andere Datei schon", async () => {
    const calls = mockApi();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    writeLocal("mt:merkliste", JSON.stringify(MERKT));
    const u = await open();
    await waitFor(() => expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("2 Ideen gemerkt"));
    const results = () => calls.filter((c) => c.path === "/api/result");

    await u.click(screen.getByRole("button", { name: "CSV herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(results()).toHaveLength(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "CSV herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(2));
    expect(results()).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: "Kalender-Entwurf (.ics) herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(results()).toHaveLength(2));
    expect(String(results()[1].body.eingabe)).toContain("Export: Kalender-Entwurf (.ics)");
    expect(String(results()[1].body.eingabe)).not.toContain("Suche: wand");

    const [bytes, filename, mime] = vi.mocked(downloadBytes).mock.calls[2];
    expect(filename).toBe("content-ideen.ics");
    expect(mime).toBe("text/calendar;charset=utf-8");
    const ics = new TextDecoder().decode(bytes);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Idee: Warum wir vor dem Streichen schleifen");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261005");

    // Eine andere Liste ist wieder ein Ergebnis.
    await u.click(within(merkSection()).getAllByRole("button", { name: "Entfernen" })[0]);
    await u.click(screen.getByRole("button", { name: "CSV herunterladen" }));
    await waitFor(() => expect(results()).toHaveLength(3));
    expect(String(results()[2].body.ausgabe).startsWith("# Content-Ideen: Merkliste (1 Idee)")).toBe(true);
  });

  it("zeigt die Export-Knöpfe erst, wenn etwas gemerkt ist", async () => {
    const u = await open();
    expect(screen.queryByRole("button", { name: "CSV herunterladen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kalender-Entwurf (.ics) herunterladen" })).not.toBeInTheDocument();
    await u.click(within(screen.getByRole("list", { name: "Ideen" })).getAllByRole("button", { name: "Merken" })[0]);
    expect(screen.getByRole("button", { name: "CSV herunterladen" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Kalender-Entwurf (.ics) herunterladen" })).toBeEnabled();
  });

  it("meldet einen gescheiterten Download in role=alert und schickt dann nichts ins CRM", async () => {
    const calls = mockApi();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    writeLocal("mt:merkliste", JSON.stringify(MERKT));
    vi.mocked(downloadBytes).mockImplementationOnce(() => {
      throw new Error("kaputt");
    });
    const u = await open();
    await waitFor(() => expect(screen.getByTestId("ci-merk-count")).toHaveTextContent("2 Ideen gemerkt"));
    await u.click(screen.getByRole("button", { name: "CSV herunterladen" }));
    expect(await within(merkSection()).findByRole("alert")).toHaveTextContent("Der Download hat nicht geklappt.");
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
  });
});
