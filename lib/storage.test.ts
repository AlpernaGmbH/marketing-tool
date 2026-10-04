// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAllLocal,
  listLocalKeys,
  readLocal,
  readSyncMeta,
  removeLocal,
  removeLocalFromAccount,
  subscribeLocal,
  writeLocal,
  writeLocalFromAccount,
  writeSyncMeta,
} from "@/lib/storage";

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

  describe("Abgleich mit dem Konto", () => {
    it("merkt sich Änderungen und Löschungen von Schlüsseln, die zum Konto gehören", () => {
      writeLocal("mt:profile", '{"firma":"Keller"}');
      const a = readSyncMeta().keys["mt:profile"];
      expect(a.at).toBeGreaterThan(0);
      expect(a.sat).toBe(-1);
      expect(a.del).toBeUndefined();
      removeLocal("mt:profile");
      expect(readSyncMeta().keys["mt:profile"]).toMatchObject({ del: true, sat: -1 });
    });

    it("führt für Schlüssel ausserhalb des Kontos keine Buchhaltung", () => {
      writeLocal("mt:_sync", "x");
      writeLocal("mt:ai-tried:abc", "1");
      writeLocal("mt:Gross", "1");
      expect(readSyncMeta().keys).toEqual({});
    });

    it("schreibt Werte vom Konto, ohne sie als neue Änderung zu markieren", () => {
      writeLocalFromAccount("mt:profile", "{}");
      expect(readLocal("mt:profile")).toBe("{}");
      expect(readSyncMeta().keys).toEqual({});
      removeLocalFromAccount("mt:profile");
      expect(readLocal("mt:profile")).toBeNull();
      expect(readSyncMeta().keys).toEqual({});
    });

    it("liest eine beschädigte oder fremde Buchhaltung als leer", () => {
      window.localStorage.setItem("mt:_sync", "{kaputt");
      expect(readSyncMeta()).toEqual({ v: 1, keys: {} });
      window.localStorage.setItem("mt:_sync", JSON.stringify({ v: 2, keys: {} }));
      expect(readSyncMeta()).toEqual({ v: 1, keys: {} });
      writeSyncMeta({ v: 1, keys: { "mt:profile": { at: 3, sat: 3 } } });
      expect(readSyncMeta().keys["mt:profile"]).toEqual({ at: 3, sat: 3 });
    });

    it("listet Schlüssel aus dem Browser und aus dem Arbeitsspeicher", () => {
      writeLocal("mt:a", "1");
      vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string) => {
        if (key !== "mt:__probe") throw new DOMException("voll", "QuotaExceededError");
      });
      writeLocal("mt:b", "2");
      const keys = listLocalKeys();
      expect(keys).toContain("mt:a");
      expect(keys).toContain("mt:b");
    });

    it("clearAllLocal entfernt auch die Buchhaltung", () => {
      writeLocal("mt:profile", "{}");
      clearAllLocal();
      expect(readSyncMeta().keys).toEqual({});
      expect(window.localStorage.getItem("mt:_sync")).toBeNull();
    });
  });
});
