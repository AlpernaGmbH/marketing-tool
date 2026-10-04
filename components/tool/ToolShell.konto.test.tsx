// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolShell } from "@/components/tool/ToolShell";
import { savePending } from "@/lib/konto-client";

type Call = { url: string; body: unknown };
let calls: Call[];

/** Antworten der Routen: access (frei oder offen), lead/account (ok, 401 oder Fehler). */
function stubFetch(opts: { account?: "ok" | "401" | "500"; unlockedAfter?: boolean } = {}) {
  let unlocked = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url === "/api/lead/account") {
        if (opts.account === "401") return new Response("{}", { status: 401 });
        if (opts.account === "500") return new Response("{}", { status: 500 });
        unlocked = opts.unlockedAfter ?? true;
        return new Response(JSON.stringify({ ok: true, known: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ allowed: true, unlocked, reason: unlocked ? "unlocked" : "free_run", login: "google", signedIn: unlocked }), { status: 200 });
    }),
  );
}

function at(url: string) {
  window.history.replaceState(null, "", url);
}

function mount() {
  render(
    <ToolShell slug="digitaler-auftritt-check" name="Test">
      <p>Inhalt</p>
    </ToolShell>,
  );
}

beforeEach(() => {
  calls = [];
  localStorage.clear();
  at("/tools/digitaler-auftritt-check");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ToolShell: Rückkehr von Google", () => {
  it("schaltet nach ?konto=ok mit dem gemerkten Werkzeug frei und räumt Merker und Adresse auf", async () => {
    stubFetch();
    savePending({ tool: "digitaler-auftritt-check", firma: "Malerei Keller" });
    at("/tools/digitaler-auftritt-check?konto=ok&x=1");
    mount();
    expect(await screen.findByText(/Du bist angemeldet, alle Werkzeuge und Downloads sind offen/)).toBeInTheDocument();
    const account = calls.find((c) => c.url === "/api/lead/account");
    expect(account?.body).toEqual({ tool: "digitaler-auftritt-check", consent: true, firma: "Malerei Keller" });
    await waitFor(() => expect(screen.getByTestId("access-status")).toHaveTextContent("Freigeschaltet"));
    expect(window.location.search).toBe("?x=1");
    expect(localStorage.getItem("mt:_konto")).toBeNull();
  });

  it("schickt ohne gemerkte Einwilligung nichts an die Konto-Route", async () => {
    stubFetch();
    at("/tools/digitaler-auftritt-check?konto=ok");
    mount();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/access")).toBe(true));
    expect(calls.some((c) => c.url === "/api/lead/account")).toBe(false);
    expect(screen.getByTestId("access-status")).toHaveTextContent("Freier Durchlauf");
    expect(window.location.search).toBe("");
  });

  it("ignoriert einen Merker für ein anderes Werkzeug", async () => {
    stubFetch();
    savePending({ tool: "anderes-tool" });
    at("/tools/digitaler-auftritt-check?konto=ok");
    mount();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/access")).toBe(true));
    expect(calls.some((c) => c.url === "/api/lead/account")).toBe(false);
  });

  it("sagt bei ?konto=fehler, dass die Anmeldung nicht geklappt hat, und löscht den Merker", async () => {
    stubFetch();
    savePending({ tool: "digitaler-auftritt-check" });
    at("/tools/digitaler-auftritt-check?konto=fehler");
    mount();
    expect(await screen.findByText(/nicht geklappt oder wurde abgebrochen/)).toBeInTheDocument();
    expect(localStorage.getItem("mt:_konto")).toBeNull();
    expect(calls.some((c) => c.url === "/api/lead/account")).toBe(false);
  });

  it("meldet, wenn die Sitzung nicht ankam (401), und bleibt beim freien Durchlauf", async () => {
    stubFetch({ account: "401" });
    savePending({ tool: "digitaler-auftritt-check" });
    at("/tools/digitaler-auftritt-check?konto=ok");
    mount();
    expect(await screen.findByText(/Die Anmeldung ist nicht angekommen/)).toBeInTheDocument();
    expect(localStorage.getItem("mt:_konto")).toBeNull();
  });

  it("behält den Merker bei einem Serverfehler, damit ein zweiter Versuch möglich bleibt", async () => {
    stubFetch({ account: "500" });
    savePending({ tool: "digitaler-auftritt-check" });
    at("/tools/digitaler-auftritt-check?konto=ok");
    mount();
    expect(await screen.findByText(/Das Freischalten hat nicht geklappt/)).toBeInTheDocument();
    expect(localStorage.getItem("mt:_konto")).not.toBeNull();
  });

  it("zeigt ohne Parameter keine Meldung und fragt nur den Zugang ab", async () => {
    stubFetch();
    mount();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe("/api/access");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
