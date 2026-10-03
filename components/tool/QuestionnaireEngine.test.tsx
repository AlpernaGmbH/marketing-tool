// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionnaireEngine } from "@/components/tool/QuestionnaireEngine";
import { ToolShell } from "@/components/tool/ToolShell";
import type { Answers, Question } from "@/components/tool/questionnaire";
import { clearAllLocal } from "@/lib/storage";

const questions: Question[] = [
  { id: "branche", type: "text", label: "In welcher Branche arbeitest du?", required: true },
  {
    id: "groesse",
    type: "single",
    label: "Wie gross ist dein Betrieb?",
    required: true,
    options: [
      { value: "klein", label: "bis 9 Mitarbeitende" },
      { value: "mittel", label: "10 bis 49 Mitarbeitende" },
    ],
  },
];

const scoreFn = (a: Answers) => ({ branche: String(a.branche), groesse: String(a.groesse) });

type Api = { access: { allowed: boolean; unlocked: boolean }; completeUnlocked: boolean };

function mockApi(initial: Api) {
  const api = { ...initial };
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, body });
    const json = (data: unknown, status = 200) => ({ ok: status < 300, status, json: async () => data });
    if (path === "/api/access") return json({ ...api.access, reason: "x" });
    if (path === "/api/access/complete") return json({ ok: true, unlocked: api.completeUnlocked });
    if (path === "/api/lead") {
      api.access = { allowed: true, unlocked: true };
      return json({ ok: true });
    }
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { api, calls, count: (p: string) => calls.filter((c) => c.path === p).length };
}

function Tool({ prefill, score = scoreFn }: { prefill?: Answers; score?: (a: Answers) => unknown }) {
  return (
    <ToolShell slug="smoke-test" name="Smoke-Test" usesProfile>
      <QuestionnaireEngine
        slug="smoke-test"
        questions={questions}
        scoreFn={score}
        prefill={prefill}
        intro={<p>Zwei Fragen zu deinem Betrieb.</p>}
        renderResult={(r) => <p data-testid="result">{JSON.stringify(r)}</p>}
      />
    </ToolShell>
  );
}

const user = () => userEvent.setup();

beforeEach(() => clearAllLocal());
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

async function answerAll(u: ReturnType<typeof user>) {
  await u.type(screen.getByLabelText(/In welcher Branche/), "Malerei");
  await u.click(screen.getByRole("button", { name: "Weiter" }));
  await u.click(await screen.findByLabelText("10 bis 49 Mitarbeitende"));
  await u.click(screen.getByRole("button", { name: "Zur Zusammenfassung" }));
}

