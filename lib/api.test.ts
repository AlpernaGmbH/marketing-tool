import { describe, expect, it } from "vitest";
import { readJson } from "@/lib/api";

const req = (body: string, type?: string) => new Request("http://localhost/x", { method: "POST", headers: type ? { "content-type": type } : {}, body });

describe("readJson", () => {
  it("liest JSON mit application/json, auch mit Zeichensatz und Grossschreibung", async () => {
    expect(await readJson(req('{"a":1}', "application/json"))).toEqual({ a: 1 });
    expect(await readJson(req('{"a":1}', "Application/JSON; charset=utf-8"))).toEqual({ a: 1 });
  });

  it("verweigert Typen, die eine fremde Seite ohne Preflight senden kann", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", undefined]) {
      const r = type ? req('{"a":1}', type) : new Request("http://localhost/x", { method: "POST", body: '{"a":1}', headers: { "content-type": "" } });
      expect(await readJson(r)).toBeNull();
    }
  });

  it("gibt bei kaputtem oder leerem Body null", async () => {
    expect(await readJson(req("kein json", "application/json"))).toBeNull();
    expect(await readJson(req("", "application/json"))).toBeNull();
  });
});
