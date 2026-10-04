import { describe, expect, it } from "vitest";
import { DEFAULT_AI_MODELS, describeAiError, modelsFromEnv } from "@/lib/ai";

describe("modelsFromEnv", () => {
  it("nimmt ohne Angabe den Standard (nur Mistral)", () => {
    expect(modelsFromEnv(undefined)).toEqual(DEFAULT_AI_MODELS);
    expect(modelsFromEnv("")).toEqual(DEFAULT_AI_MODELS);
    expect(DEFAULT_AI_MODELS.every((m) => m.startsWith("mistral/"))).toBe(true);
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
