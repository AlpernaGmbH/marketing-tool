// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FormatCards, PreviewTabs, shapeSize, type PickerFormat } from "./FormatPicker";

afterEach(cleanup);

const FORMATS: PickerFormat[] = [
  { key: "feed", label: "Feed 1:1", width: 1080, height: 1080 },
  { key: "story", label: "Story 9:16", width: 1080, height: 1920, detail: "Instagram-Story" },
];

function Harness({ initial = ["feed"] }: { initial?: string[] }) {
  const [sel, setSel] = useState<string[]>(initial);
  const [preview, setPreview] = useState("feed");
  return (
    <form>
      <fieldset>
        <legend>Formate</legend>
        <FormatCards formats={FORMATS} selected={sel} idPrefix="t-format" invalidKey="feed" onToggle={(k, on) => setSel((s) => (on ? [...s, k] : s.filter((x) => x !== k)))} />
      </fieldset>
      <PreviewTabs label="Vorschau" formats={FORMATS.filter((f) => sel.includes(f.key))} value={preview} onChange={setPreview} />
      <output data-testid="state">{`${sel.join(",")}|${preview}`}</output>
    </form>
  );
}

describe("FormatPicker", () => {
  it("shapeSize passt das Seitenverhältnis in die Box und lässt nichts verschwinden", () => {
    expect(shapeSize(1080, 1080)).toEqual({ width: 44, height: 44 });
    expect(shapeSize(1080, 1920)).toEqual({ width: 25, height: 44 });
    expect(shapeSize(1200, 900)).toEqual({ width: 44, height: 33 });
    expect(shapeSize(1, 1000)).toEqual({ width: 8, height: 44 });
    expect(shapeSize(0, 0)).toEqual({ width: 8, height: 8 });
  });

  it("jede Karte ist eine Checkbox mit dem Namen des Formats und den Pixelmassen als Beschreibung", () => {
    render(<Harness />);
    const feed = screen.getByRole("checkbox", { name: "Feed 1:1" });
    expect(feed).toBeChecked();
    expect(feed).toHaveAccessibleDescription("1'080 × 1'080 Pixel");
    expect(feed).toHaveAttribute("aria-invalid", "true");
    const story = screen.getByRole("checkbox", { name: "Story 9:16" });
    expect(story).not.toBeChecked();
    expect(story).toHaveAccessibleDescription("Instagram-Story");
    expect(story).not.toHaveAttribute("aria-invalid");
    expect(within(screen.getByRole("list", { name: "Formate" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("ein Klick auf die Karte wählt oder entfernt das Format, auch per Tastatur", async () => {
    const u = userEvent.setup();
    render(<Harness />);
    const card = () => within(screen.getByRole("list", { name: "Formate" })).getByText("Story 9:16");
    await u.click(card());
    expect(screen.getByRole("checkbox", { name: "Story 9:16" })).toBeChecked();
    await u.click(card());
    expect(screen.getByRole("checkbox", { name: "Story 9:16" })).not.toBeChecked();
    screen.getByRole("checkbox", { name: "Story 9:16" }).focus();
    await u.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "Story 9:16" })).toBeChecked();
  });

  it("die Vorschau-Knöpfe gibt es erst ab zwei gewählten Formaten und wechseln mit einem Klick", async () => {
    const u = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("group", { name: "Vorschau" })).not.toBeInTheDocument();
    await u.click(screen.getByRole("checkbox", { name: "Story 9:16" }));
    const group = screen.getByRole("group", { name: "Vorschau" });
    expect(within(group).getByRole("button", { name: "Feed 1:1" })).toHaveAttribute("aria-pressed", "true");
    await u.click(within(group).getByRole("button", { name: "Story 9:16" }));
    expect(within(group).getByRole("button", { name: "Story 9:16" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Feed 1:1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("state")).toHaveTextContent("feed,story|story");
  });
});
