import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_MODELS, DEFAULT_MISTRAL_MODELS, DEFAULT_OPENROUTER_MODELS, MistralError, aiProvider, describeAiError, mistralChat, mistralKey, mistralModelsFromEnv, openrouterChat, openrouterModelsFromEnv, usesMistral, usesOpenrouter } from "@/lib/ai";
import { freeModelsOf, generateJson, modelsFromEnv, type AiUsage } from "@/lib/ai";

describe("modelsFromEnv", () => {
  it("nimmt ohne Angabe den Standard (nur Mistral)", () => {
    expect(modelsFromEnv(undefined)).toEqual(DEFAULT_AI_MODELS);
    expect(modelsFromEnv("")).toEqual(DEFAULT_AI_MODELS);
    expect(DEFAULT_AI_MODELS).toEqual(["mistral/mistral-large-3", "anthropic/claude-haiku-4.5"]);
  });

  it("liest eine kommagetrennte Liste in der angegebenen Reihenfolge", () => {
    expect(modelsFromEnv(" mistral/mistral-small , alibaba/qwen3.5-flash ")).toEqual(["mistral/mistral-small", "alibaba/qwen3.5-flash"]);
  });

  it("verwirft ungültige Einträge und fällt bei lauter Müll auf den Standard", () => {
    expect(modelsFromEnv("mistral/mistral-small,kein modell,http://x/y,../../etc")).toEqual(["mistral/mistral-small"]);
    expect(modelsFromEnv("nur-ein-wort;drop table")).toEqual(DEFAULT_AI_MODELS);
  });

  it("begrenzt die Liste auf vier Modelle", () => {
    expect(modelsFromEnv("a/1,b/2,c/3,d/4,e/5")).toHaveLength(4);
  });
});

describe("describeAiError", () => {
  class FakeError extends Error {
    statusCode?: number;
    lastError?: unknown;
    cause?: unknown;
    finishReason?: string;
    constructor(name: string, extra: Partial<FakeError> = {}) {
      super("Meldung mit Betriebsname Malerei Keller und Adresse");
      this.name = name;
      Object.assign(this, extra);
    }
  }

  it("nennt Fehlerart und Statuscode, nie die Meldung", () => {
    const out = describeAiError(new FakeError("GatewayRateLimitError", { statusCode: 429 }));
    expect(out).toBe("GatewayRateLimitError:429");
    expect(out).not.toContain("Malerei");
  });

  it("folgt dem letzten Fehler eines Wiederholungsversuchs", () => {
    const inner = new FakeError("GatewayInternalServerError", { statusCode: 500 });
    expect(describeAiError(new FakeError("RetryError", { lastError: inner }))).toBe("RetryError>GatewayInternalServerError:500");
  });

  it("nennt den Abschlussgrund, wenn die KI keine brauchbare Ausgabe lieferte", () => {
    expect(describeAiError(new FakeError("NoObjectGeneratedError", { finishReason: "length" }))).toBe("NoObjectGeneratedError:length");
  });

  it("hält die Tiefe klein und verträgt Müll", () => {
    const a = new FakeError("A");
    a.cause = a; // Zirkel
    expect(describeAiError(a).split(">").length).toBeLessThanOrEqual(3);
    for (const junk of [null, undefined, 5, "text", {}]) expect(typeof describeAiError(junk)).toBe("string");
  });
});

