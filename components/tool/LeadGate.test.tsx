// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadGate } from "@/components/tool/LeadGate";
import { PENDING_MS, readPending } from "@/lib/konto-client";

const startSignIn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/clerk-bridge", () => ({ openSignIn: startSignIn }));

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

describe("LeadGate mit Konto", () => {
  function setupKonto() {
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<LeadGate open onOpenChange={onOpenChange} tool="smoke-test" reason="zweites_tool" login="clerk" onSuccess={onSuccess} />);
    return { user: userEvent.setup(), onSuccess, onOpenChange };
  }

  afterEach(() => {
    localStorage.clear();
    startSignIn.mockReset();
  });

  it("bietet die Anmeldung an und hält das Formular als Ausweg bereit", () => {
    setupKonto();
    expect(screen.getByText(/Melde dich kurz an/)).toBeInTheDocument();
    expect(screen.queryByText(/Google/)).toBeNull();
    expect(screen.getByRole("button", { name: "Anmelden und freischalten" })).toBeInTheDocument();
    const details = screen.getByText("Lieber ohne Konto? Formular ausfüllen").closest("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    expect(details!.contains(screen.getByLabelText("E-Mail"))).toBe(true);
  });

  it("verlangt die Einwilligung vor der Anmeldung", async () => {
    const { user } = setupKonto();
    await user.click(screen.getByRole("button", { name: "Anmelden und freischalten" }));
    expect(await screen.findByText("Bitte stimm der Kontaktaufnahme zu.")).toBeInTheDocument();
    expect(startSignIn).not.toHaveBeenCalled();
    expect(readPending()).toBeNull();
  });

  it("merkt sich Werkzeug und Einwilligung, öffnet das Fenster von Clerk und schliesst dieses Fenster", async () => {
    startSignIn.mockResolvedValue(true);
    const { user, onOpenChange } = setupKonto();
    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Anmelden und freischalten" }));
    await waitFor(() => expect(startSignIn).toHaveBeenCalledTimes(1));
    expect(startSignIn.mock.calls[0]).toEqual(["anmelden", expect.stringContaining("konto=ok")]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(readPending(Date.now())).toMatchObject({ tool: "smoke-test" });
    expect(Date.now() - (readPending()?.at ?? 0)).toBeLessThan(PENDING_MS);
  });

  it("räumt auf und zeigt eine Meldung, wenn die Anmeldung nicht startet", async () => {
    startSignIn.mockResolvedValue(false);
    const { user } = setupKonto();
    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Anmelden und freischalten" }));
    expect(await screen.findByText(/konnte nicht gestartet werden/)).toBeInTheDocument();
    expect(readPending()).toBeNull();
    expect(screen.getByRole("button", { name: "Anmelden und freischalten" })).toBeEnabled();
  });

  it("vergisst alte Fehlermeldungen, wenn das Fenster geschlossen und wieder geöffnet wird", async () => {
    const user = userEvent.setup();
    const view = render(<LeadGate open onOpenChange={vi.fn()} tool="smoke-test" reason="zweites_tool" login="clerk" onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Anmelden und freischalten" }));
    expect(await screen.findByText("Bitte stimm der Kontaktaufnahme zu.")).toBeInTheDocument();
    await user.keyboard("{Escape}"); // Besucher schliesst das Fenster
    view.rerender(<LeadGate open onOpenChange={vi.fn()} tool="smoke-test" reason="download" login="clerk" onSuccess={vi.fn()} />);
    expect(screen.queryByText("Bitte stimm der Kontaktaufnahme zu.")).not.toBeInTheDocument();
  });

  it("gibt den Anmelde-Knopf frei, wenn die Seite aus dem Cache des Browsers zurückkommt (Zurück-Taste)", async () => {
    startSignIn.mockReturnValue(new Promise(() => {})); // Clerk lädt noch oder leitet weiter, die Seite wird verlassen
    const { user } = setupKonto();
    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Anmelden und freischalten" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Anmelden und freischalten|Anmeldung wird geöffnet/ })).toBeDisabled());
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Anmelden und freischalten" })).toBeEnabled());
  });
});

describe("LeadGate für bereits angemeldete Personen", () => {
  function setupSignedIn(fetchImpl: typeof fetch) {
    vi.stubGlobal("fetch", fetchImpl);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<LeadGate open onOpenChange={onOpenChange} tool="smoke-test" reason="zweites_tool" login="clerk" signedIn onSuccess={onSuccess} />);
    return { user: userEvent.setup(), onSuccess, onOpenChange };
  }
  const ok = () => vi.fn(async () => new Response(JSON.stringify({ ok: true, known: false }), { status: 200 })) as unknown as typeof fetch;

  afterEach(() => {
    localStorage.clear();
    startSignIn.mockReset();
  });

  it("verlangt nur das Häkchen und schaltet ohne erneute Anmeldung frei", async () => {
    const f = ok();
    const { user, onSuccess, onOpenChange } = setupSignedIn(f);
    expect(screen.getByText(/Du bist angemeldet\. Setz das Häkchen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anmelden und freischalten" })).toBeNull();

    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText("Bitte stimm der Kontaktaufnahme zu.")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();

    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("checkbox"));
    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("button", { name: "Freischalten" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(startSignIn).not.toHaveBeenCalled();
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/lead/account");
    expect(JSON.parse(String(init.body))).toMatchObject({ tool: "smoke-test", consent: true });
  });

  it("fällt auf den Weg über die Anmeldung zurück, wenn der Server die Sitzung nicht mehr kennt", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const { user, onSuccess } = setupSignedIn(f);
    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("checkbox"));
    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText(/Deine Anmeldung ist abgelaufen/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Anmelden und freischalten" })).toBeInTheDocument();
  });

  it("meldet einen Serverfehler und lässt es noch einmal versuchen", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const { user, onSuccess } = setupSignedIn(f);
    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("checkbox"));
    await user.click(within(screen.getByTestId("konto-anmeldung")).getByRole("button", { name: "Freischalten" }));
    expect(await screen.findByText(/Das Freischalten hat nicht geklappt/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("konto-anmeldung")).getByRole("button", { name: "Freischalten" })).toBeEnabled();
  });
});

