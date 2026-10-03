// Lage der Stationen in der Pfad-Grafik: gleichmässig verteilt in x, sanfte Welle in y
// (ein Bergpfad, kein Diagramm). Reine Funktion, damit sie sich testen lässt.

export const PATH_VIEW = { width: 640, height: 96, margin: 28 } as const;

export type Point = { x: number; y: number };

export function pathPoints(count: number): Point[] {
  const { width, height, margin } = PATH_VIEW;
  if (count <= 0) return [];
  const mid = height / 2;
  if (count === 1) return [{ x: width / 2, y: mid }];
  const step = (width - 2 * margin) / (count - 1);
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(margin + i * step),
    y: Math.round(mid + 20 * Math.sin(i * 1.25 + 0.6)),
  }));
}

/** Weiche Verbindung zweier Stationen (kubische Kurve mit waagrechten Tangenten). */
export function segmentPath(a: Point, b: Point): string {
  const dx = (b.x - a.x) / 2;
  return `M${a.x} ${a.y}C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
}
