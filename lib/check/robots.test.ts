import { describe, expect, it } from "vitest";
import { disallowsRoot } from "@/lib/check/robots";

describe("disallowsRoot", () => {
  it("erlaubt ohne Regeln, bei leerem Disallow und bei Teilpfaden", () => {
    expect(disallowsRoot("")).toBe(false);
    expect(disallowsRoot("User-agent: *\nDisallow:")).toBe(false);
    expect(disallowsRoot("User-agent: *\nDisallow: /admin\nDisallow: /intern/")).toBe(false);
    expect(disallowsRoot("kein robots inhalt <html>")).toBe(false);
  });
  it("verbietet bei «Disallow: /» für alle", () => {
    expect(disallowsRoot("User-agent: *\nDisallow: /")).toBe(true);
    expect(disallowsRoot("user-agent: *\r\ndisallow: /*")).toBe(true);
    expect(disallowsRoot("# Kommentar\nUser-agent: Googlebot\nDisallow: /x\n\nUser-agent: *\nDisallow: / # alles")).toBe(true);
  });
  it("nimmt die eigene Gruppe vor «*», auch mit mehreren Agenten in einer Gruppe", () => {
    expect(disallowsRoot("User-agent: AlpernaCheck\nDisallow: /\n\nUser-agent: *\nDisallow:")).toBe(true);
    expect(disallowsRoot("User-agent: *\nDisallow: /\n\nUser-agent: AlpernaCheck\nDisallow:")).toBe(false);
    expect(disallowsRoot("User-agent: Bingbot\nUser-agent: AlpernaCheck\nDisallow: /")).toBe(true);
    expect(disallowsRoot("User-agent: Alperna*\nDisallow: /")).toBe(true);
  });
  it("lässt ein ausdrückliches «Allow: /» gelten", () => {
    expect(disallowsRoot("User-agent: *\nDisallow: /\nAllow: /")).toBe(false);
  });
  it("gilt nur für die Startseite, nicht für andere Verbote, und verträgt riesige Dateien", () => {
    expect(disallowsRoot("User-agent: *\nDisallow: /?s=\nDisallow: /wp-admin/")).toBe(false);
    expect(disallowsRoot(`${"Disallow: /x\n".repeat(50_000)}User-agent: *\nDisallow: /`)).toBe(false); // nach 100'000 Zeichen abgeschnitten
  });
});
