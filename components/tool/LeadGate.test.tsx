// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadGate } from "@/components/tool/LeadGate";
import { PENDING_MS, readPending } from "@/lib/konto-client";

const startSignIn = vi.hoisted(() => vi.fn());
vi.mock("better-auth/client", () => ({ createAuthClient: () => ({ signIn: { social: startSignIn } }) }));

function setup(fetchImpl: typeof fetch) {
  vi.stubGlobal("fetch", fetchImpl);
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(<LeadGate open onOpenChange={onOpenChange} tool="smoke-test" reason="zweites_tool" onSuccess={onSuccess} />);
  return { onOpenChange, onSuccess, user: userEvent.setup() };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Anna Keller");
  await user.type(screen.getByLabelText("Firma"), "Malerei Keller");
  await user.type(screen.getByLabelText("E-Mail"), "anna@keller.ch");
  await user.click(screen.getByRole("checkbox"));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LeadGate", () => {
  it("zeigt den festen Text aus CLAUDE.md", () => {
    setup(vi.fn() as unknown as typeof fetch);
    expect(screen.getByText("Dein erstes Ergebnis war gratis.")).toBeInTheDocument();
    expect(screen.getByText(/Hinterlass uns Name, Firma und E-Mail/)).toBeInTheDocument();
  });

  it("sendet nichts, solange Pflichtfelder und Einwilligung fehlen", async () => {
    const f = vi.fn();
    const { user } = setup(f as unknown as typeof fetch);
    await user.click(screen.getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText("Bitte gib deinen Namen an.")).toBeInTheDocument();
    expect(screen.getByText("Bitte stimm der Kontaktaufnahme zu.")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("lehnt eine ungültige E-Mail ab", async () => {
    const f = vi.fn();
    const { user } = setup(f as unknown as typeof fetch);
    await fillValid(user);
    await user.clear(screen.getByLabelText("E-Mail"));
    await user.type(screen.getByLabelText("E-Mail"), "keller");
    await user.click(screen.getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText("Bitte gib eine gültige E-Mail-Adresse an.")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("sendet Formular samt Tool-Slug und ruft danach onSuccess auf", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const { user, onSuccess, onOpenChange } = setup(f as unknown as typeof fetch);
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Freischalten" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/lead");
    expect(JSON.parse(init.body)).toMatchObject({
      name: "Anna Keller",
      firma: "Malerei Keller",
      email: "anna@keller.ch",
      consent: true,
      tool: "smoke-test",
      honeypot: "",
    });
  });

  it("zeigt bei 429 eine ruhige Meldung und ruft onSuccess nicht auf", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const { user, onSuccess } = setup(f as unknown as typeof fetch);
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText(/zu viele Versuche/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("zeigt bei Netzwerkfehler eine Meldung und lässt erneut senden", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const { user, onSuccess } = setup(f as unknown as typeof fetch);
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText(/Das Senden hat nicht geklappt/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Freischalten" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("hält Einwilligungstext und Datenschutz-Link in einem Label zusammen", () => {
    setup(vi.fn() as unknown as typeof fetch);
    // Zugänglicher Name des Checkbox kommt aus dem Label, der Link steckt darin.
    expect(screen.getByRole("checkbox", { name: /Alperna darf mich zu meinem Ergebnis kontaktieren/ })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Datenschutzerklärung" });
    expect(link).toHaveAttribute("href", "/datenschutz");
    const label = document.querySelector('label[for="lead-consent"]');
    expect(label).not.toBeNull();
    expect(label!.contains(link)).toBe(true);
    expect(label!.textContent).toContain("Alperna darf mich zu meinem Ergebnis kontaktieren");
  });

  it("versteckt das Honeypot-Feld vor Hilfstechnologien und Tastatur", () => {
    setup(vi.fn() as unknown as typeof fetch);
    const honeypot = document.getElementById("lead-website") as HTMLInputElement;
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.closest("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("LeadGate mit Google", () => {
  function setupGoogle() {
    const onSuccess = vi.fn();
    render(<LeadGate open onOpenChange={vi.fn()} tool="smoke-test" reason="zweites_tool" login="google" onSuccess={onSuccess} />);
    return { user: userEvent.setup(), onSuccess };
  }

  afterEach(() => {
    localStorage.clear();
    startSignIn.mockReset();
  });

  it("bietet Google an und hält das Formular als Ausweg bereit", () => {
    setupGoogle();
    expect(screen.getByText(/Melde dich kurz mit Google an/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mit Google anmelden" })).toBeInTheDocument();
    const details = screen.getByText("Lieber ohne Google-Konto? Formular ausfüllen").closest("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    expect(details!.contains(screen.getByLabelText("E-Mail"))).toBe(true);
  });

  it("verlangt die Einwilligung vor der Weiterleitung", async () => {
    const { user } = setupGoogle();
    await user.click(screen.getByRole("button", { name: "Mit Google anmelden" }));
    expect(await screen.findByText("Bitte stimm der Kontaktaufnahme zu.")).toBeInTheDocument();
    expect(startSignIn).not.toHaveBeenCalled();
    expect(readPending()).toBeNull();
  });

  it("merkt sich Werkzeug und Einwilligung und startet die Anmeldung", async () => {
    startSignIn.mockResolvedValue({ error: null });
    const { user } = setupGoogle();
    await user.click(within(screen.getByTestId("konto-google")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Mit Google anmelden" }));
    await waitFor(() => expect(startSignIn).toHaveBeenCalledTimes(1));
    expect(startSignIn.mock.calls[0][0]).toMatchObject({ provider: "google", callbackURL: expect.stringContaining("konto=ok") });
    expect(readPending(Date.now())).toMatchObject({ tool: "smoke-test" });
    expect(Date.now() - (readPending()?.at ?? 0)).toBeLessThan(PENDING_MS);
  });

  it("räumt auf und zeigt eine Meldung, wenn die Anmeldung nicht startet", async () => {
    startSignIn.mockResolvedValue({ error: { message: "x" } });
    const { user } = setupGoogle();
    await user.click(within(screen.getByTestId("konto-google")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Mit Google anmelden" }));
    expect(await screen.findByText(/konnte nicht gestartet werden/)).toBeInTheDocument();
    expect(readPending()).toBeNull();
    expect(screen.getByRole("button", { name: "Mit Google anmelden" })).toBeEnabled();
  });

  it("vergisst alte Fehlermeldungen, wenn das Fenster geschlossen und wieder geöffnet wird", async () => {
    const user = userEvent.setup();
    const view = render(<LeadGate open onOpenChange={vi.fn()} tool="smoke-test" reason="zweites_tool" login="google" onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Mit Google anmelden" }));
    expect(await screen.findByText("Bitte stimm der Kontaktaufnahme zu.")).toBeInTheDocument();
    await user.keyboard("{Escape}"); // Besucher schliesst das Fenster
    view.rerender(<LeadGate open onOpenChange={vi.fn()} tool="smoke-test" reason="download" login="google" onSuccess={vi.fn()} />);
    expect(screen.queryByText("Bitte stimm der Kontaktaufnahme zu.")).not.toBeInTheDocument();
  });

  it("gibt den Google-Knopf frei, wenn die Seite aus dem Cache des Browsers zurückkommt (Zurück-Taste)", async () => {
    startSignIn.mockReturnValue(new Promise(() => {})); // Weiterleitung läuft, die Seite wird verlassen
    const { user } = setupGoogle();
    await user.click(within(screen.getByTestId("konto-google")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Mit Google anmelden" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Mit Google anmelden|Weiter zu Google/ })).toBeDisabled());
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mit Google anmelden" })).toBeEnabled());
  });
});

describe("LeadGate für bereits angemeldete Personen", () => {
  function setupSignedIn(fetchImpl: typeof fetch) {
    vi.stubGlobal("fetch", fetchImpl);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<LeadGate open onOpenChange={onOpenChange} tool="smoke-test" reason="zweites_tool" login="google" signedIn onSuccess={onSuccess} />);
    return { user: userEvent.setup(), onSuccess, onOpenChange };
  }
  const ok = () => vi.fn(async () => new Response(JSON.stringify({ ok: true, known: false }), { status: 200 })) as unknown as typeof fetch;

  afterEach(() => {
    localStorage.clear();
    startSignIn.mockReset();
  });

  it("verlangt nur das Häkchen und schaltet ohne Umweg über Google frei", async () => {
    const f = ok();
    const { user, onSuccess, onOpenChange } = setupSignedIn(f);
    expect(screen.getByText(/Du bist angemeldet\. Setz das Häkchen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mit Google anmelden" })).toBeNull();

    await user.click(within(screen.getByTestId("konto-google")).getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText("Bitte stimm der Kontaktaufnahme zu.")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();

    await user.click(within(screen.getByTestId("konto-google")).getByRole("checkbox"));
    await user.click(within(screen.getByTestId("konto-google")).getByRole("button", { name: "Freischalten" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(startSignIn).not.toHaveBeenCalled();
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/lead/account");
    expect(JSON.parse(String(init.body))).toMatchObject({ tool: "smoke-test", consent: true });
  });

  it("fällt auf den Weg über Google zurück, wenn der Server die Sitzung nicht mehr kennt", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const { user, onSuccess } = setupSignedIn(f);
    await user.click(within(screen.getByTestId("konto-google")).getByRole("checkbox"));
    await user.click(within(screen.getByTestId("konto-google")).getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText(/Deine Anmeldung ist abgelaufen/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mit Google anmelden" })).toBeInTheDocument();
  });

  it("meldet einen Serverfehler und lässt es noch einmal versuchen", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const { user, onSuccess } = setupSignedIn(f);
    await user.click(within(screen.getByTestId("konto-google")).getByRole("checkbox"));
    await user.click(within(screen.getByTestId("konto-google")).getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText(/Das Freischalten hat nicht geklappt/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("konto-google")).getByRole("button", { name: "Freischalten" })).toBeEnabled();
  });
});