describe("QuestionnaireEngine im ToolShell", () => {
  it("führt den freien Durchlauf bis zum Ergebnis und zählt ihn genau einmal", async () => {
    const m = mockApi({ access: { allowed: true, unlocked: false }, completeUnlocked: false });
    const u = user();
    render(<Tool />);

    expect(await screen.findByText("Zwei Fragen zu deinem Betrieb.")).toBeInTheDocument();
    expect(screen.getByTestId("access-status")).toHaveTextContent("Freier Durchlauf");
    await u.click(screen.getByRole("button", { name: "Starten" }));

    // Pflichtfrage ohne Antwort
    expect(await screen.findByText(/Frage 1 von 2/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bitte gib eine Antwort ein.");

    await answerAll(u);
    expect(await screen.findByRole("heading", { name: "Zusammenfassung" })).toBeInTheDocument();
    expect(screen.getByText("Malerei")).toBeInTheDocument();
    expect(m.count("/api/access/complete")).toBe(0); // Zählung erst mit dem Ergebnis

    await u.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await screen.findByTestId("result")).toHaveTextContent('"branche":"Malerei"');
    await waitFor(() => expect(m.count("/api/access/complete")).toBe(1));
    expect(m.calls.find((c) => c.path === "/api/access/complete")?.body).toEqual({ tool: "smoke-test" });
  });

  it("zählt nicht erneut, wenn der Besucher Antworten ändert und das Ergebnis nochmals zeigt", async () => {
    const m = mockApi({ access: { allowed: true, unlocked: false }, completeUnlocked: false });
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    await screen.findByTestId("result");
    await waitFor(() => expect(m.count("/api/access/complete")).toBe(1));

    await u.click(screen.getByRole("button", { name: "Antworten ändern" }));
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    await screen.findByTestId("result");
    expect(m.count("/api/access/complete")).toBe(1);
    expect(m.count("/api/access")).toBeGreaterThanOrEqual(1);
  });

  it("stellt nach einem Neuladen das Ergebnis wieder her, ohne erneut zu zählen", async () => {
    const m = mockApi({ access: { allowed: true, unlocked: false }, completeUnlocked: false });
    const u = user();
    const first = render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    await screen.findByTestId("result");
    await waitFor(() => expect(m.count("/api/access/complete")).toBe(1));

    first.unmount();
    render(<Tool />);
    expect(await screen.findByTestId("result")).toHaveTextContent('"groesse":"mittel"');
    expect(m.count("/api/access/complete")).toBe(1);
  });

  it("zeigt beim zweiten Start das LeadGate und startet nach dem Absenden ohne Reload", async () => {
    const m = mockApi({ access: { allowed: false, unlocked: false }, completeUnlocked: false });
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein erstes Ergebnis war gratis.")).toBeInTheDocument();
    expect(screen.queryByText(/Frage 1 von 2/)).not.toBeInTheDocument();

    await u.type(within(dialog).getByLabelText("Name"), "Anna Keller");
    await u.type(within(dialog).getByLabelText("Firma"), "Malerei Keller");
    await u.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(within(dialog).getByRole("button", { name: "Freischalten" }));

    expect(await screen.findByText(/Frage 1 von 2/)).toBeInTheDocument();
    expect(m.count("/api/lead")).toBe(1);
    expect(m.calls.find((c) => c.path === "/api/lead")?.body).toMatchObject({ tool: "smoke-test", consent: true });
    expect(screen.getByTestId("access-status")).toHaveTextContent("Freigeschaltet");
  });

  it("bleibt am Start, wenn der Besucher das Formular schliesst", async () => {
    mockApi({ access: { allowed: false, unlocked: false }, completeUnlocked: false });
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    const dialog = await screen.findByRole("dialog");
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Starten" })).toBeEnabled();
    expect(screen.queryByText(/Frage 1 von 2/)).not.toBeInTheDocument();
  });

  it("startet trotzdem, wenn /api/access nicht erreichbar ist (nie wegen Technik blockieren)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    expect(await screen.findByText(/Frage 1 von 2/)).toBeInTheDocument();
  });

  it("fragt nicht, was im Firmenprofil steht, und zeigt es in der Zusammenfassung", async () => {
    mockApi({ access: { allowed: true, unlocked: false }, completeUnlocked: false });
    const u = user();
    render(<Tool prefill={{ branche: "Malerei" }} />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    expect(await screen.findByText(/Frage 1 von 1/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/In welcher Branche/)).not.toBeInTheDocument();
    await u.click(await screen.findByLabelText("bis 9 Mitarbeitende"));
    await u.click(screen.getByRole("button", { name: "Zur Zusammenfassung" }));
    expect(await screen.findByText(/aus deinem Firmenprofil/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await screen.findByTestId("result")).toHaveTextContent('"branche":"Malerei"');
  });

  it("behält Antworten beim Zurückgehen", async () => {
    mockApi({ access: { allowed: true, unlocked: false }, completeUnlocked: false });
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await u.type(await screen.findByLabelText(/In welcher Branche/), "Malerei");
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByText(/Frage 2 von 2/);
    await u.click(screen.getByRole("button", { name: "Zurück" }));
    expect(await screen.findByLabelText(/In welcher Branche/)).toHaveValue("Malerei");
  });

  it("meldet einen Rechenfehler ruhig und zählt den Durchlauf nicht", async () => {
    const m = mockApi({ access: { allowed: true, unlocked: false }, completeUnlocked: false });
    const u = user();
    render(
      <Tool
        score={() => {
          throw new Error("kaputt");
        }}
      />,
    );
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Das Ergebnis konnte nicht berechnet werden.");
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
    expect(m.count("/api/access/complete")).toBe(0);
  });
});
