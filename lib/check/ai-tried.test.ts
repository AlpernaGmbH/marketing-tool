// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiTried, markAiTried } from "@/lib/check/ai-client";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("Merker für versuchte Einordnungen", () => {
  it("merkt sich pro Ergebnis, dass es versucht wurde", () => {
    expect(aiTried("abc".repeat(15))).toBe(false);
    markAiTried("abc".repeat(15));
    expect(aiTried("abc".repeat(15))).toBe(true);
    expect(aiTried("xyz".repeat(15))).toBe(false);
  });

  it("wirft nie, auch wenn der Speicher des Tabs gesperrt ist", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("gesperrt", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("gesperrt", "SecurityError");
    });
    expect(() => markAiTried("s".repeat(43))).not.toThrow();
    expect(aiTried("s".repeat(43))).toBe(false);
  });
});
