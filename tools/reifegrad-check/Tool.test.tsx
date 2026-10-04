// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

// Durchlauf im Browser (jsdom): Profil als Kontext, Marketing-Check zählt in «Auftritt» mit, Ergebnis geht ins CRM.

/** Gespeicherter Stand des Marketing-Checks, wie parseCheckState ihn annimmt (Beispiel aus der Spec: 38 von 100). */
const CHECK_STATE = {
  v: 1,
  phase: "result",
  step: 0,
  answers: {},
  form: { industry: "craft", socials: {} },
  result: { v: 1, score: 38, company: "Malerei Keller", url: "https://malerei-keller.ch", checkedAt: "2026-10-03T09:00:00.000Z", categories: [], massnahmen: [], facts: {} },
};

/** Antworten des Rechenbeispiels (Malerei Keller), als Beschriftung der Antwort. */
const KELLER_LABELS = [
  "Im Kopf oder mündlich besprochen",
  "Grob, zum Beispiel «Privatkunden in der Region»",
  "Eine Person, unter 2 Stunden pro Woche",
  "Im letzten Jahr",
  "Bestätigt, Öffnungszeiten und Angaben stimmen",
  "Etwa einmal im Monat",
  "Manchmal, vor allem die kritischen",
  "Gelegentlich, zum Beispiel eine Karte zum Jahresende",
  "Anzahl Anfragen und woher sie kommen",
  "Nein, wir zahlen, wenn etwas anfällt",
];

function mockApi() {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
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
    expect(await screen.findByText(`Frage ${i + 1} von 10`)).toBeInTheDocument();
    await u.click(screen.getByLabelText(KELLER_LABELS[i]));
    await u.click(screen.getByRole("button", { name: i < KELLER_LABELS.length - 1 ? "Weiter" : "Zur Zusammenfassung" }));
  }
}

describe("Reifegrad-Check im Browser", () => {
  it("stellt zehn Fragen, nimmt den Marketing-Check zur Hälfte in «Auftritt» und schickt das Ergebnis ins CRM", async () => {
    writeLocal(`mt:digitaler-auftritt-check`, JSON.stringify(CHECK_STATE));
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau", branche: "Malerei", groesse: "10-49" }));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);

    expect(await screen.findByText(/vom 03\.10\.2026 zählt in der Dimension «Auftritt» zur Hälfte mit/)).toBeInTheDocument();
    expect(screen.getByText("10 Fragen")).toBeInTheDocument(); // Profilfelder ersetzen keine Frage
    await u.click(screen.getByRole("button", { name: "Starten" }));
    await answerAll(u);

    expect(await screen.findByRole("heading", { name: "Zusammenfassung" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));

    const card = await screen.findByRole("region", { name: "Dein Marketing-Reifegrad" });
    expect(within(card).getByRole("meter", { name: "Reifegrad gesamt, Stufe «Aufbau»" })).toHaveAttribute("aria-valuenow", "42");
    expect(within(card).getByRole("meter", { name: "Auftritt" })).toHaveAttribute("aria-valuenow", "53");
    expect(within(card).getByText(/Selbstangabe 67, Marketing-Check 38/)).toBeInTheDocument();
    expect(within(card).getByText(/\(38 von 100\) zählt in «Auftritt» zur Hälfte mit/)).toBeInTheDocument();
    expect(within(card).getByRole("meter", { name: "Steuerung" })).toHaveAttribute("aria-valuenow", "22");
    // Schwächste Dimension zuerst
    const steps = within(card).getAllByRole("listitem").filter((li) => /^\d+\./.test(li.textContent ?? ""));
    expect(steps[0]).toHaveTextContent("Steuerung");
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();

    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("reifegrad-check");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe)).toContain("Sind deine Marketingziele schriftlich festgehalten?: Im Kopf oder mündlich besprochen");
    expect(String(body.eingabe)).not.toContain("Malerei"); // Profilkontext ist keine gestellte Frage
    expect(String(body.ausgabe)).toContain("42 von 100, Stufe «Aufbau»");
    expect(String(body.ausgabe)).toContain("| Auftritt | 53 von 100 (Selbstangabe 67, Check 38) | Routine |");
    expect(String(body.ausgabe)).toContain("10 bis 49 Mitarbeitende");
  });

  it("zählt ohne gespeicherten Check nur die Selbstangabe und verlinkt den Marketing-Check", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);

    expect(await screen.findByText(/Lass zuerst den/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Marketing-Check" })).toHaveAttribute("href", "/tools/digitaler-auftritt-check");
    await u.click(screen.getByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));

    const card = await screen.findByRole("region", { name: "Dein Marketing-Reifegrad" });
    expect(within(card).getByRole("meter", { name: "Reifegrad gesamt, Stufe «Aufbau»" })).toHaveAttribute("aria-valuenow", "44");
    expect(within(card).getByRole("meter", { name: "Auftritt" })).toHaveAttribute("aria-valuenow", "67");
    expect(within(card).getByText(/nur deine Selbstangabe/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Marketing-Check" })).toHaveAttribute("href", "/tools/digitaler-auftritt-check");
  });
});
