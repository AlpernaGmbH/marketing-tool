// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { clearAllLocal } from "@/lib/storage";

/** Hält den Kontext seines Renders fest und stellt die Adresse zweimal nacheinander sicher (wie Werkzeug plus useGenerator). */
function Probe({ log }: { log: string[] }) {
  const ctx = useToolContext();
  return (
    <button
      type="button"
      onClick={() =>
        void (async () => {
          log.push(`erstes:${await ctx.ensureEmail()}`);
          log.push(`zweites:${await ctx.ensureEmail()}`);
        })()
      }
    >
      Los
    </button>
  );
}

beforeEach(() => clearAllLocal());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ToolShell: ensureEmail", () => {
  it("fragt die Adresse einmal; ein zweiter Aufruf aus demselben Handler (alte Closure) öffnet kein zweites Fenster", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const log: string[] = [];
    render(
      <ToolShell slug="probe" name="Probe">
        <Probe log={log} />
      </ToolShell>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Los" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
    await waitFor(() => expect(log).toEqual(["erstes:true", "zweites:true"]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnisse gehen an anna@keller.ch");
  });

  it("«Später» lässt beide Aufrufe mit false enden", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const log: string[] = [];
    render(
      <ToolShell slug="probe" name="Probe">
        <Probe log={log} />
      </ToolShell>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Los" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(log[0]).toBe("erstes:false"));
    // Der zweite Aufruf öffnet das Fenster erneut; auch das wird mit «Später» beendet.
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(log).toEqual(["erstes:false", "zweites:false"]));
  });

  it("stellt den Merker der Adresse vom Server wieder her, wenn er lokal fehlt, und zeigt dann kein Fenster", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => new Response(JSON.stringify(path === "/api/gate" ? { email: "anna@keller.ch" } : { ok: true }), { status: 200 })),
    );
    const log: string[] = [];
    render(
      <ToolShell slug="probe" name="Probe">
        <Probe log={log} />
      </ToolShell>,
    );
    await waitFor(() => expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnisse gehen an anna@keller.ch"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Los" }));
    await waitFor(() => expect(log).toEqual(["erstes:true", "zweites:true"]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fragt weiter nach der Adresse, wenn auch der Server keine kennt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ email: null }), { status: 200 })));
    const log: string[] = [];
    render(
      <ToolShell slug="probe" name="Probe">
        <Probe log={log} />
      </ToolShell>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Los" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnis gegen E-Mail-Adresse");
  });
});
