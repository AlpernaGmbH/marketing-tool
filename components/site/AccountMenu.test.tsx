// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountCache } from "@/lib/use-account";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
const startSignIn = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/clerk-bridge", () => ({ openSignIn: startSignIn, signOut, whenSessionReady: async () => {} }));

import { AccountMenu } from "@/components/site/AccountMenu";

function stubAccount(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

beforeEach(() => {
  resetAccountCache();
  startSignIn.mockReset();
  signOut.mockReset();
  nav.pathname = "/";
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AccountMenu", () => {
  it("zeigt ohne eingerichtete Anmeldung wie bisher «Mein Profil»", async () => {
    stubAccount({ login: null, account: null });
    render(<AccountMenu />);
    expect(await screen.findByRole("link", { name: "Mein Profil" })).toHaveAttribute("href", "/profil");
    expect(screen.queryByRole("button", { name: "Anmelden" })).toBeNull();
  });

  it("zeigt bei nicht erreichbarem Server ebenfalls «Mein Profil» und nie eine kaputte Oberfläche", async () => {
    stubAccount({}, 500);
    render(<AccountMenu />);
    expect(await screen.findByRole("link", { name: "Mein Profil" })).toBeInTheDocument();
  });

  it("zeigt Besuchern «Anmelden» und «Registrieren» und kein «Mein Profil»", async () => {
    stubAccount({ login: "clerk", account: null });
    render(<AccountMenu />);
    expect(await screen.findByRole("button", { name: "Anmelden" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrieren" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mein Profil" })).toBeNull();
  });

  it("öffnet das Fenster mit dem passenden Titel, startet Clerk mit eigenem Rückkehr-Parameter und schliesst das Fenster", async () => {
    stubAccount({ login: "clerk", account: null });
    startSignIn.mockResolvedValue(true);
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/tools/x?a=1");
    render(<AccountMenu />);
    await user.click(await screen.findByRole("button", { name: "Registrieren" }));
    const dialog = await screen.findByTestId("signin-dialog");
    expect(within(dialog).getByRole("heading", { name: "Konto erstellen" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Konto erstellen" }));
    await waitFor(() => expect(startSignIn).toHaveBeenCalledTimes(1));
    expect(startSignIn.mock.calls[0]).toEqual(["registrieren", "/tools/x?a=1&anmeldung=ok"]);
    await waitFor(() => expect(screen.queryByTestId("signin-dialog")).toBeNull());
  });

  it("nennt im Fenster weder Google noch einen Anbieter, den es vielleicht nicht gibt, aber den Dienst Clerk", async () => {
    stubAccount({ login: "clerk", account: null });
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(await screen.findByRole("button", { name: "Anmelden" }));
    const dialog = await screen.findByTestId("signin-dialog");
    expect(dialog).not.toHaveTextContent(/Google|Microsoft|Apple/);
    expect(dialog).toHaveTextContent("Clerk");
  });

  it("nennt «Anmelden» im Fenster, wenn man dort angefangen hat", async () => {
    stubAccount({ login: "clerk", account: null });
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(await screen.findByRole("button", { name: "Anmelden" }));
    expect(within(await screen.findByTestId("signin-dialog")).getByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
  });

  it("meldet, wenn der Start der Anmeldung scheitert, und gibt den Knopf wieder frei", async () => {
    stubAccount({ login: "clerk", account: null });
    startSignIn.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(await screen.findByRole("button", { name: "Anmelden" }));
    await user.click(within(await screen.findByTestId("signin-dialog")).getByRole("button", { name: "Weiter zur Anmeldung" }));
    expect(await screen.findByText(/konnte nicht gestartet werden/)).toBeInTheDocument();
    expect(within(screen.getByTestId("signin-dialog")).getByRole("button", { name: "Weiter zur Anmeldung" })).toBeEnabled();
  });

  it("zeigt Angemeldeten den Anfangsbuchstaben und ein Menü mit «Mein Profil» und «Abmelden»", async () => {
    stubAccount({ login: "clerk", account: { name: "anna keller", email: "anna@keller.ch" } });
    const user = userEvent.setup();
    render(<AccountMenu />);
    const button = await screen.findByTestId("account-button");
    expect(button).toHaveTextContent("A");
    expect(button).toHaveAccessibleName("Konto von anna keller");
    expect(screen.queryByRole("button", { name: "Anmelden" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Mein Profil" })).toBeNull(); // erst im offenen Menü

    await user.click(button);
    const menu = document.getElementById("account-menu")!;
    expect(menu).toHaveTextContent("anna@keller.ch");
    expect(within(menu).getByRole("link", { name: "Mein Profil" })).toHaveAttribute("href", "/profil");
    expect(within(menu).getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
  });

  it("schliesst das Menü mit Escape und mit einem Klick daneben", async () => {
    stubAccount({ login: "clerk", account: { name: "Anna", email: "a@k.ch" } });
    const user = userEvent.setup();
    render(
      <div>
        <AccountMenu />
        <p>daneben</p>
      </div>,
    );
    const button = await screen.findByTestId("account-button");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    await user.click(screen.getByText("daneben"));
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("meldet ab und lädt die Seite neu; bei einem Fehler bleibt das Menü mit einer Meldung offen", async () => {
    stubAccount({ login: "clerk", account: { name: "Anna", email: "a@k.ch" } });
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as unknown as Location);
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(await screen.findByTestId("account-button"));

    signOut.mockResolvedValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(await screen.findByText(/Das Abmelden hat nicht geklappt/)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();

    signOut.mockResolvedValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Abmelden" }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("zeigt nach der Rückkehr von der Anmeldung eine Meldung und räumt die Adresse auf", async () => {
    stubAccount({ login: "clerk", account: { name: "Anna", email: "a@k.ch" } });
    window.history.replaceState(null, "", "/tools/x?anmeldung=ok&a=1");
    render(<AccountMenu />);
    expect(await screen.findByText("Du bist angemeldet.")).toBeInTheDocument();
    expect(window.location.search).toBe("?a=1");
  });

  it("sagt bei einer abgebrochenen Anmeldung, dass man es noch einmal versuchen kann", async () => {
    stubAccount({ login: "clerk", account: null });
    window.history.replaceState(null, "", "/?anmeldung=fehler");
    const user = userEvent.setup();
    render(<AccountMenu />);
    expect(await screen.findByText(/nicht geklappt oder wurde abgebrochen/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Schliessen" }));
    expect(screen.queryByText(/nicht geklappt oder wurde abgebrochen/)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("ignoriert fremde Werte im Rückkehr-Parameter", async () => {
    stubAccount({ login: "clerk", account: null });
    window.history.replaceState(null, "", "/?anmeldung=<script>");
    render(<AccountMenu />);
    await screen.findByRole("button", { name: "Anmelden" });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
