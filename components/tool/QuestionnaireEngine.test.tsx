// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionnaireEngine } from "@/components/tool/QuestionnaireEngine";
import { ToolShell } from "@/components/tool/ToolShell";
import type { Answers, Question } from "@/components/tool/questionnaire";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";

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

/** /api/lead antwortet ok; /api/result mit den angegebenen Statuscodes der Reihe nach (der letzte gilt weiter). */
function mockApi(resultStatus: number[] = [200]) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let results = 0;
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, body });
    const json = (data: unknown, status = 200) => ({ ok: status < 300, status, json: async () => data });
    if (path === "/api/lead") return json({ ok: true });
    if (path === "/api/result") {
      const status = resultStatus[Math.min(results++, resultStatus.length - 1)];
      return json(status === 200 ? { ok: true } : { error: status === 403 ? "gate" : "x" }, status);
    }
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, count: (p: string) => calls.filter((c) => c.path === p).length, last: (p: string) => calls.filter((c) => c.path === p).at(-1)?.body };
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
        resultText={(r) => `Branche ${(r as { branche: string }).branche}`}
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

async function giveEmail(u: ReturnType<typeof user>, email = "anna@keller.ch") {
  const dialog = await screen.findByRole("dialog");
  await u.type(within(dialog).getByLabelText("E-Mail"), email);
  await u.click(within(dialog).getByRole("checkbox"));
  await u.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
}

describe("QuestionnaireEngine im ToolShell (Zugang v3)", () => {
  it("läuft bis zur Zusammenfassung ohne Fenster, fragt vor dem Ergebnis nach der Adresse und schickt Eingabe und Ausgabe ins CRM", async () => {
    const m = mockApi();
    const u = user();
    render(<Tool />);

    expect(await screen.findByText("Zwei Fragen zu deinem Betrieb.")).toBeInTheDocument();
    expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnis gegen E-Mail-Adresse");
    await u.click(screen.getByRole("button", { name: "Starten" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Pflichtfrage ohne Antwort
    expect(await screen.findByText(/Frage 1 von 2/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bitte gib eine Antwort ein.");

    await answerAll(u);
    expect(await screen.findByRole("heading", { name: "Zusammenfassung" })).toBeInTheDocument();
    expect(screen.getByText("Malerei")).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);

    await u.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    expect(screen.queryByTestId("result")).not.toBeInTheDocument(); // erst die Adresse, dann das Ergebnis
    await giveEmail(u);

    expect(await screen.findByTestId("result")).toHaveTextContent('"branche":"Malerei"');
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    expect(m.last("/api/result")).toEqual({
      tool: "smoke-test",
      eingabe: "In welcher Branche arbeitest du?: Malerei\nWie gross ist dein Betrieb?: 10 bis 49 Mitarbeitende",
      ausgabe: "Branche Malerei",
    });
    expect(m.last("/api/lead")).toEqual({ email: "anna@keller.ch", consent: true, tool: "smoke-test", honeypot: "" });
    expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnisse gehen an anna@keller.ch");
  });

  it("zeigt mit bekannter Adresse das Ergebnis sofort, ohne Fenster, und nimmt die Firma aus dem Profil mit", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const m = mockApi();
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await screen.findByTestId("result")).toHaveTextContent('"groesse":"mittel"');
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    expect(m.count("/api/lead")).toBe(0);
    expect(m.last("/api/result")).toMatchObject({ firma: "Malerei Keller" });
  });

  it("schickt ein geändertes Ergebnis noch einmal, ohne erneut nach der Adresse zu fragen", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const m = mockApi();
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    await screen.findByTestId("result");
    await waitFor(() => expect(m.count("/api/result")).toBe(1));

    await u.click(screen.getByRole("button", { name: "Antworten ändern" }));
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    await screen.findByTestId("result");
    await waitFor(() => expect(m.count("/api/result")).toBe(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stellt nach einem Neuladen das Ergebnis wieder her, ohne erneut zu senden", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const m = mockApi();
    const u = user();
    const first = render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    await screen.findByTestId("result");
    await waitFor(() => expect(m.count("/api/result")).toBe(1));

    first.unmount();
    render(<Tool />);
    expect(await screen.findByTestId("result")).toHaveTextContent('"groesse":"mittel"');
    expect(m.count("/api/result")).toBe(1);
  });

  it("bleibt bei der Zusammenfassung, wenn der Besucher das Fenster schliesst", async () => {
    const m = mockApi();
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    const dialog = await screen.findByRole("dialog");
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Zusammenfassung" })).toBeInTheDocument();
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
    expect(readLocal(LEAD_KEY)).toBeNull();
  });

  it("kennt der Server die Adresse nicht mehr (403), kommt das Fenster, und das Ergebnis geht danach noch einmal", async () => {
    writeLocal(LEAD_KEY, "alt@keller.ch");
    const m = mockApi([403, 200]);
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await screen.findByTestId("result")).toBeInTheDocument(); // das Ergebnis bleibt sichtbar
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("E-Mail")).toHaveValue(""); // der alte Merker gilt nicht mehr
    await giveEmail(u, "neu@keller.ch");
    await waitFor(() => expect(m.count("/api/result")).toBe(2));
    expect(m.count("/api/lead")).toBe(1);
    expect(readLocal(LEAD_KEY)).toBe("neu@keller.ch");
  });

  it("zeigt das Ergebnis auch, wenn /api/result nicht erreichbar ist (nie wegen Technik blockieren)", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await answerAll(u);
    await u.click(await screen.findByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await screen.findByTestId("result")).toHaveTextContent('"branche":"Malerei"');
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fragt nicht, was im Firmenprofil steht, und zeigt es in der Zusammenfassung", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const m = mockApi();
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
    // Ins CRM gehen nur gestellte Fragen; das Profil fragt niemand erneut ab.
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    expect(m.last("/api/result")).toMatchObject({ eingabe: "Wie gross ist dein Betrieb?: bis 9 Mitarbeitende" });
  });

  it("behält Antworten beim Zurückgehen", async () => {
    mockApi();
    const u = user();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Starten" }));
    await u.type(await screen.findByLabelText(/In welcher Branche/), "Malerei");
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByText(/Frage 2 von 2/);
    await u.click(screen.getByRole("button", { name: "Zurück" }));
    expect(await screen.findByLabelText(/In welcher Branche/)).toHaveValue("Malerei");
  });

  it("meldet einen Rechenfehler ruhig, ohne Fenster und ohne Sendung", async () => {
    const m = mockApi();
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
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
  });
});
