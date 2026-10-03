import { describe, expect, it } from "vitest";
import { buildNotice } from "@/lib/category-notice";

describe("buildNotice", () => {
  it("nennt Null, eins und zwei Werkzeuge richtig", () => {
    expect(buildNotice(0)).toBe("Dieser Bereich ist im Aufbau. Hier gibt es noch kein Werkzeug.");
    expect(buildNotice(1)).toBe("Dieser Bereich ist im Aufbau. Aktuell gibt es ein Werkzeug.");
    expect(buildNotice(2)).toBe("Dieser Bereich ist im Aufbau. Aktuell gibt es 2 Werkzeuge.");
  });
  it("entfällt ab drei Werkzeugen", () => {
    expect(buildNotice(3)).toBeNull();
    expect(buildNotice(40)).toBeNull();
  });
  it("behandelt negative Zahlen wie null", () => {
    expect(buildNotice(-1)).toContain("noch kein Werkzeug");
  });
});