describe("Mistral direkt", () => {
  const ARGS = { system: "Regeln", prompt: "Ausgangstext", maxTokens: 300, temperature: 0.4, timeoutMs: 5_000 };
  const ENV = { AI_PROVIDER: "mistral", MISTRAL_API_KEY: "test-key" };
  const ok = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
  const fail = (status: number) => new Response("{}", { status });
  const asFetch = (fn: ReturnType<typeof vi.fn>) => fn as unknown as typeof fetch;

  it("der Weg richtet sich nach dem Schlüssel", () => {
    expect(usesMistral({})).toBe(false);
    expect(usesMistral({ AI_PROVIDER: "mistral", MISTRAL_API_KEY: "" })).toBe(false);
    expect(usesMistral(ENV)).toBe(true);
    // Ein Schlüssel allein ändert den Weg nicht: Standard ist das Gateway.
    expect(usesMistral({ MISTRAL_API_KEY: "test-key" })).toBe(false);
    expect(usesMistral({ AI_PROVIDER: "gateway", MISTRAL_API_KEY: "test-key" })).toBe(false);
  });

  it("liest den Schlüssel auch klein geschrieben (mistral_api_key) und bevorzugt die grosse Schreibweise", async () => {
    expect(usesMistral({ AI_PROVIDER: " Mistral ", mistral_api_key: "klein" })).toBe(true);
    expect(mistralKey({ mistral_api_key: "klein" })).toBe("klein");
    expect(mistralKey({ MISTRAL_API_KEY: "gross", mistral_api_key: "klein" })).toBe("gross");
    expect(mistralKey({ MISTRAL_API_KEY: "", mistral_api_key: "" })).toBeUndefined();
    const fetchFn = vi.fn(async () => ok("Antwort"));
    await mistralChat({ system: "s", prompt: "p", maxTokens: 10, temperature: 0, timeoutMs: 1000 }, asFetch(fetchFn), { mistral_api_key: "klein" });
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ authorization: "Bearer klein" });
  });

  it("liest die Modellliste aus MISTRAL_MODELS und fällt bei Müll auf den Standard", () => {
    expect(mistralModelsFromEnv(undefined)).toEqual(DEFAULT_MISTRAL_MODELS);
    expect(mistralModelsFromEnv(" mistral-large-latest , open-mistral-nemo ")).toEqual(["mistral-large-latest", "open-mistral-nemo"]);
    expect(mistralModelsFromEnv("../x,;drop,http://a")).toEqual(DEFAULT_MISTRAL_MODELS);
    expect(mistralModelsFromEnv("a,b,c,d,e")).toHaveLength(3);
  });

  it("schickt Schlüssel, Nachrichten und Grenzen an Mistral und gibt den Text zurück", async () => {
    const fetchImpl = vi.fn(async () => ok("Fertige Fassung."));
    const out = await mistralChat({ ...ARGS, json: true }, asFetch(fetchImpl), ENV);
    expect(out).toBe("Fertige Fassung.");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "mistral-small-latest", temperature: 0.4, max_tokens: 300, response_format: { type: "json_object" } });
    expect(body.messages).toEqual([
      { role: "system", content: "Regeln" },
      { role: "user", content: "Ausgangstext" },
    ]);
  });

  it("verlangt response_format nur für JSON-Antworten", async () => {
    const fetchImpl = vi.fn(async () => ok("Text"));
    await mistralChat(ARGS, asFetch(fetchImpl), ENV);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.response_format).toBeUndefined();
  });

  it("liest auch eine Antwort, die als Liste von Teilen kommt", async () => {
    const fetchImpl = vi.fn(async () => ok([{ type: "text", text: "Teil eins. " }, { type: "text", text: "Teil zwei." }]));
    expect(await mistralChat(ARGS, asFetch(fetchImpl), ENV)).toBe("Teil eins. Teil zwei.");
  });

  it("versucht bei Überlastung oder Serverfehler das nächste Modell", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok("Zweites Modell."));
    expect(await mistralChat(ARGS, asFetch(fetchImpl), ENV)).toBe("Zweites Modell.");
    expect(JSON.parse((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).model).toBe("open-mistral-nemo");

    const server = vi.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok("Ersatz."));
    expect(await mistralChat(ARGS, asFetch(server), ENV)).toBe("Ersatz.");
  });

  it("versucht bei falschem Schlüssel oder falscher Anfrage nichts weiter", async () => {
    const fetchImpl = vi.fn(async () => fail(401));
    await expect(mistralChat(ARGS, asFetch(fetchImpl), ENV)).rejects.toMatchObject({ name: "MistralHttpError", statusCode: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("wirft ohne Schlüssel, bei leerer Antwort und bei Netzfehlern mit lesbarer Fehlerart", async () => {
    await expect(mistralChat(ARGS, asFetch(vi.fn()), {})).rejects.toMatchObject({ name: "MistralNoKey" });
    const empty = vi.fn(async () => ok("   "));
    await expect(mistralChat(ARGS, asFetch(empty), ENV)).rejects.toMatchObject({ name: "MistralEmptyError" });
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(mistralChat(ARGS, asFetch(offline), ENV)).rejects.toMatchObject({ name: "MistralNetworkError" });
  });

  it("Fehler tragen nie Text des Anbieters: die Fehlerart im Protokoll bleibt kurz", () => {
    const e = new MistralError("MistralHttpError", 429);
    expect(describeAiError(e)).toBe("MistralHttpError:429");
  });
});

describe("OpenRouter", () => {
  const ARGS = { system: "Regeln", prompt: "Ausgangstext", maxTokens: 300, temperature: 0.4, timeoutMs: 5_000 };
  const ENV = { OPENROUTER_API_KEY: "or-key" };
  const ok = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
  const fail = (status: number) => new Response("{}", { status });
  const asFetch = (fn: ReturnType<typeof vi.fn>) => fn as unknown as typeof fetch;
  const bodyOf = (fn: ReturnType<typeof vi.fn>, n = 0) => JSON.parse((fn.mock.calls[n] as unknown as [string, RequestInit])[1].body as string);

  it("wählt den Weg: OpenRouter mit Schlüssel, sonst das Gateway, Mistral nur auf ausdrücklichen Wunsch", () => {
    expect(aiProvider({})).toBe("gateway");
    expect(aiProvider(ENV)).toBe("openrouter");
    expect(aiProvider({ openrouter_api_key: "klein" })).toBe("openrouter");
    expect(aiProvider({ ...ENV, AI_PROVIDER: "openrouter" })).toBe("openrouter");
    expect(aiProvider({ ...ENV, AI_PROVIDER: "gateway" })).toBe("gateway");
    expect(aiProvider({ AI_PROVIDER: "openrouter" })).toBe("gateway"); // ohne Schlüssel
    expect(aiProvider({ MISTRAL_API_KEY: "m" })).toBe("gateway"); // ein Mistral-Schlüssel allein ändert nichts
    expect(aiProvider({ ...ENV, MISTRAL_API_KEY: "m", AI_PROVIDER: "mistral" })).toBe("mistral");
    expect(aiProvider({ ...ENV, AI_PROVIDER: "mistral" })).toBe("gateway"); // Mistral gewünscht, aber kein Schlüssel
    expect(usesOpenrouter(ENV)).toBe(true);
    expect(usesMistral(ENV)).toBe(false);
  });

  it("liest die Modellliste aus OPENROUTER_MODELS (auch mit «:free») und fällt bei Müll auf den Standard", () => {
    expect(openrouterModelsFromEnv(undefined)).toEqual(DEFAULT_OPENROUTER_MODELS);
    expect(DEFAULT_OPENROUTER_MODELS.every((m) => m.endsWith(":free"))).toBe(true);
    expect(openrouterModelsFromEnv(" google/gemma-4-31b-it:free , qwen/qwen3.8-27b:free ")).toEqual(["google/gemma-4-31b-it:free", "qwen/qwen3.8-27b:free"]);
    expect(openrouterModelsFromEnv("../x,;drop,http://a,ohne-anbieter")).toEqual(DEFAULT_OPENROUTER_MODELS);
    expect(openrouterModelsFromEnv("a/a,b/b,c/c,d/d,e/e,f/f")).toHaveLength(5);
  });

  it("schickt Schlüssel und Nachrichten an OpenRouter, ohne response_format, und gibt den Text zurück", async () => {
    const fetchImpl = vi.fn(async () => ok('{"a": 1}'));
    const out = await openrouterChat({ ...ARGS, json: true }, asFetch(fetchImpl), ENV);
    expect(out).toBe('{"a": 1}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer or-key");
    const body = bodyOf(fetchImpl);
    expect(body).toMatchObject({ model: DEFAULT_OPENROUTER_MODELS[0], temperature: 0.4, max_tokens: 300 });
    expect(body.response_format).toBeUndefined();
    expect(body.reasoning).toEqual({ enabled: false });
    expect(body.messages).toEqual([
      { role: "system", content: "Regeln" },
      { role: "user", content: "Ausgangstext" },
    ]);
  });

  it("versucht bei Überlastung, Serverfehler oder leerer Antwort das nächste Modell", async () => {
    const limit = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok("Zweites Modell."));
    expect(await openrouterChat(ARGS, asFetch(limit), ENV)).toBe("Zweites Modell.");
    expect(bodyOf(limit, 1).model).toBe(DEFAULT_OPENROUTER_MODELS[1]);

    const empty = vi.fn().mockResolvedValueOnce(ok("  ")).mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok("Drittes Modell."));
    expect(await openrouterChat(ARGS, asFetch(empty), ENV)).toBe("Drittes Modell.");
    expect(bodyOf(empty, 2).model).toBe(DEFAULT_OPENROUTER_MODELS[2]);
  });

  it("versucht bei einem ungültigen Schlüssel (401) nichts weiter, bei allen anderen Fehlern das nächste Modell", async () => {
    const key = vi.fn(async () => fail(401));
    await expect(openrouterChat(ARGS, asFetch(key), ENV)).rejects.toMatchObject({ name: "OpenRouterHttpError", statusCode: 401 });
    expect(key).toHaveBeenCalledTimes(1);
    for (const status of [400, 402, 404]) {
      const fetchImpl = vi.fn().mockResolvedValueOnce(fail(status)).mockResolvedValueOnce(ok("Nächstes Modell."));
      expect(await openrouterChat(ARGS, asFetch(fetchImpl), ENV)).toBe("Nächstes Modell.");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
    const all = vi.fn(async () => fail(404));
    await expect(openrouterChat(ARGS, asFetch(all), ENV)).rejects.toMatchObject({ name: "OpenRouterHttpError", statusCode: 404 });
    expect(all).toHaveBeenCalledTimes(DEFAULT_OPENROUTER_MODELS.length);
    expect(describeAiError(new MistralError("OpenRouterHttpError", 429))).toBe("OpenRouterHttpError:429");
  });

  it("versucht das nächste Modell, wenn die Antwort nicht angenommen wird (kein lesbares JSON)", async () => {
    const accept = (t: string) => (t.startsWith("{") ? (true as const) : "Nur JSON bitte.");
    // Erst bekommt dasselbe Modell die Rückmeldung (zweiter Versuch mit abgelehnter Antwort und Hinweis), dann das nächste.
    const same = vi.fn().mockResolvedValueOnce(ok("Hier dein Text ohne JSON.")).mockResolvedValueOnce(ok('{"a": 1}'));
    expect(await openrouterChat({ ...ARGS, accept }, asFetch(same), ENV)).toBe('{"a": 1}');
    expect(same).toHaveBeenCalledTimes(2);
    expect(bodyOf(same, 1).model).toBe(DEFAULT_OPENROUTER_MODELS[0]);
    expect(bodyOf(same, 1).messages.slice(2)).toEqual([
      { role: "assistant", content: "Hier dein Text ohne JSON." },
      { role: "user", content: "Nur JSON bitte." },
    ]);
    expect(bodyOf(same, 0).messages).toHaveLength(2);
    // Zwei abgelehnte Antworten beim ersten Modell: das zweite Modell beginnt wieder ohne Rückmeldung.
    const next = vi.fn().mockResolvedValueOnce(ok("kein json")).mockResolvedValueOnce(ok("wieder nicht")).mockResolvedValueOnce(ok('{"b": 2}'));
    expect(await openrouterChat({ ...ARGS, accept }, asFetch(next), ENV)).toBe('{"b": 2}');
    expect(bodyOf(next, 2).model).toBe(DEFAULT_OPENROUTER_MODELS[1]);
    expect(bodyOf(next, 2).messages).toHaveLength(2);
    // Nie annehmbar: zwei Versuche je Modell, dann der Fehler.
    const none = vi.fn(async () => ok("immer Text"));
    await expect(openrouterChat({ ...ARGS, accept }, asFetch(none), ENV)).rejects.toMatchObject({ name: "AiBadJson" });
    expect(none).toHaveBeenCalledTimes(DEFAULT_OPENROUTER_MODELS.length * 2);
    // Ein Fehler des Anbieters gibt dem Modell keinen zweiten Versuch.
    const down = vi.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok('{"c": 3}'));
    expect(await openrouterChat({ ...ARGS, accept }, asFetch(down), ENV)).toBe('{"c": 3}');
    expect(bodyOf(down, 1).model).toBe(DEFAULT_OPENROUTER_MODELS[1]);
  });

  it("hält die Gesamtzeit ein: bleibt weniger als 5 Sekunden, beginnt kein Versuch mehr", async () => {
    const accept = () => "abgelehnt";
    const fetchImpl = vi.fn(async () => ok("Text"));
    await expect(openrouterChat({ ...ARGS, accept, budgetMs: 4_000 }, asFetch(fetchImpl), ENV)).rejects.toMatchObject({ name: "OpenRouterTimeout" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("wirft ohne Schlüssel und bei Netzfehlern mit lesbarer Fehlerart", async () => {
    await expect(openrouterChat(ARGS, asFetch(vi.fn()), {})).rejects.toMatchObject({ name: "OpenRouterNoKey" });
    const net = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(openrouterChat(ARGS, asFetch(net), ENV)).rejects.toMatchObject({ name: "OpenRouterNetworkError" });
  });
});

describe("generateJson über OpenRouter", () => {
  const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("liest JSON mit rohen Zeilenumbrüchen, und bei einem abgelehnten Entwurf antwortet das nächste Modell", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("OPENROUTER_MODELS", "a/erstes,b/zweites");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok('```json\n{"titel": "Zu kurz", "text": "Absatz eins.\n\nAbsatz zwei."}\n```'))
      .mockResolvedValueOnce(ok('{"titel": "Auch kurz", "text": "x"}'))
      .mockResolvedValueOnce(ok('{"titel": "Lang genug für die Prüfung", "text": "Zwei\nZeilen"}'));
    vi.stubGlobal("fetch", fetchImpl);
    const accept = (v: unknown) => (String((v as { titel?: string }).titel).length > 10 ? (true as const) : "Der Titel ist zu kurz.");
    const out = await generateJson({ system: "s", prompt: "p", maxOutputTokens: 100, accept });
    expect(out).toEqual({ titel: "Lang genug für die Prüfung", text: "Zwei\nZeilen" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const body = (n: number) => JSON.parse((fetchImpl.mock.calls[n] as unknown as [string, RequestInit])[1].body as string);
    expect(body(1).model).toBe("a/erstes"); // zweiter Versuch beim selben Modell, mit Rückmeldung
    expect(body(1).messages[3]).toEqual({ role: "user", content: "Der Titel ist zu kurz." });
    expect(body(2).model).toBe("b/zweites");
  });

  it("wirft AiBadJson, wenn kein Modell eine annehmbare Antwort liefert", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("OPENROUTER_MODELS", "a/erstes,b/zweites");
    vi.stubGlobal("fetch", vi.fn(async () => ok("Nur Text, kein Objekt.")));
    await expect(generateJson({ system: "s", prompt: "p", maxOutputTokens: 100 })).rejects.toMatchObject({ name: "AiBadJson" });
  });
});

describe("Kosten, Abschnitt der Antwort und Gratisweg bei OpenRouter", () => {
  const ARGS = { system: "Regeln", prompt: "Ausgangstext", maxTokens: 300, temperature: 0.4, timeoutMs: 5_000 };
  const ENV = { OPENROUTER_API_KEY: "or-key", OPENROUTER_MODELS: "anthropic/claude-haiku-5.5,a/zweites,b/frei:free" };
  const reply = (content: string, extra: Record<string, unknown> = {}, finish: string | undefined = "stop") =>
    new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], ...extra }), { status: 200, headers: { "content-type": "application/json" } });
  const asFetch = (fn: ReturnType<typeof vi.fn>) => fn as unknown as typeof fetch;
  const bodyOf = (fn: ReturnType<typeof vi.fn>, n = 0) => JSON.parse((fn.mock.calls[n] as unknown as [string, RequestInit])[1].body as string);

  it("meldet die Kosten jeder Antwort, auch einer später abgelehnten, und fragt sie mit usage.include an", async () => {
    const usages: AiUsage[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply("kein json", { usage: { cost: 0.0061 } }))
      .mockResolvedValueOnce(reply('{"a": 1}', { usage: { cost: 0.0058 } }));
    const accept = (t: string) => (t.startsWith("{") ? (true as const) : "Nur JSON.");
    await openrouterChat({ ...ARGS, accept, onUsage: (u) => usages.push(u) }, asFetch(fetchImpl), ENV);
    expect(usages).toEqual([
      { model: "anthropic/claude-haiku-5.5", costUsd: 0.0061, free: false },
      { model: "anthropic/claude-haiku-5.5", costUsd: 0.0058, free: false },
    ]);
    expect(bodyOf(fetchImpl).usage).toEqual({ include: true });
  });

  it("meldet 0 Dollar bei Gratismodellen und bei Antworten ohne Kostenangabe", async () => {
    const usages: AiUsage[] = [];
    const fetchImpl = vi.fn(async () => reply("Text"));
    await openrouterChat({ ...ARGS, freeOnly: true, onUsage: (u) => usages.push(u) }, asFetch(fetchImpl), ENV);
    expect(usages).toEqual([{ model: "b/frei:free", costUsd: 0, free: true }]);
  });

  it("nimmt mit freeOnly nur kostenlose Modelle der Liste, ohne solche die Standardliste der Gratismodelle", async () => {
    const fetchImpl = vi.fn(async () => reply("Text"));
    await openrouterChat({ ...ARGS, freeOnly: true }, asFetch(fetchImpl), ENV);
    expect(bodyOf(fetchImpl).model).toBe("b/frei:free");
    expect(freeModelsOf(["anthropic/claude-haiku-5.5", "a/zweites"])).toEqual(DEFAULT_OPENROUTER_MODELS);
    expect(freeModelsOf(["x/y", "z/w:free"])).toEqual(["z/w:free"]);
    const noFree = vi.fn(async () => reply("Text"));
    await openrouterChat({ ...ARGS, freeOnly: true }, asFetch(noFree), { OPENROUTER_API_KEY: "k", OPENROUTER_MODELS: "x/y" });
    expect(bodyOf(noFree).model).toBe(DEFAULT_OPENROUTER_MODELS[0]);
  });

  it("zeigt eine an der Ausgabegrenze abgeschnittene Antwort nie, sondern verlangt eine kürzere", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply("Der Text bricht mitten im Sa", {}, "length")).mockResolvedValueOnce(reply("Der vollständige Text."));
    expect(await openrouterChat(ARGS, asFetch(fetchImpl), ENV)).toBe("Der vollständige Text.");
    expect(bodyOf(fetchImpl, 1).model).toBe("anthropic/claude-haiku-5.5"); // zweiter Versuch beim selben Modell
    expect(bodyOf(fetchImpl, 1).messages[3].content).toContain("abgeschnitten");
  });

  it("wirft, wenn jedes Modell die Antwort abschneidet", async () => {
    const fetchImpl = vi.fn(async () => reply("Abgeschnitten", {}, "length"));
    await expect(openrouterChat(ARGS, asFetch(fetchImpl), ENV)).rejects.toMatchObject({ name: "AiBadJson" });
    expect(fetchImpl).toHaveBeenCalledTimes(6); // 3 Modelle zu je 2 Versuchen
  });
});
