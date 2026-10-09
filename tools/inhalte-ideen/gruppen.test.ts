import { describe, expect, it } from "vitest";
import { FORMATE, GRUPPEN, IDEEN, SAEULEN, ZIELE, formatCounts, groupIdeen, isGruppe, sortByGruppe, type Idea } from "./logic";

const idee = (id: string, patch: Partial<Idea> = {}): Idea => ({
  id,
  branche: "handwerk",
  titel: `Titel ${id}`,
  beschrieb: "Ein Beschrieb, der lang genug ist für die Prüfung.",
  hook: "Ein Satz für den Anfang des Beitrags.",
  format: "bild",
  monate: "alle",
  ziel: "vertrauen",
  aufwand: "S",
  saeule: "arbeit",
  ...patch,
});

describe("inhalte-ideen: Gruppieren und Zählen", () => {
  it("isGruppe kennt genau die vier Gruppen", () => {
    expect(GRUPPEN).toEqual(["keine", "format", "saeule", "ziel"]);
    expect(isGruppe("saeule")).toBe(true);
    expect(isGruppe("branche")).toBe(false);
    expect(isGruppe(undefined)).toBe(false);
  });

  it("sortByGruppe ordnet nach der Reihenfolge der Auswahlliste und bleibt innerhalb einer Gruppe stabil", () => {
    const liste = [idee("a", { format: "story" }), idee("b", { format: "reel" }), idee("c", { format: "story" }), idee("d", { format: "reel" })];
    expect(sortByGruppe(liste, "format").map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
    expect(sortByGruppe(liste, "keine").map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(liste.map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("Ideen ohne Säule stehen am Ende der Säulen-Gruppen", () => {
    const liste = [idee("a", { saeule: undefined }), idee("b", { saeule: "region" }), idee("c", { saeule: "arbeit" })];
    expect(sortByGruppe(liste, "saeule").map((i) => i.id)).toEqual(["c", "b", "a"]);
    const gruppen = groupIdeen(liste, liste, "saeule");
    expect(gruppen.map((g) => g.label)).toEqual(["Arbeit", "Region", "Ohne Säule"]);
  });

  it("groupIdeen lässt leere Gruppen weg und nennt die Summe der ganzen Trefferliste", () => {
    const alle = [idee("a", { ziel: "anfragen" }), idee("b", { ziel: "vertrauen" }), idee("c", { ziel: "anfragen" }), idee("d", { ziel: "bindung" })];
    const gruppen = groupIdeen(sortByGruppe(alle, "ziel").slice(0, 2), alle, "ziel");
    expect(gruppen.map((g) => [g.key, g.total, g.ideen.map((i) => i.id)])).toEqual([
      ["vertrauen", 1, ["b"]],
      ["anfragen", 2, ["a"]],
    ]);
  });

  it("«keine» ergibt eine einzige Gruppe ohne Beschriftung, bei leerer Liste keine", () => {
    const alle = [idee("a"), idee("b")];
    expect(groupIdeen(alle, alle, "keine")).toEqual([{ key: "alle", label: "", total: 2, ideen: alle }]);
    expect(groupIdeen([], [], "keine")).toEqual([]);
    expect(groupIdeen([], [], "format")).toEqual([]);
  });

  it("formatCounts zählt alle Formate, auch mit 0", () => {
    const counts = formatCounts([idee("a", { format: "reel" }), idee("b", { format: "reel" }), idee("c", { format: "story" })]);
    expect(Object.keys(counts)).toEqual([...FORMATE]);
    expect(counts.reel).toBe(2);
    expect(counts.story).toBe(1);
    expect(counts.carousel).toBe(0);
  });

  it("die echte Bibliothek: jede Idee landet in genau einer Gruppe, jedes Format und Ziel kommt vor", () => {
    for (const g of ["format", "saeule", "ziel"] as const) {
      const gruppen = groupIdeen(IDEEN, IDEEN, g);
      expect(gruppen.reduce((n, x) => n + x.ideen.length, 0), g).toBe(IDEEN.length);
      expect(gruppen.every((x) => x.total === x.ideen.length), g).toBe(true);
    }
    expect(groupIdeen(IDEEN, IDEEN, "format").map((g) => g.key)).toEqual([...FORMATE]);
    expect(groupIdeen(IDEEN, IDEEN, "ziel").map((g) => g.key)).toEqual([...ZIELE]);
    expect(groupIdeen(IDEEN, IDEEN, "saeule").map((g) => g.key)).toEqual([...SAEULEN]);
    expect(Object.values(formatCounts(IDEEN)).reduce((a, b) => a + b, 0)).toBe(IDEEN.length);
  });
});
