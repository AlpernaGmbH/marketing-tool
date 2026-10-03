// Höhenlinien als leises Hintergrundmotiv (der Berg aus der Alperna-Markenstory).
// Reine Dekoration: 4 % Deckkraft, für Hilfstechnologien unsichtbar.

const RINGS = 16;
const POINTS = 120;

function ring(i: number): string {
  const cx = 640 + i * 7;
  const cy = 330 - i * 4;
  const r = 34 + i * 27;
  const seed = i * 0.37;
  const pts: string[] = [];
  for (let k = 0; k <= POINTS; k++) {
    const t = (k / POINTS) * Math.PI * 2;
    const wobble =
      1 + 0.09 * Math.sin(2 * t + seed) + 0.055 * Math.sin(3 * t + seed * 1.7) + 0.03 * Math.sin(5 * t + seed * 0.6);
    const x = cx + r * 1.45 * wobble * Math.cos(t);
    const y = cy + r * wobble * Math.sin(t);
    pts.push(`${k === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${pts.join("")}Z`;
}

const PATHS = Array.from({ length: RINGS }, (_, i) => ring(i));

export function Contours({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1280 640"
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 -z-10 h-full w-full text-ink opacity-[0.04] ${className}`}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        {PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
