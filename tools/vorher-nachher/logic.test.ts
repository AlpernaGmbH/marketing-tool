import { describe, expect, it } from "vitest";
import { coverCrop } from "@/lib/export/png";
import { isToolDone } from "@/lib/progress";
import {
  DEFAULT_SETTINGS,
  ECKEN_KEYS,
  EMPTY_STATE,
  FIELD_IDS,
  FORMATE,
  GEO,
  LAYOUT_KEYS,
  PILLE,
  ausgabeText,
  cleanCrop,
  cleanFormate,
  cleanPosition,
  cropArgs,
  cropFor,
  eingabeText,
  ergebnisSatz,
  formatOf,
  formatPixel,
  hitImage,
  imageErrorMessage,
  labelsFor,
  layoutFor,
  overlaps,
  panByDrag,
  parseState,
  pngName,
  settingsOf,
  toggleFormat,
  validate,
  vorschauText,
  zipName,
  type Ecke,
  type FormatKey,
  type Layout,
  type Settings,
  type ValidateInput,
} from "./logic";

const measure = (text: string, px: number) => text.length * px * 0.5;
const inside = (r: { x: number; y: number; w: number; h: number }, w: number, h: number) =>
  r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9;
const KELLER: Settings = { ...DEFAULT_SETTINGS, layout: "schieber", position: 60, ecke: "or", formate: ["feed", "story"] };

describe("Formate", () => {
  it("bietet Feed 1:1, Feed 4:5 und Story 9:16, aber nicht den Google-Beitrag", () => {
    expect(FORMATE.map((f) => f.key)).toEqual(["feed", "portrait", "story"]);
    expect(FORMATE.map((f) => [f.width, f.height])).toEqual([
      [1080, 1080],
      [1080, 1350],
      [1080, 1920],
    ]);
    expect(formatPixel("story")).toBe("1'080 × 1'920 Pixel");
    expect(formatOf("portrait").label).toBe("Feed 4:5");
  });
  it("hält die Auswahl in fester Reihenfolge und ohne Unbekanntes", () => {
    expect(cleanFormate(["story", "feed", "feed", "gbp", 5, null])).toEqual(["feed", "story"]);
    expect(cleanFormate("feed")).toEqual([]);
    expect(toggleFormat(["feed"], "story")).toEqual(["feed", "story"]);
    expect(toggleFormat(["story"], "feed")).toEqual(["feed", "story"]);
    expect(toggleFormat(["feed", "story"], "feed")).toEqual(["story"]);
  });
  it("lässt die Auswahl leer werden (validate meldet das)", () => {
    expect(toggleFormat(["feed"], "feed")).toEqual([]);
  });
});

