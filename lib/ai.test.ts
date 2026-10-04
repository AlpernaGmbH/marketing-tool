import { describe, expect, it } from "vitest";
import { DEFAULT_AI_MODELS, modelsFromEnv } from "@/lib/ai";

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
