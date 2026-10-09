// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

// Durchlauf im Browser (jsdom): Profil als Kontext, Website-Scan (Marketing-Check) liefert Auftritt und Inhalte, Ergebnis geht ins CRM.

const CHECK_KEY = "mt:digitaler-auftritt-check";

/** Ergebnis des Marketing-Checks im Format von parseCheckState (Beispiel Malerei Keller: 38 von 100). */
const CHECK_RESULT = {
  v: 1,
  score: 38,
  company: "Malerei Keller",
  url: "https://malerei-keller.ch",
  checkedAt: "2026-10-03T09:00:00.000Z",
  categories: [
    { id: "seo", score: 0.6, items: [] },
    { id: "gbp", score: 0.5, verified: false, items: [] },
    { id: "social", score: 0.4, items: [] },
    { id: "sea", score: 0.4, items: [{ id: "sea.analytics", ok: false }] },
  ],
  massnahmen: [],
  facts: {},
};

/** Gespeicherter Stand des Marketing-Checks, wie parseCheckState ihn annimmt. */
const CHECK_STATE = { v: 1, phase: "result", step: 0, answers: {}, form: { industry: "craft", socials: {} }, result: CHECK_RESULT };

/** Antworten des Rechenbeispiels (Malerei Keller), als Beschriftung der Antwort, in der Reihenfolge der Fragen. */
const KELLER_LABELS = [
  "Im Kopf oder mündlich besprochen",
  "Grob, zum Beispiel «Privatkunden in der Region»",
  "Eine Person, unter 2 Stunden pro Woche",
  "Manchmal, vor allem die kritischen",
  "Gelegentlich, zum Beispiel eine Karte zum Jahresende",
  "Nein, wir zahlen, wenn etwas anfällt",
];

type Call = { path: string; body: Record<string, unknown> };

/** /api/result und /api/lead antworten ok; /api/check liefert den NDJSON-Strom mit `checkReply` (Standard: das Ergebnis oben). */
function mockApi(checkReply: () => Response = () => new Response(`${JSON.stringify({ type: "result", result: CHECK_RESULT })}\n`, { status: 200 })) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (path === "/api/check") return checkReply();
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }),
  );
  return calls;
}

beforeEach(() => {
  clearAllLocal();
  writeLocal(LEAD_KEY, "anna@keller.ch");
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

async function answerAll(u: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < KELLER_LABELS.length; i++) {
    expect(await screen.findByText(`Frage ${i + 1} von 6`)).toBeInTheDocument();
    await u.click(screen.getByLabelText(KELLER_LABELS[i]));
    await u.click(screen.getByRole("button", { name: i < KELLER_LABELS.length - 1 ? "Weiter" : "Zur Zusammenfassung" }));
  }
}

const radarItem = (card: HTMLElement, name: string) => within(within(card).getByTestId("visual-radar")).getAllByRole("listitem").find((li) => li.textContent?.startsWith(name));

describe("Reifegrad-Check im Browser", () => {
  it("stellt sechs Fragen, nimmt Auftritt und Inhalte aus dem gespeicherten Website-Scan und schickt das Ergebnis ins CRM", async () => {
    writeLocal(CHECK_KEY, JSON.stringify(CHECK_STATE));
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau", branche: "Malerei", groesse: "10-49" }));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);

    expect(await screen.findByText(/Dein Scan vom 03\.10\.2026 ist gespeichert/)).toBeInTheDocument();
    expect(screen.getByText("6 Fragen")).toBeInTheDocument(); // Profilfelder ersetzen keine Frage
    expect(screen.getByTestId("scan-stand")).toHaveTextContent("Marketing-Check 38 von 100");
    await u.click(screen.getByRole("button", { name: "Starten" }));
    await answerAll(u);

    expect(await screen.findByRole("heading", { name: "Zusammenfassung" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));

    const card = await screen.findByRole("region", { name: "Dein Marketing-Reifegrad" });
    expect(within(card).getByRole("meter", { name: "Reifegrad gesamt, Stufe «Aufbau»" })).toHaveAttribute("aria-valuenow", "35");
    expect(radarItem(card, "Auftritt")).toHaveTextContent("56");
    expect(radarItem(card, "Inhalte")).toHaveTextContent("40");
    expect(radarItem(card, "Steuerung")).toHaveTextContent("11");
    expect(within(card).getByText(/vom 03\.10\.2026 \(38 von 100\)/)).toBeInTheDocument();
    expect(within(card).getByText(/Das Google-Profil ist nicht über Google bestätigt/)).toBeInTheDocument();
    // Schwächste Dimension zuerst
    const folien = within(within(card).getByRole("region", { name: /Nächste Schritte/ })).getAllByRole("listitem");
    expect(folien.length).toBeGreaterThanOrEqual(5);
    expect(folien[0]).toHaveTextContent("Schritt 1");
    expect(folien[0]).toHaveTextContent("Steuerung");
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();

    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("reifegrad-check");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe)).toContain("Sind deine Marketingziele schriftlich festgehalten?: Im Kopf oder mündlich besprochen");
    expect(String(body.eingabe)).not.toContain("Malerei"); // Profilkontext ist keine gestellte Frage
    expect(String(body.ausgabe)).toContain("35 von 100, Stufe «Aufbau»");
    expect(String(body.ausgabe)).toContain("| Auftritt | 56 von 100 | Routine | Website-Scan |");
    expect(String(body.ausgabe)).toContain("10 bis 49 Mitarbeitende");
  });

  it("bewertet ohne Scan nur drei Dimensionen, sagt das im Ergebnis und im CRM-Text", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);

    expect(await screen.findByText(/Ohne Scan sind Auftritt und Inhalte nicht bewertet/)).toBeInTheDocument();
    expect(screen.queryByTestId("scan-stand")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));

    const card = await screen.findByRole("region", { name: "Dein Marketing-Reifegrad" });
    expect(within(card).getByRole("meter", { name: "Reifegrad gesamt, Stufe «Aufbau»" })).toHaveAttribute("aria-valuenow", "28");
    expect(within(within(card).getByTestId("visual-radar")).getAllByRole("listitem")).toHaveLength(3);
    expect(radarItem(card, "Auftritt")).toBeUndefined();
    expect(within(card).getByText(/Nicht bewertet: Auftritt und Inhalte/)).toBeInTheDocument();
    expect(within(card).getByText(/sind nicht bewertet, weil kein Website-Scan vorliegt/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Marketing-Check" })).toHaveAttribute("href", "/tools/digitaler-auftritt-check");
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    expect(String(calls.find((c) => c.path === "/api/result")!.body.ausgabe)).toContain("nicht bewertet: Auftritt, Inhalte");
  });
});

