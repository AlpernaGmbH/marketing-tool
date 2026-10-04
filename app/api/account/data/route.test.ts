import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDataStore, SECRET, method } from "@/tests/helpers";
import { accountHash } from "@/lib/access";

const dataStore = new MemoryDataStore();
const limit = vi.hoisted(() => ({ allow: true }));
const session = vi.hoisted(() => ({ account: null as null | { email: string; name: string } }));
const present = vi.hoisted(() => ({ store: true }));

vi.mock("@/lib/account-data", async (orig) => ({ ...(await orig<typeof import("@/lib/account-data")>()), defaultDataStore: () => (present.store ? dataStore : null) }));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getAccount: async () => session.account }));

import { DELETE, GET, PUT } from "@/app/api/account/data/route";

const IP = "198.51.100.80";
const ANNA = { email: "anna@keller.ch", name: "Anna Keller" };
const BEN = { email: "ben@meier.ch", name: "Ben Meier" };
const hashOf = (a: { email: string }) => accountHash(a.email, SECRET);
const profile = (firma: string, at: number) => ({ "mt:profile": { value: JSON.stringify({ firma }), at } });
const url = "/api/account/data";

let logs: string[];
beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  dataStore.docs.clear();
  dataStore.failing = false;
  limit.allow = true;
  present.store = true;
  session.account = ANNA;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

describe("/api/account/data", () => {
  it("verlangt eine Anmeldung bei allen drei Verben", async () => {
    session.account = null;
    expect((await GET(method("GET", url, undefined, { ip: IP }))).status).toBe(401);
    expect((await PUT(method("PUT", url, { entries: profile("X", 1) }, { ip: IP }))).status).toBe(401);
    expect((await DELETE(method("DELETE", url, undefined, { ip: IP }))).status).toBe(401);
    expect(dataStore.docs.size).toBe(0);
  });

  it("liefert ein leeres Konto leer, speichert Einträge und gibt den Stand zurück", async () => {
    expect(await (await GET(method("GET", url, undefined, { ip: IP }))).json()).toEqual({ ok: true, entries: {} });
    const res = await PUT(method("PUT", url, { entries: profile("Keller", 5) }, { ip: IP }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, entries: profile("Keller", 5) });
    expect(dataStore.docs.get(hashOf(ANNA))).toEqual(profile("Keller", 5));
    expect((await (await GET(method("GET", url, undefined, { ip: IP }))).json()).entries).toEqual(profile("Keller", 5));
  });

  it("führt je Schlüssel zusammen: neuer gewinnt, ältere Änderung eines anderen Geräts überschreibt nichts", async () => {
    await PUT(method("PUT", url, { entries: { ...profile("Neu", 10), "mt:merkliste": { value: "[]", at: 3 } } }, { ip: IP }));
    const res = await PUT(method("PUT", url, { entries: { ...profile("Alt", 9), "mt:icp-builder": { value: '{"x":1}', at: 4 } } }, { ip: IP }));
    const entries = (await res.json()).entries;
    expect(JSON.parse(entries["mt:profile"].value)).toEqual({ firma: "Neu" });
    expect(Object.keys(entries).sort()).toEqual(["mt:icp-builder", "mt:merkliste", "mt:profile"]);
  });

  it("trennt Konten strikt: Ben sieht nie Annas Daten und kann sie nicht überschreiben", async () => {
    await PUT(method("PUT", url, { entries: profile("Keller", 5) }, { ip: IP }));
    session.account = BEN;
    expect((await (await GET(method("GET", url, undefined, { ip: IP }))).json()).entries).toEqual({});
    await PUT(method("PUT", url, { entries: profile("Meier", 6) }, { ip: IP }));
    expect(dataStore.docs.get(hashOf(ANNA))).toEqual(profile("Keller", 5));
    expect(dataStore.docs.get(hashOf(BEN))).toEqual(profile("Meier", 6));
  });

  it("löscht auf Wunsch alles, und nur das eigene Konto", async () => {
    await PUT(method("PUT", url, { entries: profile("Keller", 5) }, { ip: IP }));
    session.account = BEN;
    await PUT(method("PUT", url, { entries: profile("Meier", 6) }, { ip: IP }));
    session.account = ANNA;
    expect(await (await DELETE(method("DELETE", url, undefined, { ip: IP }))).json()).toEqual({ ok: true, entries: {} });
    expect(dataStore.docs.has(hashOf(ANNA))).toBe(false);
    expect(dataStore.docs.has(hashOf(BEN))).toBe(true);
  });

  it("lehnt kaputte Eingaben ab: Schlüssel, Typen, kein JSON, falscher Content-Type", async () => {
    for (const entries of [{ "mt:_konto": { value: "{}", at: 1 } }, { "mt:profile": { value: "kein json", at: 1 } }, { "mt:profile": "x" }, [1, 2]]) {
      expect((await PUT(method("PUT", url, { entries }, { ip: IP }))).status, JSON.stringify(entries)).toBe(400);
    }
    expect((await PUT(method("PUT", url, "kein json", { ip: IP }))).status).toBe(400);
    expect((await PUT(method("PUT", url, {}, { ip: IP }))).status).toBe(400);
    const plain = new Request("http://localhost" + url, { method: "PUT", headers: { "content-type": "text/plain", "x-forwarded-for": IP }, body: JSON.stringify({ entries: profile("X", 1) }) });
    expect((await PUT(plain as never)).status).toBe(400);
    expect(dataStore.docs.size).toBe(0);
  });

  it("antwortet 413, wenn es zu viel wird", async () => {
    const big = JSON.stringify({ x: "a".repeat(200_000) });
    expect((await PUT(method("PUT", url, { entries: { "mt:profile": { value: big, at: 1 } } }, { ip: IP }))).status).toBe(413);
    const filler = JSON.stringify({ x: "a".repeat(140_000) });
    for (let i = 0; i < 4; i++) {
      const res = await PUT(method("PUT", url, { entries: { [`mt:t${i}`]: { value: filler, at: 1 } } }, { ip: IP }));
      expect(res.status, `Schritt ${i}`).toBe(200);
    }
    expect((await PUT(method("PUT", url, { entries: { "mt:t9": { value: filler, at: 1 } } }, { ip: IP }))).status).toBe(413);
    expect(Object.keys(dataStore.docs.get(hashOf(ANNA))!)).toHaveLength(4); // der abgelehnte Eintrag wurde nicht gespeichert
  });

  it("antwortet 503 ohne Speicher oder bei Ausfall, 429 bei zu vielen Anfragen", async () => {
    present.store = false;
    expect((await GET(method("GET", url, undefined, { ip: IP }))).status).toBe(503);
    present.store = true;
    dataStore.failing = true;
    expect((await GET(method("GET", url, undefined, { ip: IP }))).status).toBe(503);
    expect((await PUT(method("PUT", url, { entries: profile("X", 1) }, { ip: IP }))).status).toBe(503);
    expect((await DELETE(method("DELETE", url, undefined, { ip: IP }))).status).toBe(503);
    dataStore.failing = false;
    limit.allow = false;
    expect((await GET(method("GET", url, undefined, { ip: IP }))).status).toBe(429);
  });

  it("loggt nie Inhalte, Namen, E-Mail oder IP", async () => {
    await PUT(method("PUT", url, { entries: profile("Geheime Firma AG", 5) }, { ip: IP }));
    await GET(method("GET", url, undefined, { ip: IP }));
    const all = logs.join("\n");
    expect(all).toContain('"route":"/api/account/data"');
    for (const secret of ["Geheime", "anna@keller.ch", "Anna", IP]) expect(all).not.toContain(secret);
  });
});
