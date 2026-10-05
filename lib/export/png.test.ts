import { describe, expect, it } from "vitest";
import {
  IMAGE_FORMATS,
  IMAGE_LIMITS,
  INK,
  PAPER,
  contrastRatio,
  coverCrop,
  fitFont,
  imageFileProblem,
  imageFormat,
  isImageFormatKey,
  isPng,
  normalizeHex,
  pngFilename,
  textColorFor,
  wrapByWidth,
} from "@/lib/export/png";

const mono = (s: string) => s.length * 10; // jedes Zeichen 10 Einheiten breit

describe("Formate", () => {
  it("kennt vier Formate mit den erwarteten Verhältnissen", () => {
    expect(IMAGE_FORMATS.map((f) => f.key)).toEqual(["feed", "portrait", "story", "gbp"]);
    const ratio = (k: Parameters<typeof imageFormat>[0]) => imageFormat(k).width / imageFormat(k).height;
    expect(ratio("feed")).toBe(1);
    expect(ratio("portrait")).toBeCloseTo(4 / 5, 5);
    expect(ratio("story")).toBeCloseTo(9 / 16, 5);
    expect(ratio("gbp")).toBeCloseTo(4 / 3, 5);
  });
  it("erkennt Schlüssel und fällt bei Unbekanntem auf das Feed-Format zurück", () => {
    expect(isImageFormatKey("story")).toBe(true);
    expect(isImageFormatKey("quer")).toBe(false);
    expect(imageFormat("nix" as never).key).toBe("feed");
  });
  it("bildet saubere Dateinamen", () => {
    expect(pngFilename("Angebot der Woche: Fassade!", "story")).toBe("angebot-der-woche-fassade-story.png");
    expect(pngFilename("Käse & Brot, Zürich", "feed")).toBe("kase-brot-zurich-feed.png");
    expect(pngFilename("   ", "gbp")).toBe("grafik-gbp.png");
    expect(pngFilename("x".repeat(100), "feed").length).toBeLessThanOrEqual(50);
  });
});

