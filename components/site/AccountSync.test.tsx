// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountCache } from "@/lib/use-account";
import { clearAllLocal, writeLocal } from "@/lib/storage";
import { AccountSync } from "@/components/site/AccountSync";

type Call = { url: string; method: string };
let calls: Call[];

function stubFetch(account: unknown, storage = true) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "/api/account") return new Response(JSON.stringify({ login: "google", account, storage }), { status: 200 });
      return new Response(JSON.stringify({ ok: true, entries: {} }), { status: 200 });
    }),
  );
}
const dataCalls = () => calls.filter((c) => c.url === "/api/account/data");
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  resetAccountCache();
  clearAllLocal();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AccountSync", () => {
  it("tut ohne Anmeldung nichts: die Daten bleiben im Browser", async () => {
    stubFetch(null);
    render(<AccountSync />);
    await settle();
    expect(dataCalls()).toHaveLength(0);
  });

  it("tut nichts, wenn der Speicher beim Konto nicht bereitsteht", async () => {
    stubFetch({ name: "Anna", email: "anna@keller.ch" }, false);
    render(<AccountSync />);
    await settle();
    expect(dataCalls()).toHaveLength(0);
  });

  it("gleicht beim Start ab und schickt spätere Änderungen nach kurzer Ruhe", async () => {
    stubFetch({ name: "Anna", email: "anna@keller.ch" });
    render(<AccountSync />);
    await settle();
    expect(dataCalls().map((c) => c.method)).toEqual(["PUT"]);

    act(() => writeLocal("mt:profile", '{"firma":"Keller"}'));
    act(() => writeLocal("mt:profile", '{"firma":"Keller AG"}'));
    expect(dataCalls()).toHaveLength(1); // noch in der Ruhezeit: ein Aufruf für beide Änderungen
    await settle();
    expect(dataCalls()).toHaveLength(2);
  });

  it("schickt nichts, wenn nichts zu schicken ist", async () => {
    stubFetch({ name: "Anna", email: "anna@keller.ch" });
    render(<AccountSync />);
    await settle();
    act(() => writeLocal("mt:ai-tried:abc", "1")); // gehört nicht zum Konto
    await settle();
    expect(dataCalls()).toHaveLength(1);
  });
});
