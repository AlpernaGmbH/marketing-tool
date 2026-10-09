import { describe, expect, it } from "vitest";
import data from "@/data/branchen.json";
import { BRANCHEN_LISTE, brancheHinweis, brancheOf, fold } from "@/lib/branchen";
import { INDUSTRY_KEYS } from "@/lib/check/types";
import { guessIndustry } from "@/lib/check/industries";
import ideenData from "@/data/branchen-ideen.json";
import { BRANCHEN as IDEEN_BRANCHEN, branchenKeyFor } from "@/tools/inhalte-ideen/logic";
import { BRANCHE_KEYS, brancheAusProfil } from "@/tools/feiertagskalender/logic";

describe("Branchenliste", () => {
  it("trägt Quelle und eindeutige Schlüssel", () => {
    expect(data.meta.source).toBeTruthy();
    expect(data.meta.url).toMatch(/^https:/);
    expect(data.meta.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const keys = BRANCHEN_LISTE.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(BRANCHEN_LISTE.length).toBeGreaterThanOrEqual(12);
  });

  it("übersetzt jeden Eintrag in gültige Schlüssel der drei Werkzeug-Vokabulare", () => {
    const ideenKeys = new Set([...ideenData.branchen.map((b) => b.key), "alle"]);
    for (const b of BRANCHEN_LISTE) {
      expect(INDUSTRY_KEYS as readonly string[], `${b.key} check`).toContain(b.check);
      expect(ideenKeys.has(b.ideen), `${b.key} ideen ${b.ideen}`).toBe(true);
      expect(BRANCHE_KEYS as readonly string[], `${b.key} kalender`).toContain(b.kalender);
    }
  });
});

describe("brancheOf", () => {
  it("findet den Eintrag zur Bezeichnung, ohne Umlaute und Gross-/Kleinschreibung", () => {
    expect(brancheOf("Handwerk")?.key).toBe("handwerk");
    expect(brancheOf("Sanitaer")?.key).toBe("handwerk");
    expect(brancheOf("Malerbetrieb Keller")?.key).toBe("handwerk");
    expect(brancheOf("Gartenbau")?.key).toBe("bau-garten");
    expect(brancheOf("Bäckerei und Konditorei mit Café")?.key).toBe("gastronomie");
    expect(brancheOf("Physio und Massage GmbH")?.key).toBe("gesundheit");
    expect(brancheOf("Hofladen")?.key).toBe("produktion");
  });
  it("liefert null ohne Treffer oder ohne Eingabe", () => {
    expect(brancheOf("")).toBeNull();
    expect(brancheOf("   ")).toBeNull();
    expect(brancheOf(undefined)).toBeNull();
    expect(brancheOf("und")).toBeNull();
    expect(brancheOf("Raumfahrt")).toBeNull();
  });
  it("zeigt den erkannten Eintrag nur, wenn es einer mit eigener Branche ist", () => {
    expect(brancheHinweis("Malerei")).toBe("Handwerk");
    expect(brancheHinweis("Raumfahrt")).toBeNull();
    expect(brancheHinweis("Andere Branche")).toBeNull();
  });
  it("fold macht Umlaute und ß vergleichbar", () => {
    expect(fold("Küche")).toBe(fold("Kueche"));
    expect(fold("Straße")).toBe(fold("Strasse"));
  });
});

describe("Die drei Zuordnungen der Werkzeuge stimmen mit der Liste überein", () => {
  // Jede Bezeichnung der Liste (Name und Beispiele) muss in jedem Werkzeug im gleichen Eintrag landen: Wer «Malerei» wählt,
  // bekommt im Check, in den Ideen und im Kalender dieselbe Branche.
  for (const b of BRANCHEN_LISTE.filter((x) => x.key !== "andere")) {
    for (const name of [b.label, ...b.beispiele]) {
      it(`«${name}» gehört überall zu «${b.label}»`, () => {
        expect(brancheOf(name)?.key, "Liste").toBe(b.key);
        expect(guessIndustry(name), "Check").toBe(b.check);
        expect(branchenKeyFor(name, IDEEN_BRANCHEN), "Ideen").toBe(b.ideen);
        expect(brancheAusProfil({ branche: name }), "Kalender").toBe(b.kalender);
      });
    }
  }
});
