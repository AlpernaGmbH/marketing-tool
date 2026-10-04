// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllLocal, readLocal, readSyncMeta, removeLocal, writeLocal, writeLocalFromAccount } from "@/lib/storage";
import { deleteAccountData, flushAndClear, hasPending, syncOnce } from "@/lib/sync";
import { mergeEntries, checkEntries } from "@/lib/account-data";

type Entries = Record<string, { value: string | null; at: number }>;

/** Ein Konto-Server im Speicher, der wie /api/account/data zusammenführt. */
function server(initial: Entries = {}, opts: { status?: number } = {}) {
  const state = { entries: initial, calls: [] as Entries[] };
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (opts.status) return new Response("{}", { status: opts.status });
    if (init?.method === "DELETE") {
      state.entries = {};
      return new Response(JSON.stringify({ ok: true, entries: {} }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as { entries: Entries };
    const checked = checkEntries(body.entries);
    if (!checked.ok) return new Response("{}", { status: 400 });
    state.calls.push(checked.entries);
    state.entries = mergeEntries(state.entries, checked.entries);
    return new Response(JSON.stringify({ ok: true, entries: state.entries }), { status: 200 });
  }) as unknown as typeof fetch;
  return { state, fetchImpl };
}

beforeEach(() => {
  clearAllLocal();
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Änderungen werden vermerkt", () => {
  it("merkt sich Änderungen an Profil, Merkliste und Werkzeugen, nicht an technischen Schlüsseln", () => {
    writeLocal("mt:profile", '{"firma":"Keller"}');
    writeLocal("mt:digitaler-auftritt-check", "{}");
    writeLocal("mt:_konto", "{}");
    expect(Object.keys(readSyncMeta().keys).sort()).toEqual(["mt:digitaler-auftritt-check", "mt:profile"]);
    expect(readSyncMeta().keys["mt:profile"]).toEqual({ at: Date.now(), sat: -1 });
  });

  it("merkt sich Löschungen als Löschmarke", () => {
    writeLocal("mt:profile", "{}");
    removeLocal("mt:profile");
    expect(readSyncMeta().keys["mt:profile"]).toMatchObject({ del: true });
    expect(readLocal("mt:profile")).toBeNull();
  });

  it("Werte vom Konto zählen nicht als neue Änderung", () => {
    writeLocalFromAccount("mt:profile", "{}");
    expect(readSyncMeta().keys["mt:profile"]).toBeUndefined();
    expect(readLocal("mt:profile")).toBe("{}");
  });
});

describe("syncOnce", () => {
  it("schickt Neues hinauf und markiert es als abgeglichen", async () => {
    writeLocal("mt:profile", '{"firma":"Keller"}');
    const s = server();
    expect(hasPending()).toBe(true);
    expect(await syncOnce(s.fetchImpl)).toBe("ok");
    expect(s.state.entries["mt:profile"].value).toBe('{"firma":"Keller"}');
    expect(hasPending()).toBe(false);
    expect(readSyncMeta().keys["mt:profile"].sat).toBe(readSyncMeta().keys["mt:profile"].at);
    // Zweiter Abgleich ohne Änderung schickt nichts hinauf.
    await syncOnce(s.fetchImpl);
    expect(s.state.calls.at(-1)).toEqual({});
  });

  it("holt auf einem frischen Gerät, was im Konto liegt", async () => {
    const s = server({ "mt:profile": { value: '{"firma":"Keller"}', at: 1000 } });
    expect(await syncOnce(s.fetchImpl)).toBe("ok");
    expect(readLocal("mt:profile")).toBe('{"firma":"Keller"}');
    expect(hasPending()).toBe(false);
  });

  it("ein bisher nie abgeglichener Wert dieses Geräts verdrängt nichts, was im Konto liegt", async () => {
    window.localStorage.setItem("mt:profile", '{"firma":"Lokal"}'); // ohne Vermerk, wie vor der Einführung
    const s = server({ "mt:profile": { value: '{"firma":"Konto"}', at: 1000 } });
    await syncOnce(s.fetchImpl);
    expect(readLocal("mt:profile")).toBe('{"firma":"Konto"}');
    expect(JSON.parse(s.state.entries["mt:profile"].value!)).toEqual({ firma: "Konto" });
  });

  it("ein bisher nie abgeglichener Wert geht hinauf, wenn das Konto den Schlüssel nicht kennt", async () => {
    window.localStorage.setItem("mt:merkliste", "[1]");
    const s = server();
    await syncOnce(s.fetchImpl);
    expect(s.state.entries["mt:merkliste"].value).toBe("[1]");
  });

  it("die jüngere Änderung gewinnt, in beide Richtungen", async () => {
    const s = server({ "mt:profile": { value: '{"firma":"Konto"}', at: Date.now() - 5000 } });
    writeLocal("mt:profile", '{"firma":"Lokal"}'); // jünger als das Konto
    await syncOnce(s.fetchImpl);
    expect(JSON.parse(s.state.entries["mt:profile"].value!)).toEqual({ firma: "Lokal" });

    // Anderes Gerät ändert danach, dieses Gerät gleicht ab.
    s.state.entries["mt:profile"] = { value: '{"firma":"Handy"}', at: Date.now() + 10_000 };
    await syncOnce(s.fetchImpl);
    expect(readLocal("mt:profile")).toBe('{"firma":"Handy"}');
  });

  it("gibt Löschungen weiter und zieht sie nach", async () => {
    const s = server();
    writeLocal("mt:digitaler-auftritt-check", "{}");
    await syncOnce(s.fetchImpl);
    vi.setSystemTime(Date.now() + 1000);
    removeLocal("mt:digitaler-auftritt-check");
    await syncOnce(s.fetchImpl);
    expect(s.state.entries["mt:digitaler-auftritt-check"].value).toBeNull();

    // Ein zweites Gerät, das den Wert noch hat, übernimmt die Löschung.
    clearAllLocal();
    writeLocalFromAccount("mt:digitaler-auftritt-check", "{}");
    window.localStorage.setItem("mt:_sync", JSON.stringify({ v: 1, keys: { "mt:digitaler-auftritt-check": { at: 1, sat: 1 } } }));
    await syncOnce(s.fetchImpl);
    expect(readLocal("mt:digitaler-auftritt-check")).toBeNull();
  });

  it("lässt Änderungen, die während der Anfrage entstehen, nicht verloren gehen", async () => {
    writeLocal("mt:profile", '{"firma":"Eins"}');
    const base = server();
    const slow = (async (url: string, init?: RequestInit) => {
      const res = await (base.fetchImpl as typeof fetch)(url, init);
      vi.setSystemTime(Date.now() + 500);
      writeLocal("mt:profile", '{"firma":"Zwei"}'); // die Person tippt weiter, während die Antwort unterwegs ist
      return res;
    }) as typeof fetch;
    await syncOnce(slow);
    expect(readLocal("mt:profile")).toBe('{"firma":"Zwei"}');
    expect(hasPending()).toBe(true); // «Zwei» ist noch nicht beim Konto
    await syncOnce(base.fetchImpl);
    expect(JSON.parse(base.state.entries["mt:profile"].value!)).toEqual({ firma: "Zwei" });
    expect(hasPending()).toBe(false);
  });

  it("schickt Werte nicht hinauf, die das Konto nicht aufnehmen kann (kein JSON), und scheitert deshalb nicht", async () => {
    window.localStorage.setItem("mt:profile", "kein json {");
    writeLocal("mt:merkliste", "[]");
    const s = server();
    expect(await syncOnce(s.fetchImpl)).toBe("ok");
    expect(Object.keys(s.state.entries)).toEqual(["mt:merkliste"]);
  });

  it("meldet nicht angemeldet und Speicher fehlt als «unavailable», Fehler als «failed», und wirft nie", async () => {
    writeLocal("mt:profile", "{}");
    expect(await syncOnce(server({}, { status: 401 }).fetchImpl)).toBe("unavailable");
    expect(await syncOnce(server({}, { status: 503 }).fetchImpl)).toBe("unavailable");
    expect(await syncOnce(server({}, { status: 500 }).fetchImpl)).toBe("failed");
    expect(await syncOnce(server({}, { status: 413 }).fetchImpl)).toBe("failed");
    expect(await syncOnce((async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBe("failed");
    expect(await syncOnce((async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch)).toBe("failed");
    expect(hasPending()).toBe(true); // nichts ging verloren
    expect(readLocal("mt:profile")).toBe("{}");
  });

  it("ignoriert fremde Schlüssel in der Antwort des Servers", async () => {
    const s = server({ "mt:_konto": { value: "{}", at: 9 }, "xx:evil": { value: "{}", at: 9 } } as Entries);
    // Der Test-Server prüft nur eingehende Einträge, ausgehende kommen ungeprüft zurück: der Browser filtert selbst.
    await syncOnce(s.fetchImpl);
    expect(readLocal("mt:_konto")).toBeNull();
    expect(readLocal("xx:evil")).toBeNull();
  });
});

describe("deleteAccountData und flushAndClear", () => {
  it("löscht beim Konto und meldet, ob es geklappt hat", async () => {
    const s = server({ "mt:profile": { value: "{}", at: 1 } });
    expect(await deleteAccountData(s.fetchImpl)).toBe(true);
    expect(s.state.entries).toEqual({});
    expect(await deleteAccountData(server({}, { status: 500 }).fetchImpl)).toBe(false);
    expect(await deleteAccountData((async () => Promise.reject(new Error("x"))) as unknown as typeof fetch)).toBe(false);
  });

  it("schickt vor dem Abmelden alles hinauf und räumt danach das Gerät leer", async () => {
    writeLocal("mt:profile", '{"firma":"Keller"}');
    writeLocal("mt:_konto", "{}");
    const s = server();
    expect(await flushAndClear(s.fetchImpl)).toBe(true);
    expect(s.state.entries["mt:profile"].value).toBe('{"firma":"Keller"}');
    expect(readLocal("mt:profile")).toBeNull();
    expect(window.localStorage.getItem("mt:_sync")).toBeNull();
  });

  it("behält die lokale Kopie, wenn das Hinaufschicken nicht klappt", async () => {
    writeLocal("mt:profile", '{"firma":"Keller"}');
    expect(await flushAndClear(server({}, { status: 500 }).fetchImpl)).toBe(false);
    expect(readLocal("mt:profile")).toBe('{"firma":"Keller"}');
  });
});
