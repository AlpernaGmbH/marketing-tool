import { describe, expect, it } from "vitest";
import { doneSlugs, isToolDone, summarizePath, toolStateKey } from "@/lib/progress";

const state = (phase: string) => JSON.stringify({ v: 1, phase, step: 0, answers: {}, counted: true });

describe("isToolDone", () => {
  it("ist nur in der Phase «result» wahr", () => {
    expect(isToolDone(state("result"))).toBe(true);
    for (const p of ["intro", "questions", "summary"]) expect(isToolDone(state(p))).toBe(false);
  });
  it("behandelt leer, kaputt und unbekannt als nicht erledigt", () => {
    expect(isToolDone(null)).toBe(false);
    expect(isToolDone(undefined)).toBe(false);
    expect(isToolDone("")).toBe(false);
    expect(isToolDone("{kaputt")).toBe(false);
    expect(isToolDone('"result"')).toBe(false);
    expect(isToolDone(state("fertig"))).toBe(false);
  });
});

describe("doneSlugs", () => {
  it("liest mt:<slug> und behält die Reihenfolge der Eingabe", () => {
    const store: Record<string, string> = { [toolStateKey("b")]: state("result"), [toolStateKey("a")]: state("questions"), [toolStateKey("c")]: state("result") };
    expect(doneSlugs(["c", "a", "b"], (k) => store[k] ?? null)).toEqual(["c", "b"]);
  });
});

describe("summarizePath", () => {
  it("zählt erledigte Schritte und nennt den nächsten", () => {
    expect(summarizePath(["a", "b", "c"], new Set(["a", "c"]))).toEqual({ total: 3, done: 2, next: "b", complete: false });
  });
  it("meldet einen vollständigen Pfad", () => {
    expect(summarizePath(["a", "b"], new Set(["a", "b"]))).toEqual({ total: 2, done: 2, next: null, complete: true });
  });
  it("leerer Pfad ist nie vollständig", () => {
    expect(summarizePath([], new Set())).toEqual({ total: 0, done: 0, next: null, complete: false });
  });
  it("ignoriert erledigte Slugs, die nicht im Pfad liegen", () => {
    expect(summarizePath(["a"], new Set(["x"]))).toMatchObject({ done: 0, next: "a" });
  });
});
