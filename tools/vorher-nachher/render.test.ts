// @vitest-environment jsdom
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INK, PAPER, coverCrop, isPng } from "@/lib/export/png";
import { callsOf, createFakeContext, fakeImage } from "./fake-canvas";
import { DEFAULT_SETTINGS, FORMATE, layoutFor, type Settings } from "./logic";
import { buildZip, drawCollage, drawPreview, renderFormat, renderPng } from "./render";

const feed = { width: 1080, height: 1080 };
const vorher = fakeImage("vorher", 4000, 3000);
const nachher = fakeImage("nachher", 3000, 4000);
const logo = fakeImage("logo", 600, 200);
const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, beschriftung: "ohne", ...patch });

type DrawArgs = [{ tag: string }, number, number, number, number, number, number, number, number];
const draws = (calls: ReturnType<typeof createFakeContext>["calls"]) => callsOf(calls, "drawImage").map((c) => c.args as unknown as DrawArgs);

afterEach(() => vi.restoreAllMocks());

describe("drawCollage: Nebeneinander und Untereinander", () => {
  it("füllt zuerst die Fläche mit Papier und zeichnet beide Bilder mit coverCrop in ihre Hälften", () => {
    const { ctx, calls, props } = createFakeContext();
    drawCollage(ctx, settings(), feed, vorher, nachher, null);
    expect(callsOf(calls, "fillRect")[0].args).toEqual([0, 0, 1080, 1080]);
    expect(calls.find((c) => c.name === "set:fillStyle")!.args[0]).toBe(PAPER);
    const [a, b] = draws(calls);
    const sa = coverCrop(4000, 3000, 537, 1080);
    const sb = coverCrop(3000, 4000, 537, 1080);
    expect(a[0].tag).toBe("vorher");
    expect(a.slice(1)).toEqual([sa.x, sa.y, sa.w, sa.h, 0, 0, 537, 1080]);
    expect(b[0].tag).toBe("nachher");
    expect(b.slice(1)).toEqual([sb.x, sb.y, sb.w, sb.h, 543, 0, 537, 1080]);
    expect(draws(calls)).toHaveLength(2);
    expect(props.imageSmoothingQuality).toBe("high");
  });
  it("legt den Zuschnitt (Zoom und Verschiebung) der Bilder zugrunde", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ zuschnitt: { vorher: { zoom: 2, x: 50, y: 0 }, nachher: { zoom: 1, x: -100, y: 0 } } }), feed, vorher, nachher, null);
    const [a, b] = draws(calls);
    const sa = coverCrop(4000, 3000, 537, 1080, 2, 0.5, 0);
    const sb = coverCrop(3000, 4000, 537, 1080, 1, -1, 0);
    expect(a.slice(1, 5)).toEqual([sa.x, sa.y, sa.w, sa.h]);
    expect(b.slice(1, 5)).toEqual([sb.x, sb.y, sb.w, sb.h]);
  });
  it("zeichnet untereinander oben das Vorher- und unten das Nachher-Bild", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ layout: "unter" }), { width: 1080, height: 1920 }, vorher, nachher, null);
    const [a, b] = draws(calls);
    expect(a.slice(5)).toEqual([0, 0, 1080, 957]);
    expect(b.slice(5)).toEqual([0, 963, 1080, 957]);
  });
  it("zeichnet weder Linie noch Griff", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings(), feed, vorher, nachher, null);
    expect(callsOf(calls, "arc")).toHaveLength(0);
    expect(callsOf(calls, "fillRect")).toHaveLength(1);
  });
});

