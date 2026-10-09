// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolShell } from "@/components/tool/ToolShell";
import { LEAD_KEY } from "@/lib/access-client";
import { clearAllLocal, writeLocal } from "@/lib/storage";
import { AiPanel } from "./AiPanel";
import { TEXT_MAX, type CheckOutput } from "./generator";

// «Mit KI prüfen» im Browser (jsdom): kein Aufruf ohne Klick, Liste der Änderungen, korrigierter Text, CRM, Ausfall, veralteter Text.
// /api/generate wird durch eine Antwortliste ersetzt.

const TEXT = "Die Mallerei Keller streicht Fassaden in Gossau. Das ist ein ein Angebot für alle Häuser an der Straße.";

const KI: CheckOutput = {
  gesamt: "Der Text ist verständlich, hat aber drei Fehler.",
  aenderungen: [
    { art: "fehler", original: "Mallerei", vorschlag: "Malerei", grund: "Doppeltes l, richtig ist Malerei." },
    { art: "fehler", original: "ein ein", vorschlag: "ein", grund: "Das Wort steht doppelt." },
    { art: "stil", original: "Das ist ein ein Angebot für alle Häuser", vorschlag: "Das Angebot gilt für alle Häuser", grund: "Kürzer und klarer." },
  ],
};

type Call = { path: string; body: Record<string, unknown> };
type Reply = { status: number; body: unknown };

function mockApi(replies: Reply[]) {
  const calls: Call[] = [];
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path === "/api/lead" || path === "/api/result") return json({ ok: true });
      if (path === "/api/generate") {
        const r = replies[Math.min(n++, replies.length - 1)];
        return json(r.body, r.status);
      }
      return json({}, 404);
    }),
  );
  return {
    count: (p: string) => calls.filter((c) => c.path === p).length,
    last: (p: string) => calls.filter((c) => c.path === p).at(-1),
  };
}

const ok = (output: CheckOutput): Reply => ({ status: 200, body: { ok: true, output } });

const panel = (source: string) => (
  <ToolShell slug="textcheck" name="Textcheck" usesProfile={false}>
    <AiPanel source={source} />
  </ToolShell>
);