describe("Zahlen und Zuschnitt", () => {
  it("begrenzt die Trennlinie auf 20 bis 80 und fängt Unsinn ab", () => {
    expect(cleanPosition(50)).toBe(50);
    expect(cleanPosition(5)).toBe(20);
    expect(cleanPosition(99)).toBe(80);
    expect(cleanPosition(33.4)).toBe(33);
    expect(cleanPosition(Number.NaN)).toBe(50);
    expect(cleanPosition("60")).toBe(50);
  });
  it("bereinigt Zoom und Verschiebung", () => {
    expect(cleanCrop({ zoom: 1.46, x: 30.6, y: -30.4 })).toEqual({ zoom: 1.5, x: 31, y: -30 });
    expect(cleanCrop({ zoom: 0.2, x: -500, y: 500 })).toEqual({ zoom: 1, x: -100, y: 100 });
    expect(cleanCrop({ zoom: 9 }).zoom).toBe(4);
    expect(cleanCrop(null)).toEqual({ zoom: 1, x: 0, y: 0 });
    expect(cleanCrop({ zoom: "2", x: Number.NaN, y: Infinity })).toEqual({ zoom: 1, x: 0, y: 0 });
    expect(cropArgs({ zoom: 2, x: 50, y: -25 })).toEqual({ zoom: 2, panX: 0.5, panY: -0.25 });
  });
  it("schneidet mit coverCrop zu: Mitte, Zoom und Verschiebung", () => {
    const dst = { w: 537, h: 1080 };
    expect(cropFor(4000, 3000, dst, { zoom: 1, x: 0, y: 0 })).toEqual(coverCrop(4000, 3000, 537, 1080, 1, 0, 0));
    const mitte = cropFor(4000, 3000, dst, { zoom: 1, x: 0, y: 0 });
    expect(mitte.h).toBeCloseTo(3000);
    expect(mitte.x + mitte.w / 2).toBeCloseTo(2000);
    const nah = cropFor(4000, 3000, dst, { zoom: 2, x: 0, y: 0 });
    expect(nah.w).toBeCloseTo(mitte.w / 2);
    expect(cropFor(4000, 3000, dst, { zoom: 1, x: -100, y: 0 }).x).toBe(0);
    const rechts = cropFor(4000, 3000, dst, { zoom: 1, x: 100, y: 0 });
    expect(rechts.x + rechts.w).toBeCloseTo(4000);
  });
  it("hält jeden Zuschnitt im Bild", () => {
    for (const [sw, sh] of [[4000, 3000], [3000, 4000], [900, 900]] as const)
      for (const zoom of [1, 2.5, 4]) for (const x of [-100, -37, 0, 80, 100]) {
        const r = cropFor(sw, sh, { w: 1080, h: 1350 }, { zoom, x, y: -x });
        expect(r.x).toBeGreaterThanOrEqual(-1e-9);
        expect(r.y).toBeGreaterThanOrEqual(-1e-9);
        expect(r.x + r.w).toBeLessThanOrEqual(sw + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(sh + 1e-9);
      }
  });
});

describe("panByDrag", () => {
  const src = { w: 4000, h: 3000 };
  const dst = { w: 537, h: 1080 };
  const start = { zoom: 1, x: 0, y: 0 };
  it("lässt das Bild der Hand folgen: Ziehen nach rechts rückt den Ausschnitt nach links", () => {
    expect(panByDrag(src, dst, start, 100, 0).x).toBe(-22);
    expect(panByDrag(src, dst, start, -100, 0).x).toBe(22);
  });
  it("ändert nichts ohne Bewegung und bei ungültiger Bewegung", () => {
    expect(panByDrag(src, dst, start, 0, 0)).toEqual(start);
    expect(panByDrag(src, dst, { zoom: 2, x: 40, y: -10 }, 0, 0)).toEqual({ zoom: 2, x: 40, y: -10 });
    expect(panByDrag(src, dst, start, Number.NaN, Infinity)).toEqual(start);
  });
  it("hält die Grenzen ±100", () => {
    expect(panByDrag(src, dst, start, 100000, 0).x).toBe(-100);
    expect(panByDrag(src, dst, start, -100000, 0).x).toBe(100);
  });
  it("ändert eine Achse nicht, wenn das Bild dort keinen Spielraum hat", () => {
    // 4000 × 3000 in 537 × 1080: senkrecht füllt das Bild genau, waagrecht ist Platz
    expect(panByDrag(src, dst, { zoom: 1, x: 0, y: 30 }, 50, 500).y).toBe(30);
    expect(panByDrag({ w: 1000, h: 1000 }, { w: 500, h: 500 }, start, 80, 80)).toEqual(start);
  });
  it("bewegt bei Zoom weniger weit je Zielpixel und beide Achsen mit Spielraum", () => {
    const nah = panByDrag(src, dst, { zoom: 2, x: 0, y: 0 }, 100, 100);
    expect(Math.abs(nah.x)).toBeLessThan(22);
    expect(nah.x).toBeLessThan(0);
    expect(nah.y).toBeLessThan(0);
    expect(nah.zoom).toBe(2);
  });
  it("rechnet immer vom Start aus: hin und zurück ergibt den Start", () => {
    const hin = panByDrag(src, dst, { zoom: 1.5, x: 12, y: -7 }, 63, 41);
    expect(hin).not.toEqual({ zoom: 1.5, x: 12, y: -7 });
    expect(panByDrag(src, dst, { zoom: 1.5, x: 12, y: -7 }, 0, 0)).toEqual({ zoom: 1.5, x: 12, y: -7 });
    // kleine Schritte vom selben Start summieren sich über die Gesamtstrecke, nicht über gerundete Zwischenwerte
    expect(panByDrag(src, dst, start, 3, 0).x).toBe(panByDrag(src, dst, start, 3, 0).x);
    expect(panByDrag(src, dst, start, 9, 0).x).toBe(-2);
  });
  it("gibt bei einem leeren Bild den bereinigten Start zurück", () => {
    expect(panByDrag({ w: 0, h: 0 }, dst, { zoom: 3, x: 5, y: 5 }, 10, 10)).toEqual({ zoom: 3, x: 5, y: 5 });
  });
});

describe("Beschriftung", () => {
  it("liefert die Standardwörter, eigene Wörter getrimmt oder nichts", () => {
    expect(labelsFor("standard", { erstes: "x", zweites: "y" })).toEqual(["Vorher", "Nachher"]);
    expect(labelsFor("eigene", { erstes: "  Alt ", zweites: "Neu  " })).toEqual(["Alt", "Neu"]);
    expect(labelsFor("ohne", { erstes: "Alt", zweites: "Neu" })).toBeNull();
  });
});

describe("validate", () => {
  const ok: ValidateInput = { hatVorher: true, hatNachher: true, beschriftung: "standard", worte: { erstes: "", zweites: "" }, formate: ["feed"] };
  it("lässt eine vollständige Eingabe durch", () => {
    expect(validate(ok)).toEqual([]);
  });
  it("meldet, welches Bild fehlt", () => {
    expect(validate({ ...ok, hatVorher: false }).map((p) => p.message)).toEqual(["Wähle das Vorher-Bild."]);
    expect(validate({ ...ok, hatNachher: false }).map((p) => p.message)).toEqual(["Wähle das Nachher-Bild."]);
    expect(validate({ ...ok, hatVorher: false, hatNachher: false }).map((p) => p.field)).toEqual(["vorher", "nachher"]);
  });
  it("zeigt den Fehler der Datei statt «fehlt» und merkt ihn als Dateifehler", () => {
    const p = validate({ ...ok, hatVorher: false, dateifehler: { vorher: "Das Bild ist grösser als 15 MB." } });
    expect(p).toEqual([{ field: "vorher", message: "Vorher-Bild: Das Bild ist grösser als 15 MB.", datei: true }]);
    expect(validate({ ...ok, hatNachher: false })[0].datei).toBe(false);
  });
  it("meldet Fehler beim Logo, auch wenn das Logo freiwillig ist", () => {
    expect(validate({ ...ok, dateifehler: { logo: "Das ist kein Bild im Format PNG, JPG oder WebP." } })).toEqual([
      { field: "logo", message: "Logo: Das ist kein Bild im Format PNG, JPG oder WebP.", datei: true },
    ]);
  });
  it("prüft eigene Wörter: leer, nur Leerzeichen, 21 Zeichen; genau 20 gehen", () => {
    const eigene = { ...ok, beschriftung: "eigene" as const };
    expect(validate({ ...eigene, worte: { erstes: "", zweites: "Neu" } }).map((p) => p.message)).toEqual(["Gib das Wort für das erste Bild an."]);
    expect(validate({ ...eigene, worte: { erstes: "Alt", zweites: "   " } }).map((p) => p.message)).toEqual(["Gib das Wort für das zweite Bild an."]);
    expect(validate({ ...eigene, worte: { erstes: "a".repeat(21), zweites: "b".repeat(20) } }).map((p) => p.message)).toEqual([
      "Das Wort für das erste Bild hat höchstens 20 Zeichen.",
    ]);
    expect(validate({ ...eigene, worte: { erstes: "a".repeat(20), zweites: "b" } })).toEqual([]);
  });
  it("ignoriert die Wörter, solange nicht «Eigene Wörter» gewählt ist", () => {
    expect(validate({ ...ok, beschriftung: "ohne", worte: { erstes: "", zweites: "" } })).toEqual([]);
  });
  it("verlangt mindestens ein Format", () => {
    expect(validate({ ...ok, formate: [] }).map((p) => p.message)).toEqual(["Wähle mindestens ein Format."]);
  });
  it("sortiert die Probleme in der Reihenfolge der Seite und kennt für jedes ein Feld", () => {
    const all = validate({
      hatVorher: false,
      hatNachher: false,
      beschriftung: "eigene",
      worte: { erstes: "", zweites: "" },
      formate: [],
      dateifehler: { logo: "x" },
    });
    expect(all.map((p) => p.field)).toEqual(["vorher", "nachher", "wort1", "wort2", "logo", "formate"]);
    for (const p of all) expect(FIELD_IDS[p.field]).toMatch(/^vn-/);
  });
  it("macht aus Fehlern beim Lesen einen deutschen Satz", () => {
    expect(imageErrorMessage(new Error("Das Bild ist grösser als 8'000 Pixel an einer Seite."))).toBe("Das Bild ist grösser als 8'000 Pixel an einer Seite.");
    expect(imageErrorMessage(new Error("Das ist kein Bild im Format PNG, JPG oder WebP."))).toMatch(/PNG, JPG oder WebP/);
    expect(imageErrorMessage(new Error("The source image could not be decoded."))).toMatch(/konnte nicht gelesen werden/);
    expect(imageErrorMessage("kaputt")).toMatch(/konnte nicht gelesen werden/);
  });
});

describe("layoutFor: Bilder", () => {
  for (const f of FORMATE) {
    for (const layout of ["neben", "unter"] as const) {
      it(`${layout} in ${f.label}: zwei gleiche Hälften mit Spalt von 0,6 % der Breite, die das Bild decken`, () => {
        const l = layoutFor(layout, f.width, f.height);
        const a = l.vorher;
        const b = l.nachher;
        expect(l.clip).toBeNull();
        expect(l.linie).toBeNull();
        expect(l.griff).toBeNull();
        expect(a.w).toBe(b.w);
        expect(a.h).toBe(b.h);
        if (layout === "neben") {
          const gap = b.x - (a.x + a.w);
          expect(a.x).toBe(0);
          expect(b.x + b.w).toBe(f.width);
          expect(a.h).toBe(f.height);
          expect(Math.abs(gap - GEO.spalt * f.width)).toBeLessThan(1.5);
          expect(Number.isInteger(a.w)).toBe(true);
        } else {
          const gap = b.y - (a.y + a.h);
          expect(a.y).toBe(0);
          expect(b.y + b.h).toBe(f.height);
          expect(a.w).toBe(f.width);
          expect(Math.abs(gap - GEO.spalt * f.width)).toBeLessThan(1.5);
          expect(Number.isInteger(a.h)).toBe(true);
        }
        expect(overlaps(a, b)).toBe(false);
        expect(inside(a, f.width, f.height) && inside(b, f.width, f.height)).toBe(true);
      });
    }
  }
  it("rechnet Feed 1:1 nebeneinander genau: 537 + 6 + 537 = 1080", () => {
    const l = layoutFor("neben", 1080, 1080);
    expect(l.vorher).toEqual({ x: 0, y: 0, w: 537, h: 1080 });
    expect(l.nachher).toEqual({ x: 543, y: 0, w: 537, h: 1080 });
    expect(l.bereiche[1]).toEqual(l.nachher);
  });
  it("rechnet Story untereinander genau: 957 + 6 + 957 = 1920", () => {
    const l = layoutFor("unter", 1080, 1920);
    expect(l.vorher).toEqual({ x: 0, y: 0, w: 1080, h: 957 });
    expect(l.nachher).toEqual({ x: 0, y: 963, w: 1080, h: 957 });
  });
  it("macht den Spalt bei ungeraden Massen gerade, damit keine halben Pixel entstehen", () => {
    const l = layoutFor("neben", 1001, 700);
    expect(Number.isInteger(l.vorher.w)).toBe(true);
    expect(l.nachher.x + l.nachher.w).toBe(1001);
  });
  it("fällt bei einem unbekannten Layout auf Nebeneinander zurück", () => {
    expect(layoutFor("quer" as Layout, 1080, 1080).vorher).toEqual(layoutFor("neben", 1080, 1080).vorher);
  });
  for (const f of FORMATE) {
    it(`Schieber in ${f.label}: beide Bilder füllen die Fläche, das Vorher-Bild endet an der Linie`, () => {
      const l = layoutFor("schieber", f.width, f.height, 50);
      const full = { x: 0, y: 0, w: f.width, h: f.height };
      expect(l.vorher).toEqual(full);
      expect(l.nachher).toEqual(full);
      expect(l.clip).toEqual({ x: 0, y: 0, w: f.width / 2, h: f.height });
      expect(l.bereiche[1]).toEqual({ x: f.width / 2, y: 0, w: f.width / 2, h: f.height });
      expect(l.linie).toEqual({ x: f.width / 2 - 2, y: 0, w: 4, h: f.height });
      expect(l.griff).toEqual({ cx: f.width / 2, cy: f.height / 2, r: GEO.griff * f.width });
    });
  }
  it("setzt die Trennlinie bei 20 und 80 und begrenzt alles darüber hinaus", () => {
    expect(layoutFor("schieber", 1080, 1080, 20).clip!.w).toBe(216);
    expect(layoutFor("schieber", 1080, 1080, 80).clip!.w).toBe(864);
    expect(layoutFor("schieber", 1080, 1080, 0).clip!.w).toBe(216);
    expect(layoutFor("schieber", 1080, 1080, 100).clip!.w).toBe(864);
    expect(layoutFor("schieber", 1080, 1080, Number.NaN).clip!.w).toBe(540);
    const l = layoutFor("schieber", 1080, 1080, 20);
    expect(l.griff!.cx - l.griff!.r).toBeGreaterThan(0);
    expect(inside(l.linie!, 1080, 1080)).toBe(true);
  });
  it("kennt keinen waagrechten Schieber: die Linie ist immer senkrecht", () => {
    const l = layoutFor("schieber", 1080, 1920, 50);
    expect(l.linie!.h).toBe(1920);
    expect(l.linie!.w).toBe(4);
  });
});

describe("layoutFor: Pillen", () => {
  const texte = ["Vorher", "Nachher"] as const;
  it("setzt die Pillen oben links in ihren Bereich, 3 % der Breite vom Rand, Schrift 3,2 % der Breite", () => {
    const l = layoutFor("neben", 1080, 1080, 50, { texte, breite: measure });
    expect(l.pillen).toHaveLength(2);
    const [p1, p2] = l.pillen;
    expect(p1.index).toBe(0);
    expect(p2.index).toBe(1);
    expect(p1.rect.x).toBeCloseTo(0.03 * 1080);
    expect(p1.rect.y).toBeCloseTo(0.03 * 1080);
    expect(p2.rect.x).toBeCloseTo(l.nachher.x + 0.03 * 1080);
    expect(p1.schrift).toBeCloseTo(0.032 * 1080);
    expect(p1.rect.h).toBeCloseTo(PILLE.hoehe * p1.schrift);
    expect(p1.rect.w).toBeCloseTo(measure("Vorher", p1.schrift) + 2 * PILLE.innen * p1.schrift);
  });
  it("setzt bei Untereinander die zweite Pille oben links in die untere Hälfte", () => {
    const l = layoutFor("unter", 1080, 1350, 50, { texte, breite: measure });
    expect(l.pillen[1].rect.x).toBeCloseTo(0.03 * 1080);
    expect(l.pillen[1].rect.y).toBeCloseTo(l.nachher.y + 0.03 * 1080);
  });
  it("setzt beim Schieber Vorher oben links und Nachher oben rechts, rechtsbündig", () => {
    const l = layoutFor("schieber", 1080, 1080, 50, { texte, breite: measure });
    const [p1, p2] = l.pillen;
    expect(p1.rect.x).toBeCloseTo(0.03 * 1080);
    expect(p2.rect.x + p2.rect.w).toBeCloseTo(1080 - 0.03 * 1080);
    expect(p2.rect.y).toBeCloseTo(0.03 * 1080);
  });
  it("lässt die Pillen im Bild, im eigenen Bereich und ohne Überlappung, in jedem Layout und Format", () => {
    for (const layout of LAYOUT_KEYS)
      for (const f of FORMATE)
        for (const position of [20, 50, 80]) {
          const l = layoutFor(layout, f.width, f.height, position, { texte: ["Vorher mit langem Wo", "Nachher mit langem W"], breite: measure });
          expect(l.pillen).toHaveLength(2);
          expect(overlaps(l.pillen[0].rect, l.pillen[1].rect)).toBe(false);
          l.pillen.forEach((p, i) => {
            expect(inside(p.rect, f.width, f.height)).toBe(true);
            expect(inside(p.rect, l.bereiche[i].x + l.bereiche[i].w, l.bereiche[i].y + l.bereiche[i].h)).toBe(true);
            expect(p.rect.x).toBeGreaterThanOrEqual(l.bereiche[i].x - 1e-9);
          });
        }
  });
  it("verkleinert eine lange Pille im schmalen Bereich des Schiebers und kürzt sie zuletzt mit «…»", () => {
    const mittel = layoutFor("schieber", 1080, 1080, 20, { texte: ["Vorarbeit", "Nachher"], breite: measure });
    expect(mittel.pillen[0].schrift).toBeLessThan(0.032 * 1080);
    expect(mittel.pillen[0].schrift).toBeGreaterThan(0.032 * 1080 * PILLE.minSchrift);
    expect(mittel.pillen[0].text).toBe("Vorarbeit");
    const lang = layoutFor("schieber", 1080, 1080, 20, { texte: ["Sehr lange Beschrift", "Noch längere Beschri"], breite: measure });
    expect(lang.pillen[0].schrift).toBeCloseTo(0.032 * 1080 * PILLE.minSchrift);
    expect(lang.pillen[0].text.endsWith("…")).toBe(true);
    expect(lang.pillen[0].rect.x + lang.pillen[0].rect.w).toBeLessThanOrEqual(lang.bereiche[0].w + 1e-9);
    expect(lang.pillen[1].text).toBe("Noch längere Beschri");
  });
  it("lässt leere Wörter weg und liefert ohne Texte keine Pillen", () => {
    expect(layoutFor("neben", 1080, 1080, 50, { texte: ["", "  Neu "], breite: measure }).pillen.map((p) => [p.index, p.text])).toEqual([[1, "Neu"]]);
    expect(layoutFor("neben", 1080, 1080, 50, { texte: null }).pillen).toEqual([]);
    expect(layoutFor("neben", 1080, 1080).pillen).toEqual([]);
  });
  it("schätzt die Breite, wenn keine Messfunktion übergeben wird", () => {
    const l = layoutFor("neben", 1080, 1080, 50, { texte });
    expect(l.pillen[0].rect.w).toBeGreaterThan(0);
  });
});

describe("layoutFor: Logo", () => {
  const aspects = [3, 1, 0.3];
  it("setzt das Logo in die gewählte Ecke, 3 % vom Rand, proportional auf eine Platte mit 2 % Innenabstand", () => {
    const l = layoutFor("neben", 1080, 1080, 50, { logo: { aspect: 2, ecke: "ur", prozent: 14 } });
    const m = 0.03 * 1080;
    const pad = 0.02 * 1080;
    const box = l.logo!;
    expect(box.ecke).toBe("ur");
    expect(box.logo.w).toBeCloseTo(0.14 * 1080);
    expect(box.logo.h).toBeCloseTo((0.14 * 1080) / 2);
    expect(box.platte.w).toBeCloseTo(box.logo.w + 2 * pad);
    expect(box.platte.x + box.platte.w).toBeCloseTo(1080 - m);
    expect(box.platte.y + box.platte.h).toBeCloseTo(1080 - m);
    expect(box.logo.x).toBeCloseTo(box.platte.x + pad);
    expect(box.radius).toBeCloseTo(pad);
  });
  it("passt ein hohes Logo in die Höhe ein und ein breites in die Breite", () => {
    const hoch = layoutFor("neben", 1080, 1080, 50, { logo: { aspect: 0.5, ecke: "ol", prozent: 20 } }).logo!;
    expect(hoch.logo.h).toBeCloseTo(0.2 * 1080);
    expect(hoch.logo.w).toBeCloseTo(0.1 * 1080);
    expect(hoch.logo.w / hoch.logo.h).toBeCloseTo(0.5);
  });
  it("hält die Grösse zwischen 8 und 24 Prozent", () => {
    expect(layoutFor("neben", 1080, 1080, 50, { logo: { aspect: 1, ecke: "ur", prozent: 1 } }).logo!.logo.w).toBeCloseTo(0.08 * 1080);
    expect(layoutFor("neben", 1080, 1080, 50, { logo: { aspect: 1, ecke: "ur", prozent: 90 } }).logo!.logo.w).toBeCloseTo(0.24 * 1080);
  });
  it("bleibt ohne Beschriftung in jeder Ecke, wo die Person es will", () => {
    for (const ecke of ECKEN_KEYS) for (const layout of LAYOUT_KEYS) expect(layoutFor(layout, 1080, 1080, 50, { logo: { aspect: 1, ecke, prozent: 14 } }).logo!.ecke).toBe(ecke);
  });
  it("weicht der Beschriftung aus: oben links wird beim Schieber unten links, oben rechts bleibt frei, wo keine Pille steht", () => {
    const base = { texte: ["Vorher", "Nachher"] as const, breite: measure };
    expect(layoutFor("schieber", 1080, 1080, 50, { ...base, logo: { aspect: 1, ecke: "ol", prozent: 14 } }).logo!.ecke).toBe("ul");
    expect(layoutFor("schieber", 1080, 1080, 50, { ...base, logo: { aspect: 1, ecke: "or", prozent: 14 } }).logo!.ecke).toBe("ur");
    expect(layoutFor("neben", 1080, 1080, 50, { ...base, logo: { aspect: 1, ecke: "ol", prozent: 14 } }).logo!.ecke).toBe("ul");
    expect(layoutFor("neben", 1080, 1080, 50, { ...base, logo: { aspect: 1, ecke: "ur", prozent: 14 } }).logo!.ecke).toBe("ur");
  });
  it("weicht auch aus, wenn eine lange Pille der zweiten Hälfte bis in die Ecke reicht", () => {
    const l = layoutFor("neben", 1080, 1080, 50, {
      texte: ["Vorher", "Nachher mit langem W"],
      breite: measure,
      logo: { aspect: 1, ecke: "or", prozent: 24 },
    });
    expect(overlaps(l.logo!.platte, l.pillen[1].rect)).toBe(false);
    expect(l.logo!.ecke).not.toBe("or");
  });
  it("bleibt in jedem Layout, Format, jeder Ecke und Logoform im Bild und überdeckt weder Pillen noch den Griff", () => {
    const m = GEO.rand * 1080;
    for (const layout of LAYOUT_KEYS)
      for (const f of FORMATE)
        for (const ecke of ECKEN_KEYS)
          for (const aspect of aspects)
            for (const prozent of [8, 24])
              for (const position of [20, 80]) {
                const l = layoutFor(layout, f.width, f.height, position, {
                  texte: ["Vorher mit langem Wo", "Nachher mit langem W"],
                  breite: measure,
                  logo: { aspect, ecke, prozent },
                });
                const box = l.logo!;
                expect(inside(box.platte, f.width, f.height)).toBe(true);
                expect(inside(box.logo, f.width, f.height)).toBe(true);
                for (const p of l.pillen) expect(overlaps(box.platte, p.rect, m / 2)).toBe(false);
                if (l.griff) expect(overlaps(box.platte, { x: l.griff.cx - l.griff.r, y: l.griff.cy - l.griff.r, w: 2 * l.griff.r, h: 2 * l.griff.r })).toBe(false);
              }
  });
  it("verkleinert das Logo, damit die Platte bei einem sehr kleinen Bild im Bild bleibt", () => {
    const l = layoutFor("neben", 100, 60, 50, { logo: { aspect: 1, ecke: "ul", prozent: 24 } });
    expect(inside(l.logo!.platte, 100, 60)).toBe(true);
  });
  it("fängt ein ungültiges Seitenverhältnis und eine ungültige Ecke ab", () => {
    const l = layoutFor("neben", 1080, 1080, 50, { logo: { aspect: Number.NaN, ecke: "mitte" as Ecke, prozent: 14 } });
    expect(inside(l.logo!.platte, 1080, 1080)).toBe(true);
    expect(l.logo!.ecke).toBe("ur");
    expect(layoutFor("neben", 1080, 1080, 50, { logo: null }).logo).toBeNull();
  });
});

describe("hitImage", () => {
  it("findet das Bild unter dem Zeiger, im Spalt und ausserhalb keines", () => {
    const neben = layoutFor("neben", 1080, 1080);
    expect(hitImage(neben, 100, 500)).toBe("vorher");
    expect(hitImage(neben, 900, 500)).toBe("nachher");
    expect(hitImage(neben, 540, 500)).toBeNull();
    expect(hitImage(neben, -5, 10)).toBeNull();
    const unter = layoutFor("unter", 1080, 1350);
    expect(hitImage(unter, 500, 100)).toBe("vorher");
    expect(hitImage(unter, 500, 1200)).toBe("nachher");
  });
  it("entscheidet beim Schieber nach der Linie", () => {
    const l = layoutFor("schieber", 1080, 1080, 30);
    expect(hitImage(l, 100, 500)).toBe("vorher");
    expect(hitImage(l, 400, 500)).toBe("nachher");
    expect(hitImage(l, 1200, 500)).toBeNull();
  });
});

describe("Dateinamen", () => {
  it("benennt PNG nach der Firma oder, ohne Firma, nach dem Werkzeug", () => {
    expect(pngName("Malerei Keller", "feed")).toBe("malerei-keller-feed.png");
    expect(pngName("  Bäckerei Müller & Söhne, Gossau ", "story")).toBe("backerei-muller-sohne-gossau-story.png");
    expect(pngName(undefined, "portrait")).toBe("vorher-nachher-portrait.png");
    expect(pngName("   ", "feed")).toBe("vorher-nachher-feed.png");
  });
  it("benennt das ZIP", () => {
    expect(zipName("Malerei Keller, Gossau")).toBe("vorher-nachher-malerei-keller-gossau.zip");
    expect(zipName("Bäckerei Müller")).toBe("vorher-nachher-baeckerei-mueller.zip");
    expect(zipName()).toBe("vorher-nachher.zip");
    expect(zipName("???")).toBe("vorher-nachher-firma.zip");
  });
});

describe("Texte", () => {
  const vorher = { name: "fassade-alt.jpg", width: 4000, height: 3000 };
  const nachher = { name: "fassade-neu.jpg", width: 3000, height: 4000 };
  it("beschreibt die Vorschau als Text", () => {
    expect(vorschauText({ format: "feed", settings: DEFAULT_SETTINGS, hatVorher: true, hatNachher: true, hatLogo: false })).toBe(
      "Vorschau Feed 1:1: zwei Bilder nebeneinander, links das Vorher-Bild, rechts das Nachher-Bild. Beschriftung «Vorher» und «Nachher». Kein Logo.",
    );
    const schieber = vorschauText({ format: "story", settings: KELLER, hatVorher: false, hatNachher: true, hatLogo: true });
    expect(schieber).toContain("Vorschau Story 9:16: ein Schieber mit senkrechter Trennlinie bei 60 %");
    expect(schieber).toContain("Logo oben rechts.");
    expect(schieber).toContain("Es fehlt noch: Vorher-Bild.");
    expect(vorschauText({ format: "portrait", settings: { ...DEFAULT_SETTINGS, layout: "unter", beschriftung: "ohne" }, hatVorher: true, hatNachher: true, hatLogo: false })).toContain(
      "zwei Bilder untereinander, oben das Vorher-Bild, unten das Nachher-Bild. Ohne Beschriftung.",
    );
    expect(
      vorschauText({ format: "feed", settings: { ...DEFAULT_SETTINGS, beschriftung: "eigene", worte: { erstes: "Alt", zweites: "Neu" } }, hatVorher: true, hatNachher: true, hatLogo: false }),
    ).toContain("Beschriftung «Alt» und «Neu».");
  });
  it("schreibt die Eingabe für das CRM je Zeile und ohne Bilddaten", () => {
    expect(eingabeText({ firma: "Malerei Keller", settings: KELLER, vorher, nachher, logo: true })).toBe(
      [
        "Firma: Malerei Keller",
        "Layout: Schieber, Trennlinie bei 60 %",
        "Beschriftung: Vorher und Nachher",
        "Formate: Feed 1:1, Story 9:16",
        "Logo: ja, oben rechts, 14 % der Breite",
        "Vorher-Bild: fassade-alt.jpg, 4'000 × 3'000 Pixel",
        "Nachher-Bild: fassade-neu.jpg, 3'000 × 4'000 Pixel",
        "Zuschnitt Vorher: Zoom 1, waagrecht 0, senkrecht 0",
        "Zuschnitt Nachher: Zoom 1, waagrecht 0, senkrecht 0",
      ].join("\n"),
    );
  });
  it("lässt Firma und Trennlinie weg, wo sie nichts bedeuten, und nennt eigene Wörter und den Zuschnitt", () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      beschriftung: "eigene",
      worte: { erstes: "Alt", zweites: "Neu" },
      zuschnitt: { vorher: { zoom: 1.5, x: 20, y: -10 }, nachher: { zoom: 1, x: 0, y: 0 } },
    };
    const text = eingabeText({ settings: s, vorher, nachher, logo: false });
    expect(text.startsWith("Layout: Nebeneinander\n")).toBe(true);
    expect(text).not.toContain("Firma:");
    expect(text).not.toContain("Trennlinie");
    expect(text).toContain("Beschriftung: Eigene Wörter «Alt» und «Neu»");
    expect(text).toContain("Logo: nein");
    expect(text).toContain("Zuschnitt Vorher: Zoom 1,5, waagrecht 20, senkrecht -10");
    expect(eingabeText({ settings: { ...s, beschriftung: "ohne" }, vorher, nachher, logo: false })).toContain("Beschriftung: Ohne");
  });
  it("kürzt lange Dateinamen und enthält nie Bilddaten", () => {
    const text = eingabeText({ settings: DEFAULT_SETTINGS, vorher: { name: `${"a".repeat(200)}.jpg`, width: 10, height: 10 }, nachher, logo: false });
    expect(text.split("\n").find((l) => l.startsWith("Vorher-Bild:"))!.length).toBeLessThan(120);
    expect(text).not.toMatch(/data:|blob:/);
    expect(text.length).toBeLessThan(1900);
  });
  it("schreibt die Ausgabe mit Pixelmassen und dem Satz zum Browser", () => {
    expect(ausgabeText(["feed", "story"])).toBe(
      ["Vorher-Nachher-Collage: 2 Formate", "Feed 1:1: 1'080 × 1'080 Pixel", "Story 9:16: 1'080 × 1'920 Pixel", "PNG im Browser erzeugt, nichts hochgeladen"].join("\n"),
    );
    expect(ausgabeText(["portrait"]).split("\n")[0]).toBe("Vorher-Nachher-Collage: 1 Format");
  });
  it("fasst das Ergebnis in einem Satz zusammen", () => {
    expect(ergebnisSatz(KELLER)).toBe("2 Formate, Layout Schieber, Beschriftung «Vorher» und «Nachher».");
    expect(ergebnisSatz({ ...DEFAULT_SETTINGS, beschriftung: "ohne" })).toBe("1 Format, Layout Nebeneinander, ohne Beschriftung.");
  });
});