describe("drawCollage: Schieber", () => {
  it("zeichnet erst das Nachher-Bild, clippt dann auf die Linie und zeichnet darin das Vorher-Bild", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ layout: "schieber", position: 30 }), feed, vorher, nachher, null);
    const [first, second] = draws(calls);
    expect(first[0].tag).toBe("nachher");
    expect(second[0].tag).toBe("vorher");
    expect(first.slice(5)).toEqual([0, 0, 1080, 1080]);
    expect(second.slice(5)).toEqual([0, 0, 1080, 1080]);
    // Der Clip auf 0 bis zur Linie (324 px) liegt zwischen den beiden Bildern
    const idx = (name: string, pred: (args: unknown[]) => boolean = () => true) => calls.findIndex((c) => c.name === name && pred(c.args));
    const nachherAt = idx("drawImage", (a) => (a[0] as { tag: string }).tag === "nachher");
    const clipRect = idx("rect", (a) => a[0] === 0 && a[2] === 324);
    const clipAt = calls.findIndex((c, i) => c.name === "clip" && i > clipRect);
    const vorherAt = idx("drawImage", (a) => (a[0] as { tag: string }).tag === "vorher");
    expect(clipRect).toBeGreaterThan(nachherAt);
    expect(clipAt).toBeGreaterThan(clipRect);
    expect(vorherAt).toBeGreaterThan(clipAt);
    expect(calls.slice(vorherAt).some((c) => c.name === "restore")).toBe(true);
  });
  it("zeichnet die Linie 4 px breit in Papier und den Griff mit zwei Pfeilen", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ layout: "schieber", position: 50 }), feed, vorher, nachher, null);
    const lines = callsOf(calls, "fillRect").filter((c) => c.args[2] === 4);
    expect(lines).toHaveLength(1);
    expect(lines[0].args).toEqual([538, 0, 4, 1080]);
    const arc = callsOf(calls, "arc");
    expect(arc).toHaveLength(1);
    expect(arc[0].args.slice(0, 3)).toEqual([540, 540, 43.2]);
    expect(callsOf(calls, "closePath").length).toBeGreaterThanOrEqual(2); // zwei Pfeile
    expect(callsOf(calls, "lineTo").length).toBeGreaterThanOrEqual(4);
  });
});

describe("drawCollage: Beschriftung und Logo", () => {
  it("zeichnet zwei Pillen mit Ink- beziehungsweise Papierfläche und passendem Text", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ beschriftung: "standard" }), feed, vorher, nachher, null);
    const texts = callsOf(calls, "fillText");
    expect(texts.map((c) => c.args[0])).toEqual(["Vorher", "Nachher"]);
    const fills = calls.filter((c) => c.name === "set:fillStyle").map((c) => c.args[0]);
    // Vorher: Ink-Fläche, Papier-Text; Nachher: Papier-Fläche, Ink-Text
    const iInk = fills.indexOf(INK);
    expect(fills.slice(iInk, iInk + 2)).toEqual([INK, PAPER]);
    expect(fills.lastIndexOf(INK)).toBeGreaterThan(iInk);
    expect(callsOf(calls, "arcTo").length).toBe(8);
  });
  it("setzt die Pille dorthin, wo layoutFor sie hinlegt (mit der Textbreite des Kontexts)", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ beschriftung: "eigene", worte: { erstes: "Alt", zweites: "Neu" } }), feed, vorher, nachher, null);
    const l = layoutFor("neben", 1080, 1080, 50, { texte: ["Alt", "Neu"], breite: (t, px) => t.length * px * 0.5 });
    const p = l.pillen[0];
    expect(callsOf(calls, "fillText")[0].args).toEqual(["Alt", p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h / 2]);
  });
  it("lässt die Pillen bei «Ohne» weg", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ beschriftung: "ohne" }), feed, vorher, nachher, null);
    expect(callsOf(calls, "fillText")).toHaveLength(0);
  });
  it("zeichnet das Logo ganz (contain) auf eine halbtransparente Platte, nach den Bildern", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ ecke: "ur", logoGroesse: 20 }), feed, vorher, nachher, logo);
    const all = draws(calls);
    expect(all).toHaveLength(3);
    const last = all[2];
    expect(last[0].tag).toBe("logo");
    expect(last.slice(1, 5)).toEqual([0, 0, 600, 200]);
    const [, , , , , x, y, w, h] = last;
    expect(w / h).toBeCloseTo(3);
    expect(w).toBeCloseTo(0.2 * 1080);
    expect(x + w).toBeLessThan(1080 - 0.03 * 1080);
    expect(y + h).toBeLessThan(1080 - 0.03 * 1080);
    expect(calls.some((c) => c.name === "set:fillStyle" && String(c.args[0]).startsWith("rgba(255, 253, 248"))).toBe(true);
  });
  it("lässt das Logo weg, wenn keines gewählt ist", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings(), feed, vorher, nachher, null);
    expect(draws(calls).every((d) => d[0].tag !== "logo")).toBe(true);
  });
});

