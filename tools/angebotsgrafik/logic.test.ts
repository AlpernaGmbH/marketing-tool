import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { IMAGE_FORMATS, INK, PAPER, contrastRatio, imageFormat, type Rect } from "@/lib/export/png";
import {
  ALL_PRESENT,
  AUFFORDERUNGEN,
  COLOR_HINT,
  DEFAULT_FORMATE,
  EMPTY_STATE,
  FARBEN,
  LIMITS,
  LOGO_HINWEIS,
  PLATZHALTER,
  PREIS_HINWEIS,
  STORY_SAFE_PX,
  TEMPLATES,
  accentFor,
  ausgabeText,
  boostFor,
  buildOutput,
  describeOffer,
  eingabeText,
  feldProblems,
  fitIntoBox,
  formOf,
  gueltigDatum,
  hinweise,
  isIsoDate,
  kontaktVorschlag,
  layoutFor,
  modelOf,
  orderFormats,
  parseAmount,
  parseState,
  pngFilename,
  presenceOf,
  previewModel,
  priceLines,
  readableOn,
  stateOf,
  styleHints,
  todayIso,
  validate,
  validityLine,
  zipName,
  type ElementKey,
  type FieldKey,
  type OfferInput,
  type Presence,
  type TemplateKey,
} from "./logic";

const HEUTE = "2026-10-05";

const base: OfferInput = {
  firma: "Malerei Keller",
  titel: "Herbstaktion",
  angebot: "Fassadenanstrich inklusive Gerüst",
  preis: "4900",
  frueher: "5600",
  gueltigBis: "2026-11-30",
  aufforderung: "Termin vereinbaren",
  kontakt: "malerei-keller.ch",
  vorlage: "kraeftig",
  farbe: "marine",
  hex: "",
  formate: ["feed", "story"],
  logo: false,
};
const fields = (input: OfferInput, heute = HEUTE): FieldKey[] => validate(input, heute).map((p) => p.field);
const messageOf = (input: OfferInput, field: FieldKey): string | undefined => validate(input, HEUTE).find((p) => p.field === field)?.message;

describe("angebotsgrafik: Konstanten", () => {
  it("kennt drei Vorlagen, vier Farben und die Standardformate Feed und Story", () => {
    expect(TEMPLATES.map((t) => t.label)).toEqual(["Ruhig", "Kräftig", "Handwerk"]);
    expect(FARBEN.map((f) => f.label)).toEqual(["Tinte", "Marine", "Gold", "Eigene Farbe"]);
    expect(FARBEN.slice(0, 3).map((f) => f.hex)).toEqual(["#0F0F0E", "#111A28", "#FFD700"]);
    expect(DEFAULT_FORMATE).toEqual(["feed", "story"]);
  });
  it("ordnet Formate wie IMAGE_FORMATS und wirft Doppelte und Unbekanntes weg", () => {
    expect(orderFormats(["story", "feed", "feed", "quer", 3])).toEqual(["feed", "story"]);
    expect(orderFormats([])).toEqual([]);
  });
});

describe("angebotsgrafik: parseAmount", () => {
  it("liest Zahlen in üblichen Schreibweisen", () => {
    expect(parseAmount("4900")).toBe(4900);
    expect(parseAmount("4'900")).toBe(4900);
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("0")).toBe(0);
    expect(parseAmount("1000000")).toBe(1_000_000);
  });
  it("weist Leeres, Text, Minus, zu viele Dezimalstellen und Zahlen über der Grenze ab", () => {
    for (const bad of ["", "  ", "abc", "-5", "1e3", "12.345", "1000001", "12 CHF", "4900.-"]) expect(parseAmount(bad)).toBeNull();
  });
});

