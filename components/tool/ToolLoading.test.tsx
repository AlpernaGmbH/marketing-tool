// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOADING_STEPS, ToolLoading, loadingProgress, loadingStep } from "@/components/tool/ToolLoading";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { clearAllLocal } from "@/lib/storage";

describe("loadingProgress und loadingStep", () => {
  it("beginnt bei 0, steigt stetig und erreicht 100 % nie von selbst (Obergrenze 92 %)", () => {
    expect(loadingProgress(0, 16)).toBe(0);
    let last = 0;
    for (const ms of [1000, 4000, 8000, 16000, 40000, 600000]) {
      const p = loadingProgress(ms, 16);
      expect(p).toBeGreaterThan(last);
      expect(p).toBeLessThanOrEqual(92);
      last = p;
    }
    expect(loadingProgress(-5, 16)).toBe(0);
    expect(loadingProgress(8000, 0)).toBeGreaterThan(0); // erwartete Dauer unter einer Sekunde gilt als 1
  });
  it("wählt den Schritt nach Fortschritt und bleibt am Ende beim letzten stehen", () => {
    expect(loadingStep(0, 3)).toBe(0);
    expect(loadingStep(40, 3)).toBe(1);
    expect(loadingStep(91, 3)).toBe(2);
    expect(loadingStep(92, 3)).toBe(2);
    expect(loadingStep(50, 1)).toBe(0);
  });
});

describe("ToolLoading", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("zeigt den ersten Schritt, einen Balken und rückt mit der Zeit vor", () => {
    render(<ToolLoading steps={["Lesen", "Schreiben", "Prüfen"]} expectedSeconds={10} />);
    expect(screen.getByRole("status")).toHaveTextContent("Lesen …");
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("status")).toHaveTextContent("Prüfen …");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThan(80);
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(92);
  });

  it("hat Standardschritte und sagt, dass die Eingaben erhalten bleiben", () => {
    render(<ToolLoading />);
    expect(screen.getByRole("status")).toHaveTextContent(`${DEFAULT_LOADING_STEPS[0]} …`);
    expect(screen.getByText(/Eingaben bleiben erhalten/)).toBeInTheDocument();
  });
});

describe("ToolShell: startLoading", () => {
  afterEach(() => cleanup());
  beforeEach(() => clearAllLocal());

  let stopFirst: () => void = () => {};

  function Probe() {
    const ctx = useToolContext();
    const [text, setText] = useState("");
    return (
      <div>
        <input aria-label="Name" value={text} onChange={(e) => setText(e.target.value)} />
        <button
          type="button"
          onClick={() => {
            stopFirst = ctx.startLoading(["Eins", "Zwei"]);
            ctx.startLoading(["Anderes", "Anderes 2"])(); // zweiter Aufruf, solange eine Anzeige läuft: gilt nicht und beendet nichts
          }}
        >
          Laden
        </button>
      </div>
    );
  }

  it("blendet das Werkzeug beim Laden aus, ohne es zu entfernen, und zeigt es danach mit den Eingaben wieder", async () => {
    render(
      <ToolShell slug="probe" name="Probe">
        <Probe />
      </ToolShell>,
    );
    const u = userEvent.setup();
    await u.type(screen.getByRole("textbox", { name: "Name" }), "Keller");
    await u.click(screen.getByRole("button", { name: "Laden" }));
    expect(screen.getByTestId("tool-loading")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Eins …"); // die erste Anzeige gilt
    expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument(); // ausgeblendet, für Tastatur und Vorlesegerät nicht erreichbar
    act(() => stopFirst());
    expect(screen.queryByTestId("tool-loading")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Keller"); // der Eintrag ist erhalten
  });
});
