// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAllLocal, readLocal, removeLocal, subscribeLocal, writeLocal } from "@/lib/storage";

afterEach(() => {
  clearAllLocal();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("storage", () => {
  it("schreibt, liest und löscht", () => {
    writeLocal("mt:test", "1");
    expect(readLocal("mt:test")).toBe("1");
    removeLocal("mt:test");
    expect(readLocal("mt:test")).toBeNull();
  });
  it("löscht nur Schlüssel mit mt:-Präfix", () => {
    window.localStorage.setItem("fremd", "bleibt");
    writeLocal("mt:profile", "{}");
    writeLocal("mt:icp-builder", "{}");
    clearAllLocal();
    expect(readLocal("mt:profile")).toBeNull();
    expect(readLocal("mt:icp-builder")).toBeNull();
    expect(window.localStorage.getItem("fremd")).toBe("bleibt");
  });
  it("meldet Änderungen im selben Tab", () => {
    const cb = vi.fn();
    const off = subscribeLocal(cb);
    writeLocal("mt:x", "1");
    removeLocal("mt:x");
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    writeLocal("mt:x", "2");
    expect(cb).toHaveBeenCalledTimes(2);
  });
  it("fällt auf den Arbeitsspeicher zurück, wenn localStorage gesperrt ist", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("gesperrt", "SecurityError");
    });
    writeLocal("mt:gesperrt", "ok");
    expect(readLocal("mt:gesperrt")).toBe("ok");
  });
  it("liest nach einem gescheiterten Schreiben (Speicher voll) den neuen Wert aus dem Arbeitsspeicher, nicht den alten", () => {
    writeLocal("mt:voll", "alt");
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string) => {
      if (key !== "mt:__probe") throw new DOMException("voll", "QuotaExceededError");
    });
    writeLocal("mt:voll", "neu");
    expect(readLocal("mt:voll")).toBe("neu");
    spy.mockRestore();
    writeLocal("mt:voll", "neuer"); // Speicher wieder frei: der Wert landet im Browser und der Rückfall entfällt
    expect(readLocal("mt:voll")).toBe("neuer");
    expect(window.localStorage.getItem("mt:voll")).toBe("neuer");
  });

});