describe("parseState", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "text", 42, [], true, {}, { v: 2, phase: "result" }]) expect(parseState(raw)).toEqual(EMPTY_STATE);
  });
  it("fällt feldweise auf die Voreinstellung zurück", () => {
    const s = parseState({ v: 1, layout: "quer", position: "viel", beschriftung: 7, worte: "x", ecke: "mitte", logoGroesse: null, formate: "feed", zuschnitt: [] });
    expect(s).toEqual({ ...EMPTY_STATE });
  });
  it("begrenzt Werte und kürzt Wörter", () => {
    const s = parseState({
      v: 1,
      position: 5,
      logoGroesse: 99,
      worte: { erstes: "x".repeat(50), zweites: 3 },
      zuschnitt: { vorher: { zoom: 8, x: 400, y: -400 }, nachher: { zoom: "a" } },
    });
    expect(s.position).toBe(20);
    expect(s.logoGroesse).toBe(24);
    expect(s.worte).toEqual({ erstes: "x".repeat(20), zweites: "" });
    expect(s.zuschnitt.vorher).toEqual({ zoom: 4, x: 100, y: -100 });
    expect(s.zuschnitt.nachher).toEqual({ zoom: 1, x: 0, y: 0 });
  });
  it("kennt nur Feed 1:1, Feed 4:5 und Story 9:16", () => {
    expect(parseState({ v: 1, formate: ["story", "gbp", "feed", "quer"] }).formate).toEqual(["feed", "story"]);
    expect(parseState({ v: 1, formate: ["gbp"] }).formate).toEqual(["feed"]);
  });
  it("hält «result» nur mit gültigem output", () => {
    expect(parseState({ v: 1, phase: "result" }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "result", output: "x" }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "result", output: { formate: ["gbp"], logo: true } }).phase).toBe("edit");
    const s = parseState({ v: 1, phase: "result", output: { formate: ["story", "feed"], logo: 1 } });
    expect(s.phase).toBe("result");
    expect(s.output).toEqual({ formate: ["feed", "story"], logo: false });
    expect(parseState({ v: 1, phase: "bearbeitet", output: { formate: ["feed"], logo: true } }).phase).toBe("edit");
  });
  it("liest den eigenen Stand unverändert wieder ein und lässt den Pfad ihn als erledigt erkennen", () => {
    const state = { v: 1 as const, phase: "result" as const, ...KELLER, output: { formate: ["feed", "story"] as FormatKey[], logo: true } };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(isToolDone(JSON.stringify(state))).toBe(true);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
    expect(settingsOf(state)).toEqual(KELLER);
  });
  it("speichert keine Bilder und keine Dateinamen", () => {
    const json = JSON.stringify({ v: 1, phase: "result", ...KELLER, output: { formate: ["feed"], logo: true }, name: "geheim.jpg", bild: "data:image/png;base64,AAAA" });
    const again = JSON.stringify(parseState(JSON.parse(json)));
    expect(again).not.toMatch(/geheim|data:|base64/);
  });
});

describe("cropFor und die Pillen zusammen", () => {
  it("nutzt dieselben Zielmasse wie das Layout", () => {
    const l = layoutFor("neben", 1080, 1350);
    const src = cropFor(3000, 4000, { w: l.vorher.w, h: l.vorher.h }, { zoom: 1, x: 0, y: 0 });
    expect(src.w / src.h).toBeCloseTo(l.vorher.w / l.vorher.h);
  });
});
