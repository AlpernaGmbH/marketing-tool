import { describe, expect, it } from "vitest";
import {
  HOOK_ANFANG_MAX,
  SCHWEIZ_ZIEL,
  audit,
  hookAnfang,
  jaccard,
  klone,
  schweizAnteil,
  schweizBezug,
  stamm,
  wiederholteHookAnfaenge,
} from "./audit";
import { IDEEN, foldText, type Idea } from "./logic";

const idee = (patch: Partial<Idea>): Idea => ({
  id: "x-01",
  branche: "handwerk",
  titel: "Titel der Idee",
  beschrieb: "Ein Beschrieb ohne besonderen Bezug zu irgendeinem Ort.",
  hook: "Ein Satz für den Anfang des Beitrags.",
  format: "bild",
  monate: "alle",
  ziel: "vertrauen",
  aufwand: "S",
  saeule: "arbeit",
  ...patch,
});

describe("inhalte-ideen: Redaktions-Audit der Bibliothek", () => {
  it("mindestens die Hälfte der Ideen nennt etwas, das es nur in der Schweiz gibt", () => {
    const anteil = schweizAnteil(IDEEN);
    expect(anteil, `Schweiz-Bezug ${Math.round(anteil * 1000) / 10} %, Ziel ${SCHWEIZ_ZIEL * 100} %`).toBeGreaterThanOrEqual(SCHWEIZ_ZIEL);
  });

  it("jede Branche hat mindestens ein Drittel Ideen mit Schweiz-Bezug", () => {
    const bericht = audit(IDEEN);
    for (const [branche, v] of Object.entries(bericht.jeBranche)) {
      expect(v.schweiz / v.anzahl, `${branche}: ${v.schweiz} von ${v.anzahl}`).toBeGreaterThanOrEqual(1 / 3);
    }
  });

  it("keine zwei Ideen derselben Branche (oder mit den Ideen für alle) sind Klone", () => {
    const k = klone(IDEEN);
    expect(k, k.map((x) => `${x.a} / ${x.b} (${x.art} ${x.wert})`).join("; ")).toEqual([]);
  });

  it("kein Hook-Anfang (die ersten drei Wörter) kommt öfter als dreimal vor", () => {
    const w = wiederholteHookAnfaenge(IDEEN);
    expect(w, w.map((x) => `«${x.anfang}» ${x.anzahl}x`).join("; ")).toEqual([]);
    expect(HOOK_ANFANG_MAX).toBe(3);
  });
});

describe("inhalte-ideen: Audit-Funktionen", () => {
  it("schweizBezug findet Brauch, Ort, Einrichtung und Wort, auch ohne Umlaute und in der Mitte eines Satzes", () => {
    expect(schweizBezug(idee({ beschrieb: "Zeig das Znüni im Team." }))).toContain(foldText("znüni"));
    expect(schweizBezug(idee({ hook: "Nach der Fasnacht geht es los." }))).toContain(foldText("fasnacht"));
    expect(schweizBezug(idee({ titel: "Räbeliechtli-Umzug im Quartier" }))).toContain(foldText("raebeliechtli"));
    expect(schweizBezug(idee({ beschrieb: "Die Gemeinde hilft bei der Anfrage." }))).toContain(foldText("gemeinde"));
    expect(schweizBezug(idee({ beschrieb: "Die Storen sind unten." }))).toContain(foldText("storen"));
  });

  it("schweizBezug zählt «Region» oder ein Fremdwort allein nicht", () => {
    expect(schweizBezug(idee({ beschrieb: "Zeig Produkte aus der Region und aus der Nachbarschaft." }))).toEqual([]);
    expect(schweizBezug(idee({}))).toEqual([]);
  });

  it("Begriffe mit «$» gelten nur als ganzes Wort", () => {
    expect(schweizBezug(idee({ beschrieb: "Die Lehre bringt Nachwuchs." }))).toContain(foldText("lehre"));
    expect(schweizBezug(idee({ beschrieb: "Die Lehren aus dem Projekt sind klar." }))).toEqual([]);
    expect(schweizBezug(idee({ beschrieb: "Gestrichen wird mit Beizen und Lasuren." }))).toEqual([]);
  });

  it("schweizAnteil ist 0 bei leerer Liste und rechnet sonst den Anteil", () => {
    expect(schweizAnteil([])).toBe(0);
    expect(schweizAnteil([idee({}), idee({ id: "x-02", hook: "Die Gemeinde lädt ein." })])).toBe(0.5);
  });

  it("stamm kürzt auf fünf Buchstaben und lässt Füllwörter weg", () => {
    expect([...stamm("Die Fassaden und die Fassade")]).toEqual(["fassa"]);
    expect(jaccard(stamm("Fassade streichen"), stamm("Fassaden streichen"))).toBe(1);
    expect(jaccard(new Set(), stamm("Fassade"))).toBe(0);
  });

  it("klone erkennt ähnliche Titel innerhalb einer Branche und mit «alle», aber nicht über Branchen hinweg", () => {
    const a = idee({ id: "h-01", titel: "Weihnachtsessen für Firmen und Vereine" });
    const b = idee({ id: "h-02", titel: "Weihnachtsessen für Vereine und Firmen" });
    expect(klone([a, b]).map((k) => k.art)).toContain("titel");
    expect(klone([a, { ...b, branche: "gastronomie" }])).toEqual([]);
    expect(klone([a, { ...b, branche: "alle" }]).length).toBeGreaterThan(0);
  });

  it("hookAnfang nimmt drei Wörter ohne Satzzeichen und Umlaute (Ü wird U)", () => {
    expect(hookAnfang("Über Weihnachten, am Stephanstag gelten wir.")).toBe("uber weihnachten am");
    expect(hookAnfang("")).toBe("");
  });

  it("audit meldet IDs ohne Bezug und zählt je Branche", () => {
    const b = audit([idee({}), idee({ id: "x-02", branche: "verein", hook: "Die Gemeinde lädt ein." })]);
    expect(b.anzahl).toBe(2);
    expect(b.schweiz).toBe(1);
    expect(b.ohneBezug).toEqual(["x-01"]);
    expect(b.jeBranche).toEqual({ handwerk: { anzahl: 1, schweiz: 0 }, verein: { anzahl: 1, schweiz: 1 } });
  });
});