describe("angebotsgrafik: validate", () => {
  it("lässt vollständige Angaben durch", () => {
    expect(validate(base, HEUTE)).toEqual([]);
  });
  it("verlangt einen Titel von 3 bis 40 Zeichen", () => {
    expect(fields({ ...base, titel: "" })).toEqual(["titel"]);
    expect(fields({ ...base, titel: "  ab  " })).toEqual(["titel"]);
    expect(fields({ ...base, titel: "abc" })).toEqual([]);
    expect(fields({ ...base, titel: "x".repeat(40) })).toEqual([]);
    expect(messageOf({ ...base, titel: "x".repeat(41) }, "titel")).toBe("Der Titel darf höchstens 40 Zeichen haben.");
  });
  it("verlangt ein Angebot von 5 bis 90 Zeichen", () => {
    expect(fields({ ...base, angebot: "Fass" })).toEqual(["angebot"]);
    expect(fields({ ...base, angebot: "Fassa" })).toEqual([]);
    expect(fields({ ...base, angebot: "x".repeat(90) })).toEqual([]);
    expect(fields({ ...base, angebot: "x".repeat(91) })).toEqual(["angebot"]);
  });
  it("zählt Zeichen, nicht Bytes, und fasst Leerraum zusammen", () => {
    expect(fields({ ...base, titel: "ÄÖÜ" })).toEqual([]);
    expect(fields({ ...base, titel: "a    b" })).toEqual([]);
    expect(fields({ ...base, titel: "a  \n  " })).toEqual(["titel"]);
  });
  it("prüft den Preis: leer erlaubt, 0 erlaubt, Dezimalstellen erlaubt, Text und Grenzen nicht", () => {
    expect(fields({ ...base, preis: "", frueher: "" })).toEqual([]);
    expect(fields({ ...base, preis: "0", frueher: "" })).toEqual([]);
    expect(fields({ ...base, preis: "12.50", frueher: "" })).toEqual([]);
    expect(fields({ ...base, preis: "1000000", frueher: "" })).toEqual([]);
    expect(fields({ ...base, preis: "1000000.01", frueher: "" })).toEqual(["preis"]);
    expect(fields({ ...base, preis: "gratis", frueher: "" })).toEqual(["preis"]);
    expect(fields({ ...base, preis: "-1", frueher: "" })).toEqual(["preis"]);
  });
  it("erlaubt den früheren Preis nur mit Preis und nur, wenn er grösser ist", () => {
    expect(fields({ ...base, preis: "", frueher: "5600" })).toEqual(["frueher"]);
    expect(messageOf({ ...base, preis: "", frueher: "5600" }, "frueher")).toBe("Ein früherer Preis braucht einen Preis.");
    expect(messageOf({ ...base, preis: "4900", frueher: "4900" }, "frueher")).toBe("Der frühere Preis muss grösser sein als der Preis.");
    expect(fields({ ...base, preis: "4900", frueher: "4000" })).toEqual(["frueher"]);
    expect(fields({ ...base, preis: "4900", frueher: "4900.05" })).toEqual([]);
    expect(fields({ ...base, preis: "4900", frueher: "viel" })).toEqual(["frueher"]);
    expect(fields({ ...base, preis: "0", frueher: "1" })).toEqual([]);
  });
  it("meldet kein Datum in der Vergangenheit, heute ist erlaubt", () => {
    expect(fields({ ...base, gueltigBis: "2026-10-04" })).toEqual(["gueltigBis"]);
    expect(messageOf({ ...base, gueltigBis: "2026-10-04" }, "gueltigBis")).toBe("Das Datum liegt in der Vergangenheit.");
    expect(fields({ ...base, gueltigBis: HEUTE })).toEqual([]);
    expect(fields({ ...base, gueltigBis: "" })).toEqual([]);
    expect(fields({ ...base, gueltigBis: "30.11.2026" })).toEqual(["gueltigBis"]);
    expect(fields({ ...base, gueltigBis: "2026-02-30" })).toEqual(["gueltigBis"]);
  });
  it("verlangt eine Aufforderung bis 40 Zeichen und eine Kontaktzeile bis 50 Zeichen", () => {
    expect(fields({ ...base, aufforderung: "" })).toEqual(["aufforderung"]);
    expect(fields({ ...base, aufforderung: "x".repeat(41) })).toEqual(["aufforderung"]);
    expect(fields({ ...base, aufforderung: "x".repeat(40) })).toEqual([]);
    expect(fields({ ...base, kontakt: "" })).toEqual([]);
    expect(fields({ ...base, kontakt: "x".repeat(50) })).toEqual([]);
    expect(fields({ ...base, kontakt: "x".repeat(51) })).toEqual(["kontakt"]);
  });
  it("prüft den Hex-Wert nur bei «Eigene Farbe»", () => {
    expect(fields({ ...base, farbe: "eigen", hex: "#1B5E20" })).toEqual([]);
    expect(fields({ ...base, farbe: "eigen", hex: "1b5" })).toEqual([]);
    expect(fields({ ...base, farbe: "eigen", hex: "grün" })).toEqual(["hex"]);
    expect(fields({ ...base, farbe: "eigen", hex: "" })).toEqual(["hex"]);
    expect(fields({ ...base, farbe: "gold", hex: "kaputt" })).toEqual([]);
  });
  it("verlangt mindestens ein Format", () => {
    expect(fields({ ...base, formate: [] })).toEqual(["formate"]);
    expect(fields({ ...base, formate: ["gbp"] })).toEqual([]);
  });
  it("verlangt Firma oder Logo und meldet Probleme in der Reihenfolge des Formulars", () => {
    expect(fields({ ...base, firma: "  " })).toEqual(["firma"]);
    expect(fields({ ...base, firma: "", logo: true })).toEqual([]);
    expect(fields({ ...base, firma: "", titel: "", aufforderung: "", formate: [] })).toEqual(["firma", "titel", "aufforderung", "formate"]);
  });
  it("feldProblems prüft ohne Firma", () => {
    expect(feldProblems({ ...base, titel: "" }, HEUTE).map((p) => p.field)).toEqual(["titel"]);
  });
});

describe("angebotsgrafik: Preis- und Gültigkeitszeile", () => {
  it("setzt den Preis wie chf()", () => {
    expect(priceLines({ preis: "1200", frueher: "" })).toEqual({ preis: "CHF 1'200.-", frueher: null });
    expect(priceLines({ preis: "12,5", frueher: "" }).preis).toBe("CHF 12.50");
    expect(priceLines({ preis: "999999.95", frueher: "1000000" })).toEqual({ preis: "CHF 999'999.95", frueher: "CHF 1'000'000.-" });
  });
  it("zeigt bei 0 «Gratis» und ohne Preis nichts", () => {
    expect(priceLines({ preis: "0", frueher: "" }).preis).toBe("Gratis");
    expect(priceLines({ preis: "", frueher: "100" })).toEqual({ preis: null, frueher: null });
    expect(priceLines({ preis: "abc", frueher: "100" })).toEqual({ preis: null, frueher: null });
  });
  it("lässt einen früheren Preis weg, der nicht grösser ist oder nicht lesbar", () => {
    expect(priceLines({ preis: "100", frueher: "100" }).frueher).toBeNull();
    expect(priceLines({ preis: "100", frueher: "50" }).frueher).toBeNull();
    expect(priceLines({ preis: "100", frueher: "x" }).frueher).toBeNull();
    expect(priceLines({ preis: "100", frueher: "150" }).frueher).toBe("CHF 150.-");
  });
  it("schreibt die Gültigkeit mit dateCH", () => {
    expect(validityLine({ gueltigBis: "2026-11-30" })).toBe("Gültig bis 30.11.2026");
    expect(validityLine({ gueltigBis: "2026-01-05" })).toBe("Gültig bis 05.01.2026");
    expect(gueltigDatum({ gueltigBis: "2027-12-31" })).toBe("31.12.2027");
    expect(validityLine({ gueltigBis: "" })).toBeNull();
    expect(validityLine({ gueltigBis: "morgen" })).toBeNull();
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });
  it("rechnet das heutige Datum nach Schweizer Zeit", () => {
    expect(todayIso(new Date("2026-10-05T10:00:00Z"))).toBe("2026-10-05");
    expect(todayIso(new Date("2026-10-04T23:30:00Z"))).toBe("2026-10-05");
  });
});

