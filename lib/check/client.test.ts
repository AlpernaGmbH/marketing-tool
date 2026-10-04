import { describe, expect, it, vi } from "vitest";
import { runCheck } from "@/lib/check/client";
import type { CheckEvent, CheckInput, CheckResult } from "@/lib/check/types";

const input: CheckInput = { company: "Malerei Keller", website: "keller.ch" };
const result = { v: 1, score: 61 } as unknown as CheckResult;

/** Antwort mit Stream, dessen Stücke an beliebigen Stellen enden. */
function streamOf(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status });
}

const lines = (events: CheckEvent[]) => events.map((e) => `${JSON.stringify(e)}\n`).join("");

describe("runCheck", () => {
  it("meldet Schritte und liefert das Ergebnis, auch wenn Zeilen zerschnitten ankommen", async () => {
    const text = lines([
      { type: "step", id: "fetch", state: "start" },
      { type: "step", id: "fetch", state: "done" },
      { type: "result", result },
    ]);
    const cut = [text.slice(0, 20), text.slice(20, 75), text.slice(75)];
    const seen: string[] = [];
    const out = await runCheck(input, (id, s) => seen.push(`${id}:${s}`), (async () => streamOf(cut)) as typeof fetch);
    expect(out).toEqual({ ok: true, result });
    expect(seen).toEqual(["fetch:start", "fetch:done"]);
  });

  it("liest auch eine letzte Zeile ohne Zeilenumbruch", async () => {
    const out = await runCheck(input, () => {}, (async () => streamOf([JSON.stringify({ type: "result", result })])) as typeof fetch);
    expect(out.ok).toBe(true);
  });

  it("gibt Fehler-Ereignisse des Servers weiter", async () => {
    const text = lines([{ type: "error", code: "unreachable", message: "Die Website konnte nicht geladen werden." }]);
    const out = await runCheck(input, () => {}, (async () => streamOf([text])) as typeof fetch);
    expect(out).toEqual({ ok: false, code: "unreachable", message: "Die Website konnte nicht geladen werden." });
  });

  it.each([
    [400, "invalid"],
    [403, "gate"],
    [429, "rate_limited"],
    [500, "failed"],
  ] as const)("übersetzt HTTP %i in den Code %s", async (status, code) => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "x", message: "Meldung des Servers" }), { status })) as typeof fetch;
    expect(await runCheck(input, () => {}, fetchImpl)).toEqual({ ok: false, code, message: "Meldung des Servers" });
  });

  it("fängt Netzfehler und kaputte Antworten ab", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await runCheck(input, () => {}, offline)).toMatchObject({ ok: false, code: "failed", message: expect.stringContaining("Verbindung") });

    const noBody = (async () => new Response(null, { status: 200 })) as typeof fetch;
    expect(await runCheck(input, () => {}, noBody)).toMatchObject({ ok: false, code: "failed" });

    const garbage = (async () => streamOf(["kein json\n", "{\"foo\":1}\n"])) as typeof fetch;
    expect(await runCheck(input, () => {}, garbage)).toMatchObject({ ok: false, code: "failed" });

    const html500 = (async () => new Response("<html>Fehler</html>", { status: 500 })) as typeof fetch;
    expect(await runCheck(input, () => {}, html500)).toMatchObject({ ok: false, code: "failed" });
  });

  it("meldet einen abgebrochenen Stream, wenn kein Ergebnis kam", async () => {
    const broken = (async () => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.error(new Error("reset"));
        },
      });
      return new Response(body, { status: 200 });
    }) as typeof fetch;
    const out = await runCheck(input, () => {}, broken);
    expect(out).toMatchObject({ ok: false, code: "failed", message: expect.stringContaining("unterbrochen") });
  });

  it("sendet die Eingaben als JSON an /api/check", async () => {
    const spy = vi.fn(async () => streamOf([lines([{ type: "result", result }])]));
    await runCheck(input, () => {}, spy as unknown as typeof fetch);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/check");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
  });
});
