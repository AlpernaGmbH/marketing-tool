import { cn } from "cn";
import { scoreBand } from "@/lib/score";

export { scoreBand };

type Props = {
  score: number;
  max?: number;
  /** Beschriftung neben der Zahl, z. B. «Digitaler Auftritt» */
  label?: string;
  className?: string;
};

export function ScoreBadge({ score, max = 100, label, className }: Props) {
  const safeMax = max > 0 ? max : 100;
  const value = Number.isFinite(score) ? Math.min(Math.max(score, 0), safeMax) : 0;
  const ratio = value / safeMax;
  const band = scoreBand(ratio);
  const rounded = Math.round(value);

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-4xl font-bold leading-none">{rounded}</span>
        <span className="text-muted-foreground">von {safeMax}</span>
        <span className="ml-auto rounded-full border border-ink px-3 py-0.5 text-sm font-medium">{band.text}</span>
      </div>
      {label && <div className="text-sm text-muted-foreground">{label}</div>}
      <div
        role="meter"
        aria-label={label ?? "Punktzahl"}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={rounded}
        aria-valuetext={`${rounded} von ${safeMax}, ${band.text}`}
        className="h-3 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={cn("h-full", band.key === "hoch" ? "bg-ink" : band.key === "mittel" ? "bg-brand" : "bg-yellow")}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
