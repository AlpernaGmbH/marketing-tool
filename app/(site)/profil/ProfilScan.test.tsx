// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolShell } from "@/components/tool/ToolShell";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { ProfilEditor } from "./ProfilEditor";

const PAGE = {
  url: "https://malerei-keller.ch/",
  host: "malerei-keller.ch",
  title: "Malerei Keller",
  description: "Wir streichen.",
  headings: ["Willkommen"],
  text: "Malerei Keller in Gossau streicht Fassaden und Wohnungen. ".repeat(5),
  truncated: false,
};
const OUTPUT = { firma: "Malerei Keller", ort: "Gossau", kanton: "SG", branche: "Malerei", beschreibung: "Malerei Keller streicht Fassaden und Wohnungen in Gossau." };

let calls: { path: string; body: Record<string, unknown> }[];

function mockApi(over: { read?: { status: number; body: unknown }; generate?: { status: number; body: unknown } } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path === "/api/gate") return json({ email: null });
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (path === "/api/read") return over.read ? json(over.read.body, over.read.status) : json({ ok: true, page: PAGE });
      if (path === "/api/generate") return over.generate ? json(over.generate.body, over.generate.status) : json({ ok: true, output: OUTPUT });
      return json({ ok: true });
    }),
  );
}

const stored = () => JSON.parse(readLocal(PROFILE_KEY) ?? "{}");
const renderPage = () =>
  render(
    <ToolShell slug="profil" name="Mein Firmenprofil" bare>
      <ProfilEditor />
    </ToolShell>,
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

describe("Aus Website ausfüllen", () => {
  it("verlangt zuerst eine Website und ruft nichts auf", async () => {
    mockApi();
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Aus Website ausfüllen" }));
    expect(await screen.findByText("Trag zuerst deine Website ein.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("liest die Website, zeigt die Vorschläge zur Bestätigung und trägt nur Angehaktes ins Profil ein", async () => {
    mockApi();
    writeLocal(PROFILE_KEY, JSON.stringify({ website: "malerei-keller.ch", firma: "Keller Malerei GmbH" }));
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Aus Website ausfüllen" }));
    const dialog = await screen.findByRole("dialog");
    expect(calls.map((c) => c.path)).toEqual(["/api/read", "/api/generate"]);
    expect(calls[0].body).toEqual({ website: "malerei-keller.ch" });
    expect(calls[1].body).toMatchObject({ tool: "profil-scan", input: { website: "malerei-keller.ch" } });

    // Die Firma ist schon im Profil: nicht vorgewählt und mit dem bisherigen Wert; leere Felder sind vorgewählt.
    const box = (label: string) => within(dialog).getByText(label).closest("label")!.querySelector("input") as HTMLInputElement;
    expect(box("Firma").checked).toBe(false);
    expect(within(dialog).getByText("Bisher im Profil: Keller Malerei GmbH")).toBeInTheDocument();
    expect(box("Branche").checked).toBe(true);
    expect(box("Ort").checked).toBe(true);
    expect(stored().ort).toBeUndefined(); // vor der Bestätigung steht nichts im Profil

    await u.click(box("Ort")); // abwählen
    await u.click(within(dialog).getByRole("button", { name: "Übernehmen" }));
    await waitFor(() => expect(stored().branche).toBe("Malerei"));
    expect(stored()).toMatchObject({ firma: "Keller Malerei GmbH", branche: "Malerei", kanton: "SG", beschreibung: OUTPUT.beschreibung });
    expect(stored().ort).toBeUndefined();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("zeigt bei einer Seite ohne lesbaren Text die Meldung des Servers und ändert nichts", async () => {
    mockApi({ read: { status: 422, body: { error: "thin", message: "Auf der Startseite steht kaum lesbarer Text." } } });
    writeLocal(PROFILE_KEY, JSON.stringify({ website: "leer.ch" }));
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Aus Website ausfüllen" }));
    expect(await screen.findByText("Auf der Startseite steht kaum lesbarer Text.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tool-loading")).not.toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual(["/api/read"]);
  });

  it("meldet einen Ausfall der KI ruhig", async () => {
    mockApi({ generate: { status: 502, body: { error: "ai_failed" } } });
    writeLocal(PROFILE_KEY, JSON.stringify({ website: "malerei-keller.ch" }));
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Aus Website ausfüllen" }));
    expect(await screen.findByText(/keinen brauchbaren Entwurf/)).toBeInTheDocument();
    expect(stored()).toEqual({ website: "malerei-keller.ch" });
  });

  it("sagt, wenn nichts Neues zu finden ist", async () => {
    mockApi();
    writeLocal(PROFILE_KEY, JSON.stringify({ website: "malerei-keller.ch", ...OUTPUT }));
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Aus Website ausfüllen" }));
    expect(await screen.findByText(/nichts gefunden, was dein Profil ergänzt/)).toBeInTheDocument();
  });

  it("fragt vor dem Lesen nach der E-Mail-Adresse, wenn der Browser keine kennt", async () => {
    clearAllLocal();
    mockApi();
    writeLocal(PROFILE_KEY, JSON.stringify({ website: "malerei-keller.ch" }));
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Aus Website ausfüllen" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
