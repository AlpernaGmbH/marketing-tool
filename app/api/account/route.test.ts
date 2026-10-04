import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ configured: true, account: null as null | { email: string; name: string }, redis: true }));
vi.mock("@/lib/redis", async (orig) => ({ ...(await orig<typeof import("@/lib/redis")>()), getRedis: () => (auth.redis ? ({} as never) : null) }));
vi.mock("@/lib/auth", () => ({ authConfigured: () => auth.configured, getAccount: async () => auth.account }));

import { GET } from "@/app/api/account/route";

let logs: string[];
beforeEach(() => {
  auth.configured = true;
  auth.account = null;
  auth.redis = true;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

const call = () => GET(new Request("http://localhost/api/account"));

describe("GET /api/account", () => {
  it("meldet ohne Sitzung: Anmeldung möglich, niemand angemeldet", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: "google", account: null, storage: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("meldet Name und E-Mail der angemeldeten Person und sonst nichts", async () => {
    auth.account = { email: "anna@keller.ch", name: "Anna Keller" };
    expect(await (await call()).json()).toEqual({ login: "google", account: { name: "Anna Keller", email: "anna@keller.ch" }, storage: true });
  });

  it("meldet login null, wenn die Anmeldung nicht eingerichtet ist (Kopfzeile zeigt dann «Mein Profil»)", async () => {
    auth.configured = false;
    auth.account = { email: "anna@keller.ch", name: "Anna" }; // wird nicht ausgewertet
    expect(await (await call()).json()).toEqual({ login: null, account: null, storage: true });
  });

  it("sagt, wenn der Speicher beim Konto nicht bereitsteht (kein Redis): dann bleiben Daten im Browser", async () => {
    auth.account = { email: "anna@keller.ch", name: "Anna" };
    auth.redis = false;
    expect((await (await call()).json()).storage).toBe(false);
  });

  it("loggt weder Namen noch E-Mail", async () => {
    auth.account = { email: "anna@keller.ch", name: "Anna Keller" };
    await call();
    const all = logs.join("\n");
    expect(all).toContain('"route":"/api/account"');
    expect(all).not.toContain("anna@keller.ch");
    expect(all).not.toContain("Anna");
  });
});
