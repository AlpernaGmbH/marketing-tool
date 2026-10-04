// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_MS, clearPending, readPending, returnPath, savePending, startSignIn } from "@/lib/konto-client";

const bridge = vi.hoisted(() => ({ openSignIn: vi.fn() }));
vi.mock("@/lib/clerk-bridge", () => ({ openSignIn: bridge.openSignIn }));

beforeEach(() => {
  localStorage.clear();
  bridge.openSignIn.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("returnPath", () => {
  it("hängt konto an und behält andere Parameter", () => {
    expect(returnPath({ pathname: "/tools/x", search: "" }, "ok")).toBe("/tools/x?konto=ok");
    expect(returnPath({ pathname: "/tools/x", search: "?a=1&konto=fehler" }, "ok")).toBe("/tools/x?a=1&konto=ok");
  });
  it("ergibt nie eine fremde Adresse", () => {
    expect(returnPath({ pathname: "//evil.example", search: "" }, "ok")).not.toMatch(/^https?:/);
  });
});

describe("Merker der begonnenen Anmeldung", () => {
  it("speichert Werkzeug und Firma, liest sie zurück und löscht sie", () => {
    savePending({ tool: "x", firma: "Malerei Keller" }, 1000);
    expect(readPending(2000)).toEqual({ tool: "x", firma: "Malerei Keller", at: 1000 });
    clearPending();
    expect(readPending(2000)).toBeNull();
  });
  it("lässt die Firma weg, wenn sie leer ist", () => {
    savePending({ tool: "x", firma: "" }, 1000);
    expect(readPending(1500)).toEqual({ tool: "x", at: 1000 });
  });
  it("verfällt nach 15 Minuten und verwirft Zukunftswerte und Müll", () => {
    savePending({ tool: "x" }, 1000);
    expect(readPending(1000 + PENDING_MS)).not.toBeNull();
    expect(readPending(1000 + PENDING_MS + 1)).toBeNull();
    localStorage.setItem("mt:_konto", JSON.stringify({ tool: "x", at: Date.now() + 10 * 60_000 }));
    expect(readPending()).toBeNull();
    localStorage.setItem("mt:_konto", "kein json");
    expect(readPending()).toBeNull();
    localStorage.setItem("mt:_konto", JSON.stringify({ tool: 3, at: 1 }));
    expect(readPending(2)).toBeNull();
  });
});

describe("startSignIn", () => {
  it("öffnet das Fenster von Clerk mit Rückkehr auf die aktuelle Seite (Standard: Anmelden, Parameter konto)", async () => {
    bridge.openSignIn.mockResolvedValue(true);
    expect(await startSignIn({ pathname: "/tools/x", search: "" })).toBe(true);
    expect(bridge.openSignIn).toHaveBeenCalledWith("anmelden", "/tools/x?konto=ok");
  });
  it("kann Registrieren und den Parameter der Kopfzeile", async () => {
    bridge.openSignIn.mockResolvedValue(true);
    await startSignIn({ pathname: "/profil", search: "?a=1" }, "anmeldung", "registrieren");
    expect(bridge.openSignIn).toHaveBeenCalledWith("registrieren", "/profil?a=1&anmeldung=ok");
  });
  it("gibt false zurück, wenn Clerk nicht bereit ist", async () => {
    bridge.openSignIn.mockResolvedValue(false);
    expect(await startSignIn({ pathname: "/a", search: "" })).toBe(false);
  });
});
