// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadGate } from "@/components/tool/LeadGate";

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

  it("versteckt das Honeypot-Feld vor Hilfstechnologien und Tastatur", () => {
    setup(vi.fn() as unknown as typeof fetch);
    const honeypot = document.getElementById("lead-website") as HTMLInputElement;
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
