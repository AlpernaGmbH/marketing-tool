// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BREAK_WORDS, PageH1, breakParts, splitH1 } from "./PageH1";

afterEach(cleanup);

describe("PageH1", () => {
  it("setzt die Markierung hinter «für»", () => {
    expect(splitH1("Marketing-Analyse für Schweizer KMU")).toEqual({ lead: "Marketing-Analyse für ", mark: "Schweizer KMU" });
    expect(splitH1("Nur ein Titel")).toEqual({ lead: "Nur ein Titel", mark: "" });
  });

  it("teilt lange Wörter an ihrer Umbruchstelle und lässt anderes unberührt", () => {
    expect(breakParts("Kommunikationskonzept für Schweizer KMU")).toEqual([["Kommunikations", "konzept"], " für Schweizer KMU"]);
    expect(breakParts("Anspruchsgruppen-Analyse")).toEqual([["Anspruchs", "gruppen"], "-Analyse"]);
    expect(breakParts("Kurzer Titel")).toEqual(["Kurzer Titel"]);
  });

  it("trennt nur ganze Wörter: ein Wort, das ein Listenwort enthält, bleibt heil", () => {
    expect(breakParts("Medienmitteilungsvorlage")).toEqual(["Medienmitteilungsvorlage"]);
    expect(breakParts("Unkanalstrategie")).toEqual(["Unkanalstrategie"]);
  });

  it("ändert den Text der Überschrift nicht (Name für Screenreader, Suche und Tests)", () => {
    const { container } = render(<PageH1 text="Kommunikationskonzept für Schweizer KMU" />);
    expect(screen.getByRole("heading", { level: 1, name: "Kommunikationskonzept für Schweizer KMU" })).toBeInTheDocument();
    expect(container.querySelector("h1")?.textContent).toBe("Kommunikationskonzept für Schweizer KMU");
    expect(container.querySelectorAll("wbr")).toHaveLength(1);
    expect(container.querySelector("mark")?.textContent).toBe("Schweizer KMU");
  });

  it("jeder Eintrag ergibt zusammengesetzt wieder das Wort", () => {
    for (const [word, parts] of Object.entries(BREAK_WORDS)) {
      expect(parts.join(""), word).toBe(word);
      expect(parts.length).toBeGreaterThan(1);
    }
  });
});
