// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadGate } from "@/components/tool/LeadGate";

function setup(fetchImpl: typeof fetch, email: string | null = null) {
  vi.stubGlobal("fetch", fetchImpl);
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(<LeadGate open onOpenChange={onOpenChange} tool="smoke-test" email={email} onSuccess={onSuccess} />);
  return { onOpenChange, onSuccess, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LeadGate (E-Mail vor dem Ergebnis)", () => {
  it("zeigt den festen Text: Ergebnis gegen Adresse, Eingaben und Ergebnis gehen an Alperna", () => {
    setup(vi.fn() as unknown as typeof fetch);
    expect(screen.getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    expect(screen.getByText(/Dein Ergebnis und deine Eingaben gehen mit der Adresse an Alperna/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ergebnis anzeigen" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Firma")).toBeNull();
  });

  it("sendet nichts ohne Adresse und Einwilligung", async () => {
    const f = vi.fn();
    const { user } = setup(f as unknown as typeof fetch);
    await user.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await screen.findByText("Bitte gib eine gültige E-Mail-Adresse an.")).toBeInTheDocument();
    expect(screen.getByText("Bitte stimm der Kontaktaufnahme zu.")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("schickt Adresse, Einwilligung und Werkzeug und ruft danach onSuccess mit der Adresse auf", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const { user, onSuccess, onOpenChange } = setup(f as unknown as typeof fetch);
    await user.type(screen.getByLabelText("E-Mail"), " Anna@Keller.ch ");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("anna@keller.ch"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/lead");
    expect(JSON.parse(init.body)).toEqual({ email: "anna@keller.ch", consent: true, tool: "smoke-test", honeypot: "" });
  });

  it("belegt das Feld mit der bekannten Adresse vor (Adresse ändern)", () => {
    setup(vi.fn() as unknown as typeof fetch, "anna@keller.ch");
    expect(screen.getByLabelText("E-Mail")).toHaveValue("anna@keller.ch");
  });

  it("zeigt bei 429 und bei Netzfehlern eine ruhige Meldung und ruft onSuccess nicht auf", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const { user, onSuccess } = setup(f as unknown as typeof fetch);
    await user.type(screen.getByLabelText("E-Mail"), "anna@keller.ch");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await screen.findByText(/zu viele Versuche/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("«Später» schliesst das Fenster, ohne etwas zu senden", async () => {
    const f = vi.fn();
    const { user, onOpenChange } = setup(f as unknown as typeof fetch);
    await user.click(screen.getByRole("button", { name: "Später" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("hat ein Honeypot-Feld, das Menschen nicht sehen", () => {
    setup(vi.fn() as unknown as typeof fetch);
    const hp = document.getElementById("lead-website") as HTMLInputElement;
    expect(hp).not.toBeNull();
    expect(hp.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
