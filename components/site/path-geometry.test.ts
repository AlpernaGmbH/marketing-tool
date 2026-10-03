import { describe, expect, it } from "vitest";
import { PATH_VIEW, pathPoints, segmentPath } from "@/components/site/path-geometry";

describe("pathPoints", () => {
  it("liefert für 0 nichts und für 1 genau einen Punkt in der Mitte", () => {
    expect(pathPoints(0)).toEqual([]);
    expect(pathPoints(1)).toEqual([{ x: PATH_VIEW.width / 2, y: PATH_VIEW.height / 2 }]);
  });
  it("verteilt n Punkte von links nach rechts, alle innerhalb der Fläche", () => {
    for (const n of [2, 3, 5, 8, 12]) {
      const pts = pathPoints(n);
      expect(pts).toHaveLength(n);
      expect(pts[0].x).toBe(PATH_VIEW.margin);
      expect(pts[n - 1].x).toBe(PATH_VIEW.width - PATH_VIEW.margin);
      pts.forEach((p, i) => {
        if (i > 0) expect(p.x).toBeGreaterThan(pts[i - 1].x);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(PATH_VIEW.height);
      });
    }
  });
});

describe("segmentPath", () => {
  it("beginnt beim ersten und endet beim zweiten Punkt", () => {
    expect(segmentPath({ x: 0, y: 10 }, { x: 100, y: 50 })).toBe("M0 10C50 10 50 50 100 50");
  });
});