describe("Reifegrad-Check: Website-Scan", () => {
  it("startet den Marketing-Check mit Firma und Website aus dem Profil, speichert das Ergebnis und schickt nichts ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau", website: "malerei-keller.ch", branche: "Malerei" }));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);

    await u.click(await screen.findByRole("button", { name: "Website prüfen" }));
    expect(await screen.findByTestId("scan-stand")).toHaveTextContent("Gespeicherter Scan vom 03.10.2026: Marketing-Check 38 von 100.");
    expect(screen.getByRole("button", { name: "Website noch einmal prüfen" })).toBeEnabled();
    const check = calls.filter((c) => c.path === "/api/check");
    expect(check).toHaveLength(1);
    expect(check[0].body).toMatchObject({ company: "Malerei Keller", website: "malerei-keller.ch", city: "Gossau", industry: "craft" });
    expect(JSON.stringify(check[0].body)).not.toContain("anna@keller.ch");
    // Der Scan steht unter dem Schlüssel des Marketing-Checks, den beide Werkzeuge nutzen
    const stored = JSON.parse(readLocal(CHECK_KEY) ?? "null");
    expect(stored.phase).toBe("result");
    expect(stored.result.score).toBe(38);
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
    expect(screen.getByText(/Dein Scan vom 03\.10\.2026 ist gespeichert/)).toBeInTheDocument();
  });

  it("meldet eine fehlende Website in role=alert und ruft den Server nicht auf", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau" }));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Website prüfen" }));
    expect(await screen.findByTestId("scan-fehler")).toHaveTextContent("Bitte gib eine Website an.");
    expect(calls.filter((c) => c.path === "/api/check")).toHaveLength(0);
  });

  it("zeigt den Satz des Servers, wenn der Scan scheitert, und lässt den Stand unverändert", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", website: "malerei-keller.ch" }));
    mockApi(() => new Response(JSON.stringify({ message: "Die Website konnte nicht geladen werden." }), { status: 502 }));
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Website prüfen" }));
    expect(await screen.findByTestId("scan-fehler")).toHaveTextContent("Die Website konnte nicht geladen werden.");
    expect(screen.queryByTestId("scan-stand")).not.toBeInTheDocument();
    expect(readLocal(CHECK_KEY)).toBeNull();
  });
});