describe("coverCrop", () => {
  it("füllt das Ziel und trifft bei gleichem Verhältnis das ganze Bild", () => {
    expect(coverCrop(1000, 500, 200, 100)).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });
  it("schneidet ein Querformat für ein Quadrat mittig zu", () => {
    const r = coverCrop(2000, 1000, 500, 500);
    expect(r.w).toBeCloseTo(1000);
    expect(r.h).toBeCloseTo(1000);
    expect(r.x).toBeCloseTo(500);
    expect(r.y).toBe(0);
  });
  it("verschiebt den Ausschnitt mit pan von -1 bis 1 und hält ihn im Bild", () => {
    const links = coverCrop(2000, 1000, 500, 500, 1, -1, 0);
    const rechts = coverCrop(2000, 1000, 500, 500, 1, 1, 0);
    expect(links.x).toBe(0);
    expect(rechts.x).toBeCloseTo(1000);
    const aussen = coverCrop(2000, 1000, 500, 500, 1, 5, -5);
    expect(aussen.x + aussen.w).toBeLessThanOrEqual(2000 + 1e-9);
    expect(aussen.y).toBeGreaterThanOrEqual(0);
  });
  it("verkleinert den Ausschnitt mit dem Zoom und begrenzt den Zoom", () => {
    expect(coverCrop(1000, 1000, 500, 500, 2).w).toBeCloseTo(500);
    expect(coverCrop(1000, 1000, 500, 500, 0.2).w).toBeCloseTo(1000);
    expect(coverCrop(1000, 1000, 500, 500, 100).w).toBeCloseTo(125);
  });
  it("hält jeden Ausschnitt innerhalb des Bildes (Zoom und Verschiebung gemischt)", () => {
    for (const [sw, sh] of [[4000, 3000], [3000, 4000], [800, 800]] as const)
      for (const zoom of [1, 1.5, 3]) for (const pan of [-1, -0.3, 0, 0.7, 1]) {
        const r = coverCrop(sw, sh, 1080, 1350, zoom, pan, -pan);
        expect(r.x).toBeGreaterThanOrEqual(-1e-9);
        expect(r.y).toBeGreaterThanOrEqual(-1e-9);
        expect(r.x + r.w).toBeLessThanOrEqual(sw + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(sh + 1e-9);
      }
  });
  it("gibt bei ungültigen Massen ein leeres Rechteck und fängt NaN ab", () => {
    expect(coverCrop(0, 100, 10, 10)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    const r = coverCrop(100, 100, 50, 50, Number.NaN, Number.NaN, Number.NaN);
    expect(Number.isNaN(r.x) || Number.isNaN(r.w)).toBe(false);
  });
});

describe("wrapByWidth", () => {
  it("bricht nach Breite um", () => {
    expect(wrapByWidth("eins zwei drei vier", 100, mono)).toEqual(["eins zwei", "drei vier"]);
  });
  it("lässt ein zu langes Wort in einer eigenen Zeile", () => {
    expect(wrapByWidth("ab Donaudampfschifffahrt cd", 100, mono)).toEqual(["ab", "Donaudampfschifffahrt", "cd"]);
  });
  it("behält Absätze und ignoriert Leerzeichen am Rand", () => {
    expect(wrapByWidth("  eins  \n\nzwei ", 500, mono)).toEqual(["eins", "zwei"]);
  });
  it("kürzt auf maxLines und endet mit …", () => {
    const lines = wrapByWidth("eins zwei drei vier fünf sechs", 100, mono, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(mono(lines[1])).toBeLessThanOrEqual(100);
  });
  it("gibt für leeren Text keine Zeilen", () => {
    expect(wrapByWidth("   ", 100, mono)).toEqual([]);
  });
});

describe("fitFont", () => {
  const measureAt = (size: number) => (s: string) => s.length * size * 0.5;
  it("nimmt die grösste Schrift, bei der der Text passt", () => {
    const { size, lines } = fitFont("Angebot der Woche", 300, 2, measureAt, 80, 20);
    expect(size).toBeLessThanOrEqual(80);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.every((l) => measureAt(size)(l) <= 300)).toBe(true);
    // eine Stufe grösser passt nicht mehr
    expect(wrapByWidth("Angebot der Woche", 300, measureAt(size + 2)).length).toBeGreaterThan(2);
  });
  it("fällt bei zu viel Text auf die Mindestgrösse und kürzt", () => {
    const { size, lines } = fitFont("sehr ".repeat(80), 200, 2, measureAt, 60, 24);
    expect(size).toBe(24);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });
});

describe("Farbe", () => {
  it("normalisiert Hex-Farben", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("ffc629")).toBe("#FFC629");
    expect(normalizeHex(" #0f0f0e ")).toBe("#0F0F0E");
    expect(normalizeHex("rot")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
  it("misst den Kontrast nach WCAG", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("wählt Ink auf hellem und Papier auf dunklem Grund", () => {
    expect(textColorFor("#FFFFFF")).toBe(INK);
    expect(textColorFor("#FFC629")).toBe(INK);
    expect(textColorFor("#111A28")).toBe(PAPER);
    expect(textColorFor("#0F0F0E")).toBe(PAPER);
    expect(contrastRatio(textColorFor("#808080"), "#808080")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Bilddatei", () => {
  it("lässt PNG, JPG und WebP bis 15 MB zu", () => {
    for (const type of IMAGE_LIMITS.types) expect(imageFileProblem({ type, size: 1000 })).toBeNull();
    expect(imageFileProblem({ type: "image/png", size: IMAGE_LIMITS.bytes })).toBeNull();
  });
  it("lehnt andere Arten und zu grosse Dateien ab", () => {
    expect(imageFileProblem({ type: "image/svg+xml", size: 10 })).toMatch(/PNG, JPG oder WebP/);
    expect(imageFileProblem({ type: "application/pdf", size: 10 })).not.toBeNull();
    expect(imageFileProblem({ type: "image/jpeg", size: IMAGE_LIMITS.bytes + 1 })).toMatch(/15 MB/);
  });
  it("erkennt die PNG-Signatur", () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true);
    expect(isPng(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
  });
});
