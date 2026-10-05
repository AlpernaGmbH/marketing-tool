import { describe, expect, it } from "vitest";
import { IMAGE_FORMATS, imageFormat, type LoadedImage } from "@/lib/export/png";
import { modelOf, type OfferInput } from "./logic";
import { drawOffer } from "./render";

// Fake-Kontext: merkt sich, was gezeichnet wird. Breite einer Zeile = 0,5 em je Zeichen.
class FakeCtx {
  font = "10px sans-serif";
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  textAlign = "left";
  textBaseline = "alphabetic";
  imageSmoothingEnabled = false;
  imageSmoothingQuality = "low";
  texts: { text: string; x: number; y: number; size: number; align: string; width: number; fill: string }[] = [];
  rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  points: [number, number][] = [];
  arcs: { x: number; y: number; r: number }[] = [];
  strokes = 0;
  fills = 0;
  images: unknown[][] = [];
  saves = 0;
  restores = 0;
  save() {
    this.saves++;
  }
  restore() {
    this.restores++;
  }
  beginPath() {}
  closePath() {}
  fill() {
    this.fills++;
  }
  stroke() {
    this.strokes++;
  }
  moveTo(x: number, y: number) {
    this.points.push([x, y]);
  }
  lineTo(x: number, y: number) {
    this.points.push([x, y]);
  }
  arc(x: number, y: number, r: number) {
    this.arcs.push({ x, y, r });
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, fill: this.fillStyle });
  }
  size(): number {
    return Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
  }
  measureText(s: string) {
    return { width: s.length * this.size() * 0.5 };
  }
  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, x, y, size: this.size(), align: this.textAlign, width: text.length * this.size() * 0.5, fill: this.fillStyle });
  }
  drawImage(...args: unknown[]) {
    this.images.push(args);
  }
}

const base: OfferInput = {
  firma: "Malerei Keller",
  titel: "Herbstaktion",
  angebot: "Fassadenanstrich inklusive Gerüst",
  preis: "1200",
  frueher: "1500",
  gueltigBis: "2026-11-30",
  aufforderung: "Termin vereinbaren",
  kontakt: "malerei-keller.ch",
  vorlage: "ruhig",
  farbe: "marine",
  hex: "",
  formate: ["feed"],
  logo: false,
};

const run = (input: OfferInput, formatKey: "feed" | "portrait" | "story" | "gbp" = "feed", logo: LoadedImage | null = null) => {
  const ctx = new FakeCtx();
  const f = imageFormat(formatKey);
  const drawn = drawOffer(ctx as unknown as CanvasRenderingContext2D, modelOf(input), f, logo);
  return { ctx, drawn, f };
};

const logoOf = (width: number, height: number): LoadedImage => ({ source: {} as CanvasImageSource, width, height, close() {} });

