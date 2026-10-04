// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_MS, clearPending, readPending, returnPath, savePending, startGoogleSignIn } from "@/lib/konto-client";

const signIn = vi.hoisted(() => ({ social: vi.fn() }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => ({ signIn }) }));

beforeEach(() => {
  localStorage.clear();
  signIn.social.mockReset();
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

describe("startGoogleSignIn", () => {
  it("startet die Anmeldung mit Rückkehr auf die aktuelle Seite", async () => {
    signIn.social.mockResolvedValue({ error: null });
    expect(await startGoogleSignIn({ pathname: "/tools/x", search: "" })).toBe(true);
    expect(signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/tools/x?konto=ok",
      errorCallbackURL: "/tools/x?konto=fehler",
    });
  });
  it("meldet Fehler der Bibliothek und Ausnahmen als false", async () => {
    signIn.social.mockResolvedValue({ error: { message: "x" } });
    expect(await startGoogleSignIn({ pathname: "/a", search: "" })).toBe(false);
    signIn.social.mockRejectedValue(new Error("offline"));
    expect(await startGoogleSignIn({ pathname: "/a", search: "" })).toBe(false);
  });
});
