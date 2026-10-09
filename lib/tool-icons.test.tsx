// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TOOL_ICONS, ToolIcon } from "@/lib/tool-icons";
import { getTools } from "@/lib/registry";

afterEach(cleanup);

describe("Werkzeug-Piktogramme", () => {
  it("jedes Werkzeug hat ein eigenes Piktogramm, und es gibt keine Einträge ohne Werkzeug", () => {
    const slugs = getTools().map((t) => t.slug);
    expect(slugs.filter((s) => !TOOL_ICONS[s])).toEqual([]);
    expect(Object.keys(TOOL_ICONS).filter((s) => !slugs.includes(s))).toEqual([]);
    // so unterscheidbar wie möglich: höchstens zwei Werkzeuge teilen sich ein Piktogramm
    const counts = new Map<unknown, number>();
    for (const s of slugs) counts.set(TOOL_ICONS[s], (counts.get(TOOL_ICONS[s]) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
  it("versteckt das Piktogramm für Vorlesegeräte und kennt einen Ersatz für unbekannte Slugs", () => {
    const { container } = render(
      <>
        <ToolIcon slug="swot" />
        <ToolIcon slug="gibt-es-nicht" className="size-4" />
      </>,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    svgs.forEach((svg) => expect(svg).toHaveAttribute("aria-hidden", "true"));
    expect(svgs[1]).toHaveClass("size-4");
  });
});
