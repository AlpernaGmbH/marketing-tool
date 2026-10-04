// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountCache } from "@/lib/use-account";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/clerk-bridge", () => ({ openSignIn: vi.fn(), signOut, whenSessionReady: async () => {} }));

import { KontoKarte } from "./KontoKarte";

const stub = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

beforeEach(() => {
  resetAccountCache();
  signOut.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("KontoKarte", () => {
  it("zeigt nichts, solange die Anmeldung nicht eingerichtet ist", async () => {
    stub({ login: null, account: null });
    const { container } = render(<KontoKarte />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("bietet Besuchern einen Knopf «Anmelden» an und sagt, wo die Daten ohne Konto liegen", async () => {
    stub({ login: "clerk", account: null });
    render(<KontoKarte />);
    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrieren" })).toBeNull();
    expect(screen.getByTestId("konto-karte")).toHaveTextContent("Ohne Konto bleiben die Daten in diesem Browser");
  });

  it("zeigt Angemeldeten Name, E-Mail und «Abmelden»", async () => {
    stub({ login: "clerk", account: { name: "Anna Keller", email: "anna@keller.ch" } });
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as unknown as Location);
    signOut.mockResolvedValue(true);
    render(<KontoKarte />);
    const card = await screen.findByTestId("konto-karte");
    expect(card).toHaveTextContent("Anna Keller");
    expect(card).toHaveTextContent("anna@keller.ch");
    expect(screen.queryByRole("button", { name: "Registrieren" })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Abmelden" }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