describe("angebotsgrafik: drawOffer mit Fake-Kontext", () => {
  it("zeichnet Titel, Preis in der Schreibweise von chf(), Aufforderung und Kontaktzeile", () => {
    const { ctx } = run(base);
    const text = ctx.texts.map((t) => t.text);
    expect(text).toContain("Herbstaktion");
    expect(text).toContain("CHF 1'200.-");
    expect(text).toContain("CHF 1'500.-");
    expect(text).toContain("Termin vereinbaren");
    expect(text).toContain("Gültig bis 30.11.2026");
    expect(text).toContain("malerei-keller.ch");
    expect(text).toContain("Malerei Keller");
    expect(text.join(" ")).toContain("Fassadenanstrich");
  });
  it("streicht den früheren Preis durch und lässt den Preis stehen", () => {
    const { ctx } = run(base);
    const alt = ctx.texts.find((t) => t.text === "CHF 1'500.-")!;
    const strike = ctx.rects.filter((r) => r.y < alt.y && r.y > alt.y - alt.size && r.h < alt.size * 0.2);
    expect(strike.length).toBeGreaterThan(0);
    expect(strike[0].w).toBeCloseTo(alt.width, 5);
    const price = ctx.texts.find((t) => t.text === "CHF 1'200.-")!;
    expect(price.size).toBeGreaterThan(alt.size);
  });
  it("lässt weg, was fehlt", () => {
    const { ctx } = run({ ...base, preis: "", frueher: "", gueltigBis: "", kontakt: "" });
    const text = ctx.texts.map((t) => t.text).join("|");
    expect(text).not.toContain("CHF");
    expect(text).not.toContain("Gültig");
    expect(text).not.toContain("malerei-keller.ch");
    expect(text).toContain("Herbstaktion");
    expect(text).toContain("Termin vereinbaren");
  });
  it("schreibt bei Preis 0 «Gratis» und einen früheren Preis nur, wenn er grösser ist", () => {
    expect(run({ ...base, preis: "0", frueher: "" }).ctx.texts.map((t) => t.text)).toContain("Gratis");
    expect(run({ ...base, preis: "100", frueher: "80" }).ctx.texts.map((t) => t.text)).not.toContain("CHF 80.-");
  });
  it("zeichnet nichts ausserhalb des Bildes, in jeder Vorlage und jedem Format, auch mit den längsten Angaben und Logo", () => {
    const longest: OfferInput = {
      ...base,
      titel: "Herbstaktion Fassade und Fenster Spezial",
      angebot: "Fassadenanstrich inklusive Gerüst, Reinigung aller Fenster und Entsorgung der Farbreste ZH",
      preis: "999999.95",
      frueher: "1000000",
      aufforderung: "Gratis Besichtigung vor Ort vereinbaren.",
      kontakt: "malerei-keller.ch, Tel. 071 123 45 67, 9200 Gossau",
    };
    for (const vorlage of ["ruhig", "kraeftig", "handwerk"] as const) {
      for (const f of IMAGE_FORMATS) {
        for (const [i, input] of [base, longest, { ...longest, farbe: "gold" as const }].entries()) {
          for (const logo of [null, logoOf(400, 160), logoOf(100, 400)]) {
            const name = `${vorlage} ${f.key} #${i} ${logo ? `${logo.width}x${logo.height}` : "ohne Logo"}`;
            const { ctx } = run({ ...input, vorlage, logo: logo !== null }, f.key, logo);
            for (const t of ctx.texts) {
              const left = t.align === "left" ? t.x : t.align === "center" ? t.x - t.width / 2 : t.x - t.width;
              expect(left, `${name} «${t.text}» links`).toBeGreaterThanOrEqual(0);
              expect(left + t.width, `${name} «${t.text}» rechts`).toBeLessThanOrEqual(f.width);
              expect(t.y, `${name} «${t.text}» y`).toBeGreaterThan(0);
              expect(t.y, `${name} «${t.text}» y`).toBeLessThan(f.height);
            }
            for (const r of ctx.rects) {
              expect(r.x, name).toBeGreaterThanOrEqual(0);
              expect(r.y, name).toBeGreaterThanOrEqual(0);
              expect(r.x + r.w, name).toBeLessThanOrEqual(f.width);
              expect(r.y + r.h, name).toBeLessThanOrEqual(f.height);
            }
            for (const [x, y] of ctx.points) {
              expect(x, name).toBeGreaterThanOrEqual(0);
              expect(x, name).toBeLessThanOrEqual(f.width);
              expect(y, name).toBeGreaterThanOrEqual(0);
              expect(y, name).toBeLessThanOrEqual(f.height);
            }
            for (const a of ctx.arcs) {
              expect(a.x - a.r, name).toBeGreaterThanOrEqual(0);
              expect(a.x + a.r, name).toBeLessThanOrEqual(f.width);
              expect(a.y - a.r, name).toBeGreaterThanOrEqual(0);
              expect(a.y + a.r, name).toBeLessThanOrEqual(f.height);
            }
            expect(ctx.saves, name).toBe(ctx.restores);
          }
        }
      }
    }
  });
  it("hält bei der Story Text oberhalb und unterhalb von 250 Pixeln frei", () => {
    for (const vorlage of ["ruhig", "kraeftig", "handwerk"] as const) {
      const { ctx } = run({ ...base, vorlage }, "story");
      for (const t of ctx.texts) {
        expect(t.y - t.size, `${vorlage} «${t.text}»`).toBeGreaterThanOrEqual(250);
        expect(t.y, `${vorlage} «${t.text}»`).toBeLessThanOrEqual(1920 - 250);
      }
    }
  });
  it("füllt den Grund mit der Farbe bei Kräftig und mit Papier bei Ruhig und Handwerk", () => {
    expect(run({ ...base, vorlage: "kraeftig" }).ctx.rects[0]).toMatchObject({ x: 0, y: 0, w: 1080, h: 1080, fill: "#111A28" });
    expect(run({ ...base, vorlage: "ruhig" }).ctx.rects[0]).toMatchObject({ w: 1080, h: 1080, fill: "#FFFDF8" });
    expect(run({ ...base, vorlage: "handwerk" }).ctx.arcs.length).toBeGreaterThan(0);
    expect(run({ ...base, vorlage: "handwerk" }).ctx.strokes).toBe(1);
  });
  it("nimmt auf Gold Tinte als Textfarbe und auf Marine Papier", () => {
    const gold = run({ ...base, vorlage: "kraeftig", farbe: "gold" }).ctx.texts.find((t) => t.text === "Herbstaktion")!;
    const marine = run({ ...base, vorlage: "kraeftig", farbe: "marine" }).ctx.texts.find((t) => t.text === "Herbstaktion")!;
    expect(gold.fill).toBe("#0F0F0E");
    expect(marine.fill).toBe("#FFFDF8");
  });
  it("zeichnet das Logo proportional, höchstens 18 % der Breite, statt des Namens", () => {
    const logo = logoOf(400, 160);
    const { ctx, f } = run({ ...base, logo: true }, "feed", logo);
    expect(ctx.images).toHaveLength(1);
    const [source, x, y, w, h] = ctx.images[0] as [unknown, number, number, number, number];
    expect(source).toBe(logo.source);
    expect(w / h).toBeCloseTo(400 / 160, 1);
    expect(w).toBeLessThanOrEqual(f.width * 0.18);
    expect(x).toBeGreaterThanOrEqual(f.width * 0.06);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(ctx.texts.map((t) => t.text)).not.toContain("Malerei Keller");
    expect(run(base).ctx.images).toHaveLength(0);
  });
  it("legt bei Kräftig eine weisse Platte hinter das Logo", () => {
    const { ctx } = run({ ...base, vorlage: "kraeftig", logo: true }, "feed", logoOf(300, 300));
    expect(ctx.fills).toBeGreaterThanOrEqual(2); // Aufforderung und Platte
    expect(run({ ...base, vorlage: "ruhig", logo: true }, "feed", logoOf(300, 300)).ctx.fills).toBe(1); // nur die Aufforderung
  });
  it("kürzt ein sehr langes Wort, statt über den Rand zu laufen", () => {
    const { ctx, f } = run({ ...base, titel: "Herbstaktionsfassadenanstrichspezialangebot" });
    const titel = ctx.texts.find((t) => t.text.startsWith("Herbstaktion"))!;
    expect(titel.width).toBeLessThanOrEqual(f.width);
    expect(titel.text.endsWith("…")).toBe(true);
  });
  it("gibt die gezeichneten Zeilen zurück", () => {
    const { drawn, ctx } = run(base);
    expect(drawn.map((d) => d.text)).toEqual(expect.arrayContaining(["Herbstaktion", "CHF 1'200.-"]));
    expect(drawn.length).toBe(ctx.texts.length);
  });
});
