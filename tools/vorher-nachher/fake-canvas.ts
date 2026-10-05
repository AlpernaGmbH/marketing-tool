// Nur für Tests: ein Canvas-Kontext, der jeden Aufruf und jede Zuweisung aufzeichnet. jsdom hat kein Canvas.
// Die Textbreite ist 0,5 Schriftgrössen je Zeichen, damit Rechnungen mit der Pillen-Breite nachvollziehbar bleiben.

export type Call = { name: string; args: unknown[] };

const METHODS = [
  "save",
  "restore",
  "beginPath",
  "closePath",
  "rect",
  "clip",
  "fillRect",
  "clearRect",
  "drawImage",
  "fill",
  "stroke",
  "moveTo",
  "lineTo",
  "arcTo",
  "arc",
  "fillText",
  "scale",
  "setTransform",
] as const;

export function createFakeContext() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = { font: "10px sans-serif" };
  const sizeOf = () => {
    const m = /(\d+(?:\.\d+)?)px/.exec(String(props.font));
    return m ? Number(m[1]) : 10;
  };
  const target: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * sizeOf() * 0.5 }),
  };
  for (const name of METHODS) target[name] = (...args: unknown[]) => void calls.push({ name, args });
  const ctx = new Proxy(target, {
    get: (t, p: string) => (p in t ? t[p] : props[p]),
    set: (_t, p: string, v) => {
      props[p] = v;
      calls.push({ name: `set:${p}`, args: [v] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, props };
}

export const callsOf = (calls: Call[], name: string) => calls.filter((c) => c.name === name);

/** Ein Bild wie von loadImageFile: die Quelle ist eine Marke, damit Tests sehen, welches Bild gezeichnet wurde. */
export function fakeImage(tag: string, width: number, height: number) {
  return { source: { tag } as unknown as CanvasImageSource, width, height, close: () => undefined };
}
