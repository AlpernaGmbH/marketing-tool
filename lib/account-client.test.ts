import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAccountInfo, initialOf, signOutAccount } from "@/lib/account-client";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("better-auth/client", () => ({ createAuthClient: () => ({ signOut }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchOf = (res: Response | Error) => (async () => (res instanceof Error ? Promise.reject(res) : res)) as unknown as typeof fetch;

beforeEach(() => {
  signOut.mockReset(); // in Klammern: ein zurückgegebener Mock würde als Aufräumfunktion aufgerufen
});

describe("fetchAccountInfo", () => {
  it("liest angemeldet und abgemeldet", async () => {
    expect(await fetchAccountInfo(fetchOf(json({ login: "google", account: { name: "Anna", email: "a@k.ch" }, storage: true })))).toEqual({
      login: "google",
      account: { name: "Anna", email: "a@k.ch" },
      storage: true,
    });
    expect(await fetchAccountInfo(fetchOf(json({ login: "google", account: null })))).toEqual({ login: "google", account: null, storage: false });
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
  it("meldet ab und sagt, ob es geklappt hat", async () => {
    signOut.mockResolvedValue({ error: null });
    expect(await signOutAccount()).toBe(true);
    signOut.mockResolvedValue({ error: { message: "x" } });
    expect(await signOutAccount()).toBe(false);
  });

  it("wirft nie, auch wenn die Bibliothek abstürzt", async () => {
    signOut.mockImplementation(async () => {
      throw new Error("offline");
    });
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
