// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToolShell } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { LEAD_KEY } from "@/lib/access-client";
import { defineGenerator } from "@/lib/generator";
import { clearAllLocal, writeLocal } from "@/lib/storage";

const def = defineGenerator({
  slug: "probe",
  input: z.object({ betrieb: z.string() }),
  output: z.object({ titel: z.string() }),
  instruction: "x",
  prompt: () => "",
  maxTokens: 100,
});

function Probe() {
  const g = useGenerator(def, { eingabe: (i) => `Betrieb: ${i.betrieb}`, ausgabe: (o) => `# ${o.titel}` });
  return (
    <div>
      <button type="button" onClick={() => void g.generate({ betrieb: "Keller" }).then((o) => o && document.getElementById("out")!.replaceChildren(o.titel))}>
        Entwurf
      </button>
      <p id="out" data-testid="out" />
      {g.busy && <p>läuft</p>}
      {g.error && <p role="alert">{g.error}</p>}
    </div>
  );
}

/** /api/lead ok; /api/generate antwortet der Reihe nach mit `replies`; /api/result ok. */
function mockApi(replies: { status: number; body: unknown }[]) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path === "/api/lead") return json({ ok: true });
      if (path === "/api/result") return json({ ok: true });
      if (path === "/api/generate") {
        const r = replies[Math.min(n++, replies.length - 1)];
        return json(r.body, r.status);
      }
      return json({}, 404);
    }),
  );
  return { calls, count: (p: string) => calls.filter((c) => c.path === p).length };
}

const renderProbe = () =>
  render(
    <ToolShell slug="probe" name="Probe">
      <Probe />
    </ToolShell>,
  );

beforeEach(() => clearAllLocal());
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

describe("useGenerator", () => {
  it("holt mit bekannter Adresse den Entwurf und schickt Eingabe und Ausgabe ins CRM", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const m = mockApi([{ status: 200, body: { ok: true, output: { titel: "Fassaden" } } }]);
    const u = userEvent.setup();
    renderProbe();
    await u.click(await screen.findByRole("button", { name: "Entwurf" }));
    await waitFor(() => expect(screen.getByTestId("out")).toHaveTextContent("Fassaden"));
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    expect(m.calls.find((c) => c.path === "/api/result")?.body).toEqual({ tool: "probe", eingabe: "Betrieb: Keller", ausgabe: "# Fassaden" });
    expect(m.calls.find((c) => c.path === "/api/generate")?.body).toEqual({ tool: "probe", input: { betrieb: "Keller" } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fragt ohne Adresse zuerst nach ihr und ruft die Route erst danach", async () => {
    const m = mockApi([{ status: 200, body: { ok: true, output: { titel: "Fassaden" } } }]);
    const u = userEvent.setup();
    renderProbe();
    await u.click(await screen.findByRole("button", { name: "Entwurf" }));
    const dialog = await screen.findByRole("dialog");
    expect(m.count("/api/generate")).toBe(0);
    await u.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
    await waitFor(() => expect(screen.getByTestId("out")).toHaveTextContent("Fassaden"));
  });

  it("zeigt bei 403 das Fenster erneut und wiederholt die Anfrage einmal", async () => {
    writeLocal(LEAD_KEY, "alt@keller.ch");
    const m = mockApi([
      { status: 403, body: { error: "gate" } },
      { status: 200, body: { ok: true, output: { titel: "Fassaden" } } },
    ]);
    const u = userEvent.setup();
    renderProbe();
    await u.click(await screen.findByRole("button", { name: "Entwurf" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("E-Mail")).toHaveValue("");
    await u.type(within(dialog).getByLabelText("E-Mail"), "neu@keller.ch");
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
    await waitFor(() => expect(screen.getByTestId("out")).toHaveTextContent("Fassaden"));
    expect(m.count("/api/generate")).toBe(2);
  });

  it("zeigt während des Aufrufs die Ladeanzeige statt des Werkzeugs und danach das Werkzeug wieder", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    let release: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/generate") return new Promise<Response>((resolve) => (release = resolve));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const u = userEvent.setup();
    renderProbe();
    await u.click(await screen.findByRole("button", { name: "Entwurf" }));
    expect(await screen.findByTestId("tool-loading")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entwurf" })).not.toBeInTheDocument();
    release(new Response(JSON.stringify({ ok: true, output: { titel: "Fassaden" } }), { status: 200 }));
    await waitFor(() => expect(screen.queryByTestId("tool-loading")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Entwurf" })).toBeInTheDocument();
    expect(screen.getByTestId("out")).toHaveTextContent("Fassaden");
  });

  it("beendet die Ladeanzeige auch bei einem Ausfall und zeigt die Fehlermeldung", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    mockApi([{ status: 502, body: { error: "ai_failed" } }]);
    const u = userEvent.setup();
    renderProbe();
    await u.click(await screen.findByRole("button", { name: "Entwurf" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("tool-loading")).not.toBeInTheDocument();
  });

  it("meldet einen Ausfall ruhig und schickt nichts ins CRM", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const m = mockApi([{ status: 502, body: { error: "ai_failed" } }]);
    const u = userEvent.setup();
    renderProbe();
    await u.click(await screen.findByRole("button", { name: "Entwurf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("keinen brauchbaren Entwurf");
    expect(m.count("/api/result")).toBe(0);
    expect(screen.queryByText("läuft")).not.toBeInTheDocument();
  });
});
