// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DocView } from "@/components/tool/DocView";
import type { DocBlock } from "@/lib/export/model";

afterEach(cleanup);

const blocks: DocBlock[] = [
  { type: "heading", level: 1, text: "Idealkunde" },
  { type: "paragraph", text: "Erste Zeile.\nZweite Zeile." },
  { type: "list", items: ["Eins", "Zwei"] },
  { type: "list", ordered: true, items: ["Schritt A", "Schritt B"] },
  { type: "table", header: ["Kanal", "Budget"], rows: [["Google", "CHF 500.-"], ["Instagram"]] },
  { type: "facts", items: [{ label: "Ort", value: "Gossau" }] },
  { type: "heading", level: 3, text: "Tief" },
];

describe("DocView", () => {
  it("zeigt alle Blocktypen mit semantischem HTML", () => {
    render(<DocView blocks={blocks} />);
    expect(screen.getByRole("heading", { level: 4, name: "Idealkunde" })).toBeInTheDocument();
    expect(screen.getByText(/Erste Zeile/)).toHaveClass("whitespace-pre-wrap");
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Schritt A").closest("ol")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Budget" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "CHF 500.-" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell")).toHaveLength(4); // fehlende Zellen werden leer aufgefüllt
    expect(screen.getByRole("term")).toHaveTextContent("Ort");
    expect(screen.getByRole("definition")).toHaveTextContent("Gossau");
    expect(screen.getByRole("heading", { level: 6, name: "Tief" })).toBeInTheDocument();
  });
  it("beginnt auf Wunsch eine Stufe tiefer und bleibt bei h6", () => {
    render(<DocView blocks={[{ type: "heading", level: 1, text: "A" }, { type: "heading", level: 3, text: "C" }]} baseLevel={5} />);
    expect(screen.getByRole("heading", { level: 5, name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 6, name: "C" })).toBeInTheDocument();
  });
});
