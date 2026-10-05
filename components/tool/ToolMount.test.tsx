// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { ToolMount } from "./ToolMount";

vi.mock("@/tools/components", () => ({ toolComponents: { probe: () => <p>Werkzeug</p> } }));

const typ = () => JSON.parse(readLocal(PROFILE_KEY) ?? "{}").organisationstyp;

beforeEach(() => clearAllLocal());
afterEach(() => {
  cleanup();
  clearAllLocal();
});

describe("ToolMount", () => {
  it("stellt bei einem Vereins-Werkzeug ein leeres Profil auf «Verein»", async () => {
    render(<ToolMount slug="probe" audience="verein" />);
    expect(screen.getByText("Werkzeug")).toBeInTheDocument();
    await waitFor(() => expect(typ()).toBe("verein"));
  });

  it("lässt einen vorhandenen Typ stehen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ organisationstyp: "kmu", firma: "Malerei Keller" }));
    render(<ToolMount slug="probe" audience="verein" />);
    await screen.findByText("Werkzeug");
    expect(typ()).toBe("kmu");
  });

  it("fasst das Profil bei Werkzeugen für KMU oder für beide nicht an", async () => {
    render(<ToolMount slug="probe" audience="kmu" />);
    render(<ToolMount slug="probe" audience="beide" />);
    render(<ToolMount slug="probe" />);
    await screen.findAllByText("Werkzeug");
    expect(readLocal(PROFILE_KEY)).toBeNull();
  });

  it("meldet ein Werkzeug ohne Eintrag", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ToolMount slug="gibt-es-nicht" />)).toThrow(/gibt-es-nicht/);
    err.mockRestore();
  });
});
