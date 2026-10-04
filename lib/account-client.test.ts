// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAccountInfo, initialOf, signOutAccount } from "@/lib/account-client";

const bridge = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/clerk-bridge", () => ({ signOut: bridge.signOut }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchOf = (res: Response | Error) => (async () => (res instanceof Error ? Promise.reject(res) : res)) as unknown as typeof fetch;

beforeEach(() => {
  bridge.signOut.mockReset(); // in Klammern: ein zurückgegebener Mock würde als Aufräumfunktion aufgerufen
});

describe("fetchAccountInfo", () => {
  it("liest angemeldet und abgemeldet", async () => {
    expect(await fetchAccountInfo(fetchOf(json({ login: "clerk", account: { name: "Anna", email: "a@k.ch" }, storage: true })))).toEqual({
      login: "clerk",
      account: { name: "Anna", email: "a@k.ch" },
      storage: true,
    });
    expect(await fetchAccountInfo(fetchOf(json({ login: "clerk", account: null })))).toEqual({ login: "clerk", account: null, storage: false });
    expect(await fetchAccountInfo(fetchOf(json({ login: null, account: null, storage: "ja" })))).toEqual({ login: null, account: null, storage: false });
  });

  it("wirft nie und gibt bei Fehlern null zurück", async () => {
    expect(await fetchAccountInfo(fetchOf(new Error("offline")))).toBeNull();
    expect(await fetchAccountInfo(fetchOf(json({}, 500)))).toBeNull();
    expect(await fetchAccountInfo(fetchOf(new Response("<html>", { status: 200 })))).toBeNull();
  });

  it("ignoriert unvollständige Kontodaten und fremde Anmeldewege", async () => {
    expect(await fetchAccountInfo(fetchOf(json({ login: "facebook", account: { name: 3 } })))).toEqual({ login: null, account: null, storage: false });
  });
});

describe("signOutAccount", () => {
  it("meldet bei Clerk ab, mit Rückkehr auf die aktuelle Seite, und sagt, ob es geklappt hat", async () => {
    bridge.signOut.mockResolvedValue(true);
    expect(await signOutAccount()).toBe(true);
    expect(bridge.signOut).toHaveBeenCalledWith(`${window.location.pathname}${window.location.search}`);
    bridge.signOut.mockResolvedValue(false);
    expect(await signOutAccount()).toBe(false);
  });
});

describe("initialOf", () => {
  it("nimmt den ersten Buchstaben des Namens, sonst der E-Mail-Adresse, gross", () => {
    expect(initialOf("anna keller", "a@k.ch")).toBe("A");
    expect(initialOf("  ", "zoe@k.ch")).toBe("Z");
    expect(initialOf("", "")).toBe("?");
    expect(initialOf("élodie", "")).toBe("É");
  });
});