describe("angebotsgrafik: Farbe und Kontrast", () => {
  it("wählt auf den drei Festfarben eine Textfarbe mit mindestens 4,5:1", () => {
    for (const f of FARBEN.slice(0, 3)) {
      const p = accentFor(f.key, "");
      expect(p.accent).toBe(f.hex);
      expect(contrastRatio(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
    }
    expect(accentFor("gold", "").onAccent).toBe(INK);
    expect(accentFor("tinte", "").onAccent).toBe(PAPER);
  });
  it("hält 4,5:1 bei zehn festen Hex-Werten und auf einem Raster aller Farben", () => {
    const ten = ["#1B5E20", "#B71C1C", "#0D47A1", "#FF6F00", "#6A1B9A", "#00897B", "#FBC02D", "#795548", "#9E9E9E", "#777777"];
    for (const hex of ten) {
      const p = accentFor("eigen", hex);
      expect(contrastRatio(p.onAccent, p.accent), hex).toBeGreaterThanOrEqual(4.5);
    }
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 17) {
        for (let b = 0; b < 256; b += 17) {
          const bg = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          expect(contrastRatio(readableOn(bg), bg), bg).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
  it("fällt bei den mittleren Grautönen auf reines Schwarz oder Weiss zurück", () => {
    const p = accentFor("eigen", "#777777");
    expect(["#000000", "#FFFFFF"]).toContain(p.onAccent);
  });
  it("nimmt für Linien Tinte, wenn die Farbe auf Papier unter 3:1 liegt", () => {
    const gold = accentFor("gold", "");
    expect(gold.lowContrast).toBe(true);
    expect(gold.line).toBe(INK);
    const marine = accentFor("marine", "");
    expect(marine.lowContrast).toBe(false);
    expect(marine.line).toBe(marine.accent);
    expect(accentFor("eigen", "#FFFFE0").lowContrast).toBe(true);
    expect(accentFor("eigen", "#1B5E20").line).toBe("#1B5E20");
  });
  it("normalisiert den Hex-Wert und fällt bei einem ungültigen auf Tinte zurück", () => {
    expect(accentFor("eigen", "1b5e20").accent).toBe("#1B5E20");
    expect(accentFor("eigen", "#abc").accent).toBe("#AABBCC");
    expect(accentFor("eigen", "xyz").accent).toBe(INK);
    expect(COLOR_HINT).toContain("Tinte");
  });
});

// ---- Layout --------------------------------------------------------------------------------------------

const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key) as TemplateKey[];
const PRESENCES: Presence[] = [
  ALL_PRESENT,
  { ...ALL_PRESENT, logo: false },
  { ...ALL_PRESENT, preis: false, frueher: false },
  { ...ALL_PRESENT, frueher: false },
  { ...ALL_PRESENT, gueltig: false, kontakt: false },
  { logo: false, preis: false, frueher: false, gueltig: false, kontakt: false },
  { ...ALL_PRESENT, titelLen: 5, angebotLen: 10 },
];
const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.w >= 0 && r.h >= 0 && r.x + r.w <= w && r.y + r.h <= h;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function eachLayout(run: (name: string, t: TemplateKey, w: number, h: number, p: Presence, l: ReturnType<typeof layoutFor>) => void) {
  for (const t of TEMPLATE_KEYS) for (const f of IMAGE_FORMATS) for (const [i, p] of PRESENCES.entries()) run(`${t} ${f.key} #${i}`, t, f.width, f.height, p, layoutFor(t, f.width, f.height, p));
}

describe("angebotsgrafik: layoutFor", () => {
  it("legt alle Elemente innerhalb des Bildes ab, mit mindestens 6 % Rand", () => {
    eachLayout((name, _t, w, h, _p, l) => {
      expect(l.margin, name).toBeGreaterThanOrEqual(Math.ceil(w * 0.06));
      for (const [key, b] of Object.entries(l.boxes)) {
        expect(inside(b, w, h), `${name} ${key}`).toBe(true);
        expect(b.x, `${name} ${key} links`).toBeGreaterThanOrEqual(l.margin);
        expect(b.x + b.w, `${name} ${key} rechts`).toBeLessThanOrEqual(w - l.margin);
      }
    });
  });
  it("lässt Textblöcke einander nicht überlappen", () => {
    eachLayout((name, _t, _w, _h, _p, l) => {
      const entries = Object.entries(l.boxes) as [ElementKey, Rect][];
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) expect(overlap(entries[i][1], entries[j][1]), `${name}: ${entries[i][0]} und ${entries[j][0]}`).toBe(false);
      }
    });
  });
  it("hält bei der Story oben und unten je 250 Pixel von Text und Logo frei", () => {
    const story = imageFormat("story");
    for (const t of TEMPLATE_KEYS) {
      for (const p of PRESENCES) {
        const l = layoutFor(t, story.width, story.height, p);
        expect(l.story).toBe(true);
        expect(l.safeTop).toBe(STORY_SAFE_PX);
        expect(l.safeBottom).toBe(STORY_SAFE_PX);
        for (const [key, b] of Object.entries(l.boxes)) {
          expect(b.y, `${t} ${key} oben`).toBeGreaterThanOrEqual(STORY_SAFE_PX);
          expect(b.y + b.h, `${t} ${key} unten`).toBeLessThanOrEqual(story.height - STORY_SAFE_PX);
        }
      }
    }
  });
  it("hält bei den anderen Formaten nur den Rand frei und erkennt Story und Querformat", () => {
    const feed = layoutFor("ruhig", 1080, 1080);
    expect(feed.story).toBe(false);
    expect(feed.safeTop).toBe(feed.margin);
    expect(layoutFor("ruhig", 1080, 1350).story).toBe(false);
    expect(layoutFor("ruhig", 1200, 900).wide).toBe(true);
    expect(layoutFor("ruhig", 1080, 1080).wide).toBe(false);
  });
  it("lässt weg, was fehlt: ohne Logo steht der Name da, ohne Preis kein Preis und kein früherer Preis", () => {
    const l = layoutFor("ruhig", 1080, 1080, { ...ALL_PRESENT, logo: false, preis: false, gueltig: false, kontakt: false });
    expect(l.boxes.logo).toBeUndefined();
    expect(l.boxes.firma).toBeDefined();
    for (const k of ["preis", "frueher", "gueltig", "kontakt"] as const) expect(l.boxes[k], k).toBeUndefined();
    expect(layoutFor("ruhig", 1080, 1080).boxes.firma).toBeUndefined();
    expect(layoutFor("ruhig", 1080, 1080, { ...ALL_PRESENT, preis: false }).boxes.frueher).toBeUndefined();
    expect(layoutFor("ruhig", 1080, 1080, { ...ALL_PRESENT, frueher: false }).boxes.frueher).toBeUndefined();
    for (const k of ["titel", "angebot", "aufforderung"] as const) expect(l.boxes[k], k).toBeDefined();
  });
  it("hält das Logo auf höchstens 18 % der Breite", () => {
    eachLayout((name, _t, w, _h, p, l) => {
      expect(l.logoMaxWidth, name).toBe(Math.round(w * 0.18));
      if (p.logo) expect(l.boxes.logo!.w, name).toBeLessThanOrEqual(l.logoMaxWidth);
    });
  });
  it("setzt die Flächen: Kräftig füllt alles in der Farbe, Handwerk hat Band und Kreis, Ruhig eine Linie", () => {
    const k = layoutFor("kraeftig", 1080, 1080);
    expect(k.background).toBe("accent");
    expect(k.logoPlate).toBe(true);
    expect(k.boxes.aufforderung!.fill).toBe("onAccent");
    const r = layoutFor("ruhig", 1080, 1080);
    expect(r.background).toBe("paper");
    expect(r.dekor).toHaveLength(1);
    expect(r.dekor[0]).toMatchObject({ kind: "rect", fill: "line" });
    const hw = layoutFor("handwerk", 1080, 1350);
    const band = hw.dekor.find((d) => d.kind === "rect" && d.fill === "accent");
    expect(band && band.kind === "rect" && band.rect.y + band.rect.h).toBe(1350);
    expect(hw.dekor.filter((d) => d.kind === "ring")).toHaveLength(1);
    expect(layoutFor("handwerk", 1080, 1350, { ...ALL_PRESENT, preis: false, frueher: false }).dekor.some((d) => d.kind === "ring")).toBe(false);
  });
  it("legt in Handwerk den Preis in den Kreis und hält Dekor und Text getrennt", () => {
    for (const f of IMAGE_FORMATS) {
      const l = layoutFor("handwerk", f.width, f.height);
      const ring = l.dekor.find((d) => d.kind === "ring");
      if (!ring || ring.kind !== "ring") throw new Error("Kreis fehlt");
      expect(ring.cx - ring.r, f.key).toBeGreaterThanOrEqual(0);
      expect(ring.cx + ring.r, f.key).toBeLessThanOrEqual(f.width);
      expect(ring.cy - ring.r, f.key).toBeGreaterThanOrEqual(0);
      expect(ring.cy + ring.r, f.key).toBeLessThanOrEqual(f.height);
      const inner = ring.r - ring.stroke;
      for (const key of ["preis", "frueher"] as const) {
        const b = l.boxes[key]!;
        for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
          expect(Math.hypot(x - ring.cx, y - ring.cy), `${f.key} ${key}`).toBeLessThanOrEqual(inner);
        }
      }
      const square: Rect = { x: ring.cx - ring.r, y: ring.cy - ring.r, w: 2 * ring.r, h: 2 * ring.r };
      for (const [key, b] of Object.entries(l.boxes)) {
        if (key === "preis" || key === "frueher") continue;
        expect(overlap(square, b), `${f.key}: Kreis und ${key}`).toBe(false);
      }
    }
  });
  it("verteilt die Höhe nach der Länge der Texte: lange Texte bekommen mehr Platz", () => {
    const kurz = layoutFor("ruhig", 1080, 1350, { ...ALL_PRESENT, titelLen: 5, angebotLen: 8 });
    const lang = layoutFor("ruhig", 1080, 1350, { ...ALL_PRESENT, titelLen: 40, angebotLen: 90 });
    expect(lang.boxes.angebot!.h).toBeGreaterThan(kurz.boxes.angebot!.h);
    const langerTitel = layoutFor("ruhig", 1080, 1350, { ...ALL_PRESENT, titelLen: 40, angebotLen: 8 });
    const kurzerTitel = layoutFor("ruhig", 1080, 1350, { ...ALL_PRESENT, titelLen: 5, angebotLen: 8 });
    expect(langerTitel.boxes.titel!.h).toBeGreaterThan(kurzerTitel.boxes.titel!.h);
    expect(layoutFor("ruhig", 1080, 1350).boxes.titel).toEqual(lang.boxes.titel);
  });
  it("hat Schriften mit Untergrenze unter Obergrenze und rechnet den Zuschlag nach Seitenverhältnis", () => {
    eachLayout((name, _t, _w, _h, _p, l) => {
      for (const [key, spec] of Object.entries(l.fonts)) expect(spec.min, `${name} ${key}`).toBeLessThanOrEqual(spec.max);
    });
    expect(boostFor(1080, 1080)).toBe(1);
    expect(boostFor(1080, 1920)).toBe(1.4);
    expect(boostFor(1200, 900)).toBeCloseTo(0.85, 5);
    expect(boostFor(1080, 1350)).toBeCloseTo(1.15, 5);
  });
  it("übersteht unsinnige Grössen ohne Absturz", () => {
    const l = layoutFor("ruhig", 0, 0);
    expect(l.width).toBe(1);
    expect(() => layoutFor("handwerk", 10, 10)).not.toThrow();
  });
});

// ---- Text im Rechteck -----------------------------------------------------------------------------------

/** Breite einer Zeile bei fester Zeichenbreite. Gemessen mit Geist: Fliesstext rund 0,47 em je Zeichen, Titel rund 0,5 em, Versalien 0,6 em. */
const monoAt = (em: number) => (size: number) => (s: string) => s.length * size * em;
const mono = monoAt(0.6);

describe("angebotsgrafik: fitIntoBox", () => {
  const spec = { max: 100, min: 20, lines: 2, lh: 1.1 };
  it("nimmt die grösste Schrift, die in Breite, Zeilen und Höhe passt", () => {
    const r = fitIntoBox("Herbstaktion", 800, 200, spec, mono);
    expect(r.ellipsis).toBe(false);
    expect(r.lines).toEqual(["Herbstaktion"]);
    expect(r.size).toBe(100); // 12 Zeichen * 60 = 720 <= 800
    const narrow = fitIntoBox("Herbstaktion", 400, 200, spec, mono);
    expect(narrow.size).toBeLessThan(100);
    expect(narrow.lines.length * narrow.size * 1.1).toBeLessThanOrEqual(200);
  });
  it("bricht auf zwei Zeilen um und senkt die Schrift, wenn die Höhe nicht reicht", () => {
    const r = fitIntoBox("Herbstaktion Fassade und Fenster", 400, 110, spec, mono);
    expect(r.lines.length).toBeLessThanOrEqual(2);
    expect(r.lines.length * r.size * 1.1).toBeLessThanOrEqual(110);
    for (const l of r.lines) expect(mono(r.size)(l)).toBeLessThanOrEqual(400);
  });
  it("kürzt mit «…» erst, wenn auch die Untergrenze nicht passt", () => {
    const r = fitIntoBox("x".repeat(200), 300, 60, spec, mono);
    expect(r.size).toBe(20);
    expect(r.ellipsis).toBe(true);
    expect(r.lines.at(-1)?.endsWith("…")).toBe(true);
    expect(r.lines.length).toBeLessThanOrEqual(2);
  });
  it("kommt mit leerem Text und winzigen Rechtecken zurecht", () => {
    expect(fitIntoBox("", 100, 100, spec, mono).lines).toEqual([]);
    expect(() => fitIntoBox("Text", 1, 1, spec, mono)).not.toThrow();
  });
});

describe("angebotsgrafik: längste Angaben passen in jedes Layout", () => {
  const longest = {
    titel: "Herbstaktion Fassade und Fenster Spezial",
    angebot: "Fassadenanstrich inklusive Gerüst, Reinigung aller Fenster und Entsorgung der Farbreste ZH",
    aufforderung: "Gratis Besichtigung vor Ort vereinbaren.",
    kontakt: "malerei-keller.ch, Tel. 071 123 45 67, 9200 Gossau",
    gueltig: "Gültig bis 30.11.2026",
    preis: "CHF 999'999.95",
    frueher: "CHF 1'000'000.-",
    firma: "Malerei Keller Gossau AG",
  };
  it("kürzt nirgends, wenn Titel (40), Angebot (90), Aufforderung (40) und Kontaktzeile (50) voll ausgeschöpft sind", () => {
    expect(longest.titel.length).toBe(40);
    expect(longest.angebot.length).toBe(LIMITS.angebot.max);
    expect(longest.aufforderung.length).toBe(40);
    expect(longest.kontakt.length).toBe(LIMITS.kontakt.max);
    eachLayout((name, _t, _w, _h, p, l) => {
      if (p.titelLen !== undefined) return; // kurze Texte: dieses Layout gibt ihnen bewusst weniger Platz
      for (const [key, b] of Object.entries(l.boxes)) {
        if (key === "logo") continue;
        const text = longest[key as keyof typeof longest];
        const spec = l.fonts[key as keyof typeof l.fonts];
        const width = key === "aufforderung" ? b.w - 2 * Math.round(b.h * 0.5) : b.w;
        const height = key === "aufforderung" ? Math.round(b.h * 0.7) : b.h;
        // Für Fliesstext gilt 0,55 em je Zeichen (gemessen 0,47), für den Titel auch ein Titel in Versalien mit 0,6 em.
        const fit = fitIntoBox(text, width, height, key === "aufforderung" ? { ...spec, lines: 1 } : spec, monoAt(key === "titel" ? 0.6 : 0.55));
        expect(fit.ellipsis, `${name} ${key}`).toBe(false);
        expect(fit.lines.length * fit.size * spec.lh, `${name} ${key} Höhe`).toBeLessThanOrEqual(height);
      }
    });
  });
  it("kürzt Preise und Datum nie, auch nicht in sehr engen Rechtecken", () => {
    const fonts = layoutFor("handwerk", 1080, 1080).fonts;
    for (const text of [longest.preis, longest.frueher]) {
      for (const key of ["preis", "frueher"] as const) {
        const fit = fitIntoBox(text, 150, 60, fonts[key], mono);
        expect(fit.ellipsis, `${key} ${text}`).toBe(false);
        expect(fit.lines).toEqual([text]);
      }
    }
    const date = fitIntoBox(longest.gueltig, 230, 40, fonts.gueltig, mono);
    expect(date.ellipsis).toBe(false);
    expect(date.lines).toEqual([longest.gueltig]);
  });
  it("kürzt ein sehr langes Wort ohne Leerzeichen auf die Breite, statt über den Rand zu laufen", () => {
    const word = "Herbstaktionsfassadenanstrichspezialangebot";
    const spec = layoutFor("ruhig", 1080, 1080).fonts.titel;
    const fit = fitIntoBox(word, 908, 250, spec, mono);
    expect(fit.size).toBe(spec.min);
    expect(fit.ellipsis).toBe(true);
    for (const l of fit.lines) expect(mono(fit.size)(l)).toBeLessThanOrEqual(908);
  });
});

// ---- Hinweise zu den Texten -----------------------------------------------------------------------------

describe("angebotsgrafik: Hinweise zu Wörtern der Sperrliste", () => {
  const clean = { titel: "Herbstaktion", angebot: "Fassadenanstrich inklusive Gerüst", aufforderung: "Termin vereinbaren", kontakt: "malerei-keller.ch" };
  it("schweigt bei ruhigen Texten", () => {
    expect(styleHints(clean)).toEqual([]);
  });
  it("weist auf «jetzt», «nur noch», «garantiert» und Ausrufezeichen hin", () => {
    expect(styleHints({ ...clean, aufforderung: "Jetzt anrufen" }).map((h) => h.message)).toEqual(["Aufforderung: «jetzt» wirkt wie Druck."]);
    expect(styleHints({ ...clean, titel: "Nur noch heute" })[0].message).toContain("«nur noch»");
    expect(styleHints({ ...clean, angebot: "Garantiert günstig" })[0].message).toContain("«garantiert»");
    expect(styleHints({ ...clean, titel: "Herbstaktion!" })[0]).toEqual({ field: "titel", message: "Titel: Ausrufezeichen wirken laut." });
  });
  it("übernimmt die harten Regeln aus lib/brand-rules.ts, hier «nur diese Woche» und den Gedankenstrich", () => {
    expect(brandHits("Nur diese Woche").some((h) => h.level === "hart")).toBe(true);
    expect(styleHints({ ...clean, titel: "Nur diese Woche" }).some((h) => /falsche Dringlichkeit/.test(h.message))).toBe(true);
    expect(styleHints({ ...clean, angebot: "Fassade — Gerüst" }).some((h) => /Gedankenstrich/.test(h.message))).toBe(true);
  });
  it("blockiert nichts: Die Angaben bleiben gültig", () => {
    const input = { ...base, aufforderung: "Jetzt anrufen!" };
    expect(validate(input, HEUTE)).toEqual([]);
    expect(modelOf(input).aufforderung).toBe("Jetzt anrufen!");
  });
  it("enthält in Vorschlägen, Platzhaltern und Hinweisen kein Wort der Sperrliste", () => {
    const strings = [
      ...AUFFORDERUNGEN,
      ...Object.values(PLATZHALTER),
      ...TEMPLATES.map((t) => `${t.label}. ${t.beschreibung}`),
      ...FARBEN.map((f) => f.label),
      ...IMAGE_FORMATS.map((f) => `${f.label}. ${f.note}`),
      ...hinweise(["feed", "story"]),
      PREIS_HINWEIS,
      LOGO_HINWEIS,
      COLOR_HINT,
      "Gratis",
      "Gültig bis 30.11.2026",
    ];
    for (const s of strings) {
      expect(brandHits(s), s).toEqual([]);
      expect(/\bjetzt\b|\bnur noch\b|\bgarantiert\b|!|—/i.test(s), s).toBe(false);
    }
    expect(styleHints({ titel: AUFFORDERUNGEN.join(" "), angebot: PLATZHALTER.angebot, aufforderung: AUFFORDERUNGEN[0], kontakt: "" })).toEqual([]);
  });
  it("nennt unter dem Ergebnis die Story-Ränder nur bei gewählter Story", () => {
    expect(hinweise(["feed"]).join(" ")).not.toContain("250");
    expect(hinweise(["feed", "story"]).join(" ")).toContain("250 Pixel");
    expect(hinweise(["feed"]).join(" ")).toContain("Richtwert von Alperna, keine Statistik");
    expect(hinweise(["feed"]).join(" ")).toContain("Alternativtext");
  });
});

// ---- Modell, Dateien, CRM -------------------------------------------------------------------------------

describe("angebotsgrafik: Modell und Beschreibung", () => {
  it("baut das Modell aus den Angaben", () => {
    const m = modelOf(base);
    expect(m).toMatchObject({ firma: "Malerei Keller", titel: "Herbstaktion", preis: "CHF 4'900.-", frueher: "CHF 5'600.-", gueltig: "Gültig bis 30.11.2026", vorlage: "kraeftig" });
    expect(m.palette.accent).toBe("#111A28");
  });
  it("setzt in der Vorschau Beispieltexte für leere Pflichtfelder", () => {
    const p = previewModel({ ...base, titel: "", angebot: "", aufforderung: "" });
    expect(p.platzhalter).toBe(true);
    expect(p.model.titel).toBe(PLATZHALTER.titel);
    expect(p.model.angebot).toBe(PLATZHALTER.angebot);
    expect(p.model.aufforderung).toBe(PLATZHALTER.aufforderung);
    expect(previewModel(base).platzhalter).toBe(false);
  });
  it("meldet fürs Layout, was vorhanden ist", () => {
    const m = modelOf({ ...base, preis: "", frueher: "", gueltigBis: "", kontakt: "" });
    expect(presenceOf(m, false)).toMatchObject({ logo: false, preis: false, frueher: false, gueltig: false, kontakt: false, titelLen: 12 });
    expect(presenceOf(modelOf(base), true)).toMatchObject({ logo: true, preis: true, frueher: true, gueltig: true, kontakt: true });
  });
  it("beschreibt die Grafik als Text für Screenreader", () => {
    expect(describeOffer(modelOf(base))).toBe(
      "Herbstaktion. Fassadenanstrich inklusive Gerüst. CHF 4'900.-, früher CHF 5'600.-. Gültig bis 30.11.2026. Termin vereinbaren. malerei-keller.ch. Malerei Keller.",
    );
    expect(describeOffer(modelOf({ ...base, preis: "", frueher: "", gueltigBis: "", kontakt: "", firma: "" }))).toBe("Herbstaktion. Fassadenanstrich inklusive Gerüst. Termin vereinbaren.");
  });
});

describe("angebotsgrafik: Beispiel aus dem Seitentext", () => {
  const beispiel: OfferInput = {
    ...base,
    titel: "Herbstaktion Fassadenanstrich",
    angebot: "Neuer Anstrich für dein Haus, Gerüst inklusive",
    kontakt: "malerei-keller.ch",
    formate: ["feed", "story"],
  };
  it("stimmt mit dem, was das Werkzeug rechnet, überein", () => {
    expect(validate(beispiel, HEUTE)).toEqual([]);
    expect(priceLines(beispiel)).toEqual({ preis: "CHF 4'900.-", frueher: "CHF 5'600.-" });
    expect(validityLine(beispiel)).toBe("Gültig bis 30.11.2026");
    const o = buildOutput(beispiel);
    expect(o.dateien.map((d) => d.datei)).toEqual(["herbstaktion-fassadenanstrich-feed.png", "herbstaktion-fassadenanstrich-story.png"]);
    expect(zipName(o.titel)).toBe("angebotsgrafik-herbstaktion-fassadenanstrich.zip");
    expect(o.dateien.map((d) => `${d.width} × ${d.height}`)).toEqual(["1080 × 1080", "1080 × 1920"]);
  });
});

describe("angebotsgrafik: Dateinamen", () => {
  it("benennt PNG und ZIP ohne Sonderzeichen", () => {
    expect(pngFilename("Herbstaktion Fassadenanstrich", "feed")).toBe("herbstaktion-fassadenanstrich-feed.png");
    expect(pngFilename("Käse & Brot!", "story")).toBe("kase-brot-story.png");
    expect(pngFilename("", "gbp")).toBe("grafik-gbp.png");
    expect(zipName("Herbstaktion Fassadenanstrich")).toBe("angebotsgrafik-herbstaktion-fassadenanstrich.zip");
    expect(zipName("Küche & Bäder")).toBe("angebotsgrafik-kueche-baeder.zip");
    expect(zipName("   ")).toBe("angebotsgrafik-grafik.zip");
  });
  it("baut das Ergebnis mit den gewählten Formaten in fester Reihenfolge", () => {
    const o = buildOutput({ ...base, formate: ["story", "feed"], logo: true });
    expect(o).toMatchObject({ titel: "Herbstaktion", firma: "Malerei Keller", logo: true });
    expect(o.dateien.map((d) => d.key)).toEqual(["feed", "story"]);
    expect(o.dateien[1]).toEqual({ key: "story", label: "Story 9:16", width: 1080, height: 1920, datei: "herbstaktion-story.png" });
  });
});

describe("angebotsgrafik: Texte fürs CRM", () => {
  it("nennt die Angaben je Zeile, das Logo nur als ja oder nein", () => {
    const text = eingabeText({ ...base, logo: true });
    expect(text.split("\n")).toEqual([
      "Titel: Herbstaktion",
      "Angebot: Fassadenanstrich inklusive Gerüst",
      "Preis: CHF 4'900.-",
      "Früherer Preis: CHF 5'600.-",
      "Gültig bis: 30.11.2026",
      "Aufforderung: Termin vereinbaren",
      "Kontaktzeile: malerei-keller.ch",
      "Farbe: Marine (#111A28)",
      "Vorlage: Kräftig",
      "Formate: Feed 1:1, Story 9:16",
      "Logo: ja",
    ]);
    expect(eingabeText(base)).toContain("Logo: nein");
    expect(text).not.toMatch(/data:|blob:|base64/);
  });
  it("sagt bei fehlenden Angaben «keiner», «ohne Datum» und «keine»", () => {
    const text = eingabeText({ ...base, preis: "", frueher: "", gueltigBis: "", kontakt: "", farbe: "eigen", hex: "1b5e20" });
    expect(text).toContain("Preis: keiner");
    expect(text).toContain("Früherer Preis: keiner");
    expect(text).toContain("Gültig bis: ohne Datum");
    expect(text).toContain("Kontaktzeile: keine");
    expect(text).toContain("Farbe: Eigene Farbe (#1B5E20)");
  });
  it("nennt in der Ausgabe die Formate mit Pixelmassen und den Satz zum Browser", () => {
    const text = ausgabeText(buildOutput(base));
    expect(text.split("\n")).toEqual([
      "Angebotsgrafik «Herbstaktion»: 2 Formate",
      "- Feed 1:1: 1080 × 1080 Pixel (herbstaktion-feed.png)",
      "- Story 9:16: 1080 × 1920 Pixel (herbstaktion-story.png)",
      "ZIP: angebotsgrafik-herbstaktion.zip",
      "PNG im Browser erzeugt, nichts hochgeladen.",
    ]);
    expect(ausgabeText(buildOutput({ ...base, formate: ["gbp"] }))).toContain("Angebotsgrafik «Herbstaktion»: 1 Format\n- Google-Beitrag 4:3: 1200 × 900 Pixel");
  });
});

// ---- Stand ----------------------------------------------------------------------------------------------

describe("angebotsgrafik: parseState", () => {
  const result = () => {
    const form = { ...base };
    const state = stateOf(EMPTY_STATE, form, true);
    return { ...state, phase: "result", output: buildOutput(form) };
  };
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const bad of [null, undefined, "text", 5, [], {}, { v: 2 }, { v: "1" }]) {
      const s = parseState(bad);
      expect(s.phase, String(bad)).toBe("edit");
      expect(s.felder.titel).toBe("");
      expect(s.formate).toEqual(["feed", "story"]);
      expect(s.output).toBeUndefined();
    }
  });
  it("liefert unabhängige Kopien des leeren Stands", () => {
    const a = parseState(null);
    a.formate.push("gbp");
    a.felder.titel = "x";
    expect(parseState(null).formate).toEqual(["feed", "story"]);
    expect(parseState(null).felder.titel).toBe("");
    expect(EMPTY_STATE.felder.titel).toBe("");
  });
  it("nimmt einen gültigen Stand mit Ergebnis an und liest ihn zurück", () => {
    const s = parseState(JSON.parse(JSON.stringify(result())));
    expect(s.phase).toBe("result");
    expect(s.output?.dateien.map((d) => d.key)).toEqual(["feed", "story"]);
    expect(s.logo).toBe(true);
    expect(formOf(s, "")).toMatchObject({ titel: "Herbstaktion", preis: "4900", vorlage: "kraeftig", farbe: "marine" });
  });
  it("macht aus «result» ohne Ergebnis oder mit ungültigen Angaben wieder «edit»", () => {
    const r = result();
    expect(parseState({ ...r, output: undefined }).phase).toBe("edit");
    expect(parseState({ ...r, output: { dateien: [] } }).phase).toBe("edit");
    expect(parseState({ ...r, output: { dateien: [{ key: "quer" }] } }).phase).toBe("edit");
    expect(parseState({ ...r, felder: { ...r.felder, titel: "" } }).phase).toBe("edit");
    expect(parseState({ ...r, formate: [] }).phase).toBe("edit");
    expect(parseState({ ...r, farbe: "eigen", hex: "kaputt" }).phase).toBe("edit");
    expect(parseState({ ...r, phase: "weiter" }).phase).toBe("edit");
  });
  it("lässt ein Ergebnis gelten, auch wenn «Gültig bis» inzwischen verstrichen ist", () => {
    const r = result();
    expect(parseState({ ...r, felder: { ...r.felder, gueltigBis: "2020-01-01" } }).phase).toBe("result");
  });
  it("ersetzt unbekannte Werte und kürzt zu lange Texte", () => {
    const s = parseState({ v: 1, phase: "edit", felder: { titel: "x".repeat(900), preis: 5, kontakt: 7 }, vorlage: "bunt", farbe: "pink", hex: "#12345678", formate: ["story", "quer", "feed", "feed"], logo: "ja" });
    expect(s.felder.titel).toHaveLength(200);
    expect(s.felder.preis).toBe("");
    expect(s.felder.kontakt).toBeNull();
    expect(s.vorlage).toBe("ruhig");
    expect(s.farbe).toBe("tinte");
    expect(s.hex).toBe("#123456");
    expect(s.formate).toEqual(["feed", "story"]);
    expect(s.logo).toBe(false);
  });
  it("unterscheidet «Kontaktzeile nie gesetzt» von «bewusst leer»", () => {
    const nie = parseState({ v: 1, felder: {} });
    const leer = parseState({ v: 1, felder: { kontakt: "" } });
    expect(formOf(nie, "malerei-keller.ch").kontakt).toBe("malerei-keller.ch");
    expect(formOf(leer, "malerei-keller.ch").kontakt).toBe("");
  });
  it("schreibt das Formular zurück in den Stand und ordnet die Formate", () => {
    const s = stateOf(EMPTY_STATE, { ...base, formate: ["story", "feed"] }, false);
    expect(s.formate).toEqual(["feed", "story"]);
    expect(s.felder.kontakt).toBe("malerei-keller.ch");
    expect(s.logo).toBe(false);
    expect(JSON.stringify(s)).not.toContain("firma");
  });
});

describe("angebotsgrafik: Vorschlag für die Kontaktzeile", () => {
  it("nimmt die Website ohne https, sonst den Ort, sonst nichts", () => {
    expect(kontaktVorschlag({ website: "https://malerei-keller.ch/", ort: "Gossau" })).toBe("malerei-keller.ch");
    expect(kontaktVorschlag({ ort: "Gossau" })).toBe("Gossau");
    expect(kontaktVorschlag({ website: "  ", ort: " " })).toBe("");
    expect(kontaktVorschlag({})).toBe("");
    expect(kontaktVorschlag({ website: `${"a".repeat(60)}.ch` })).toBe("");
  });
});