beforeEach(() => {
  clearAllLocal();
  writeLocal(LEAD_KEY, "anna@keller.ch");
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

describe("Textcheck, Prüfung mit KI im Browser", () => {
  it("schickt ohne Klick nichts und nennt den Weg der Daten", async () => {
    const m = mockApi([ok(KI)]);
    render(panel(TEXT));
    expect(await screen.findByRole("button", { name: "Mit KI prüfen" })).toBeEnabled();
    expect(screen.getByText(/nicht deine E-Mail-Adresse/)).toBeInTheDocument();
    expect(screen.queryByTestId("ki-ergebnis")).not.toBeInTheDocument();
    expect(m.count("/api/generate")).toBe(0);
    expect(m.count("/api/result")).toBe(0);
  });

  it("zeigt Gesamteindruck, Fehler, Verbesserungen und den korrigierten Text und schickt Eingabe und Ausgabe ins CRM", async () => {
    const m = mockApi([ok(KI)]);
    const u = userEvent.setup();
    render(panel(TEXT));
    await u.click(await screen.findByRole("button", { name: "Mit KI prüfen" }));

    const box = await screen.findByTestId("ki-ergebnis");
    expect(box).toHaveTextContent("Von einer KI formuliert.");
    expect(within(box).getByRole("region", { name: "Gesamteindruck" })).toHaveTextContent("hat aber drei Fehler");
    const fehler = within(box).getByRole("region", { name: "Fehler" });
    const items = within(fehler).getAllByTestId("ki-aenderung");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Original: Mallerei");
    expect(items[0]).toHaveTextContent("Vorschlag: Malerei");
    expect(items[0]).toHaveTextContent("Doppeltes l, richtig ist Malerei.");
    expect(within(items[0]).getByRole("button", { name: "Vorschlag 1 kopieren" })).toBeInTheDocument();
    const stil = within(box).getByRole("region", { name: "Verbesserungen" });
    expect(within(stil).getByRole("button", { name: "Vorschlag 3 kopieren" })).toBeInTheDocument();
    const korrigiert = within(box).getByRole("region", { name: "Korrigierter Text" });
    expect(korrigiert).toHaveTextContent("2 Stellen sind korrigiert.");
    expect(korrigiert).toHaveTextContent("Die Malerei Keller streicht Fassaden in Gossau. Das ist ein Angebot für alle Häuser an der Straße.");
    expect(within(box).getByRole("button", { name: "Korrigierten Text kopieren" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Alles kopieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Noch einmal prüfen" })).toBeEnabled();

    // Anfrage: nur der Text, nie die Adresse
    expect(m.count("/api/generate")).toBe(1);
    expect(m.last("/api/generate")?.body).toEqual({ tool: "textcheck", input: { text: TEXT } });
    expect(JSON.stringify(m.last("/api/generate")?.body)).not.toContain("anna@keller.ch");

    // CRM: der Text als Eingabe, die Prüfung als Markdown
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")?.body as { tool: string; eingabe: string; ausgabe: string };
    expect(crm.tool).toBe("textcheck");
    expect(crm.eingabe).toBe(TEXT);
    expect(crm.ausgabe.startsWith("# Textcheck mit KI")).toBe(true);
    expect(crm.ausgabe).toContain("1. «Mallerei» → «Malerei»");
    expect(crm.ausgabe).toContain("## Korrigierter Text");
  });

  it("sagt bei einer leeren Liste, dass nichts gefunden wurde, und zeigt keinen korrigierten Text", async () => {
    mockApi([ok({ gesamt: "Der Text ist sauber geschrieben und gut lesbar.", aenderungen: [] })]);
    const u = userEvent.setup();
    render(panel(TEXT));
    await u.click(await screen.findByRole("button", { name: "Mit KI prüfen" }));
    const box = await screen.findByTestId("ki-ergebnis");
    expect(box).toHaveTextContent("Die KI hat keine Fehler gefunden.");
    expect(box).toHaveTextContent("Die KI schlägt keine Verbesserungen vor.");
    expect(within(box).queryByRole("region", { name: "Korrigierter Text" })).not.toBeInTheDocument();
    expect(within(box).queryByRole("button", { name: "Korrigierten Text kopieren" })).not.toBeInTheDocument();
  });

  it("zeigt bei einem Ausfall der KI einen ruhigen Satz in role=alert und kein Ergebnis", async () => {
    const m = mockApi([{ status: 502, body: { error: "ai_failed" } }]);
    const u = userEvent.setup();
    render(panel(TEXT));
    await u.click(await screen.findByRole("button", { name: "Mit KI prüfen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert.");
    expect(screen.queryByTestId("ki-ergebnis")).not.toBeInTheDocument();
    expect(m.count("/api/result")).toBe(0);
  });

  it("weist darauf hin, wenn der Text nach der Prüfung geändert wurde", async () => {
    mockApi([ok(KI)]);
    const u = userEvent.setup();
    const view = render(panel(TEXT));
    await u.click(await screen.findByRole("button", { name: "Mit KI prüfen" }));
    await screen.findByTestId("ki-ergebnis");
    expect(screen.queryByTestId("ki-veraltet")).not.toBeInTheDocument();
    view.rerender(panel(`${TEXT} Und noch ein Satz.`));
    expect(await screen.findByTestId("ki-veraltet")).toHaveTextContent("Du hast den Text seit der Prüfung geändert.");
  });

  it("verlangt für die KI höchstens 3'000 Zeichen und ruft sonst nichts auf", async () => {
    const m = mockApi([ok(KI)]);
    render(panel("x".repeat(TEXT_MAX + 1)));
    expect(await screen.findByText(/höchstens 3'000 Zeichen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mit KI prüfen" })).not.toBeInTheDocument();
    expect(m.count("/api/generate")).toBe(0);
  });
});