describe("drawCollage: fehlende Bilder (Vorschau)", () => {
  it("zeichnet graue Flächen mit Hinweis statt Bildern", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings(), feed, null, null, null);
    expect(draws(calls)).toHaveLength(0);
    expect(callsOf(calls, "fillText").map((c) => c.args[0])).toEqual(["Vorher-Bild wählen", "Nachher-Bild wählen"]);
    expect(callsOf(calls, "fillRect")).toHaveLength(3); // Papier und zwei Flächen
  });
  it("zeichnet nur das fehlende Bild als Fläche", () => {
    const { ctx, calls } = createFakeContext();
    drawCollage(ctx, settings({ layout: "schieber" }), feed, vorher, null, null);
    expect(draws(calls)).toHaveLength(1);
    expect(callsOf(calls, "fillText").map((c) => c.args[0])).toEqual(["Nachher-Bild wählen"]);
  });
});

describe("drawPreview und Dateien", () => {
  it("skaliert den Kontext auf die Vorschaugrösse und behält das Seitenverhältnis", () => {
    const { ctx, calls } = createFakeContext();
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx as never);
    drawPreview(canvas, settings(), "story", vorher, nachher, null, 540);
    expect([canvas.width, canvas.height]).toEqual([540, 960]);
    expect(callsOf(calls, "scale")[0].args).toEqual([0.5, 0.5]);
    expect(callsOf(calls, "clearRect")[0].args).toEqual([0, 0, 540, 960]);
    drawPreview(canvas, settings(), "feed", null, null, null, 5000);
    expect([canvas.width, canvas.height]).toEqual([1080, 1080]); // nie grösser als das Format
  });
  it("tut nichts, wenn der Browser kein Canvas liefert", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(() => drawPreview(canvas, settings(), "feed", vorher, nachher, null)).not.toThrow();
  });
  it("rendert jedes Format in voller Grösse und liefert PNG-Bytes", async () => {
    const sizes: [number, number][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height]);
      return createFakeContext().ctx as never;
    });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob([png], { type: "image/png" })));
    // jsdom kennt Blob.arrayBuffer je nach Version nicht
    if (!Blob.prototype.arrayBuffer) Object.defineProperty(Blob.prototype, "arrayBuffer", { value: function (this: Blob) { return new Response(this).arrayBuffer(); }, configurable: true });
    for (const f of FORMATE) {
      const bytes = await renderPng(settings(), f.key, vorher, nachher, null);
      expect(isPng(bytes)).toBe(true);
    }
    expect(sizes).toEqual(FORMATE.map((f) => [f.width, f.height]));
  });
  it("wirft eine verständliche Meldung, wenn kein Canvas zu bekommen ist", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(renderFormat(settings(), "feed", vorher, nachher, null)).rejects.toThrow("Das Bild konnte nicht erzeugt werden.");
  });
  it("packt die PNG-Dateien in ein ZIP", async () => {
    const bytes = await buildZip([
      { name: "malerei-keller-feed.png", bytes: new Uint8Array([1, 2, 3]) },
      { name: "malerei-keller-story.png", bytes: new Uint8Array([4, 5]) },
    ]);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(["malerei-keller-feed.png", "malerei-keller-story.png"]);
    expect(Array.from(await zip.file("malerei-keller-story.png")!.async("uint8array"))).toEqual([4, 5]);
  });
});
