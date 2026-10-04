// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sampleResult } from "@/lib/check/fixtures";
import type { CheckResult } from "@/lib/check/types";

// DocumentExport braucht ToolShell (Zugang, LeadGate). Für die Darstellung genügt ein Platzhalter.
vi.mock("@/components/tool/DocumentExport", () => ({ DocumentExport: () => <button>PDF herunterladen</button> }));

import { CheckResultView } from "./Result";

let result: CheckResult;
beforeAll(async () => {
  result = await sampleResult();
});
afterEach(cleanup);

describe("CheckResultView", () => {
  it("zeigt Punktzahl, Stufe und die Zahl erfüllter Prüfpunkte", () => {
    render(<CheckResultView result={result} onRestart={() => {}} />);
    expect(screen.getByRole("meter", { name: /Gesamtpunktzahl für malerei-keller\.ch/ })).toHaveAttribute("aria-valuenow", String(result.score));
    expect(screen.getByText("Handlungsbedarf", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/Prüfpunkten erfüllt\. Geprüft am 04\.10\.2026/)).toBeInTheDocument();
  });

  it("listet die ersten acht Schritte nummeriert und sagt, wo der Rest steht", () => {
    render(<CheckResultView result={result} onRestart={() => {}} />);
    const list = screen.getByRole("heading", { name: "Das würde ich zuerst tun" }).parentElement!.querySelector("ol")!;
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBe(Math.min(8, result.massnahmen.length));
    expect(items[0]).toHaveTextContent(result.massnahmen[0].titel);
    expect(items[0]).toHaveTextContent(/Wirkung hoch · Aufwand klein/);
  });

  it("zeigt jeden Bereich mit Prüfpunkten, auch Offenes mit Textmarke für Screenreader", () => {
    render(<CheckResultView result={result} onRestart={() => {}} />);
    for (const c of result.categories.filter((x) => x.weight > 0)) {
      expect(screen.getByRole("meter", { name: c.title })).toHaveAttribute("aria-valuenow", String(Math.round(c.score * 100)));
    }
    expect(screen.getAllByText(/Offen:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Erfüllt:/).length).toBeGreaterThan(0);
  });

  it("kennzeichnet Bereiche ohne Gewicht als nicht zählend", () => {
    render(<CheckResultView result={result} onRestart={() => {}} />);
    expect(screen.getByText("zählt für deine Branche nicht")).toBeInTheDocument();
  });

  it("sagt, was gemessen ist und was nicht", () => {
    render(<CheckResultView result={result} onRestart={() => {}} />);
    const box = screen.getByRole("heading", { name: "Was gemessen ist und was nicht" }).parentElement!;
    expect(box).toHaveTextContent("nicht automatisch bestätigt");
    expect(box).toHaveTextContent("Einschätzung von Alperna");
  });

  it("startet mit «Erneut prüfen» einen neuen Durchlauf", async () => {
    const onRestart = vi.fn();
    render(<CheckResultView result={result} onRestart={onRestart} />);
    await userEvent.click(screen.getByRole("button", { name: "Erneut prüfen" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("nennt bei leerer Liste keinen Schritt und enthält nie «undefined»", () => {
    const { container } = render(<CheckResultView result={{ ...result, massnahmen: [] }} onRestart={() => {}} />);
    expect(screen.getByText(/nichts Dringendes/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/undefined|NaN|\[object/);
  });
});
