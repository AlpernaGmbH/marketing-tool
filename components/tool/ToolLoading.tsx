"use client";

import { useEffect, useState } from "react";

// Ladeanzeige für Werkzeuge mit KI oder Abruf (Beschluss vom 09.10.2026): Statt eines gesperrten Formulars sieht der Besucher
// nur noch diese Anzeige, mit Schritten und Balken. Die ToolShell blendet das Werkzeug dafür aus (startLoading), seine Eingaben
// bleiben erhalten. Der Balken zeigt keine echte Prozentzahl, weil der Anbieter keine Fortschrittsmeldung liefert: Er nähert sich
// 92 % an und erreicht 100 %, wenn das Ergebnis da ist und die Anzeige verschwindet.

export const DEFAULT_LOADING_STEPS = ["Angaben prüfen", "Entwurf schreiben", "Entwurf kontrollieren"];

/** Obergrenze, der sich der Balken nähert. */
const CEILING = 92;

/** Fortschritt in Prozent nach `elapsedMs`, bei einer erwarteten Dauer von `expectedSeconds` (Richtwert, kein Versprechen). */
export function loadingProgress(elapsedMs: number, expectedSeconds: number): number {
  const t = Math.max(0, elapsedMs) / 1000;
  return CEILING * (1 - Math.exp(-t / (Math.max(1, expectedSeconds) * 0.55)));
}

/** Welcher von `count` Schritten gilt bei diesem Fortschritt? Der letzte bleibt stehen, bis das Ergebnis da ist. */
export function loadingStep(progress: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.floor((progress / CEILING) * count));
}

type Props = {
  steps?: string[];
  /** Erwartete Dauer in Sekunden; bestimmt nur, wie schnell der Balken läuft. */
  expectedSeconds?: number;
};

export function ToolLoading({ steps = DEFAULT_LOADING_STEPS, expectedSeconds = 16 }: Props) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, []);

  const progress = loadingProgress(elapsed, expectedSeconds);
  const active = loadingStep(progress, steps.length);

  return (
    <div className="grid gap-5 rounded-xl border border-line bg-paper p-6 md:p-8" data-testid="tool-loading">
      <p className="eyebrow">Einen Moment</p>
      <p role="status" aria-live="polite" className="font-heading text-2xl font-medium leading-tight md:text-3xl">
        {steps[active]} …
      </p>
      <div
        role="progressbar"
        aria-label="Fortschritt"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-ink transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
      <ol aria-hidden="true" className="grid gap-2 text-sm">
        {steps.map((label, i) => (
          <li key={label} className={i < active ? "flex items-center gap-3 text-muted-foreground" : i === active ? "flex items-center gap-3 font-medium" : "flex items-center gap-3 text-muted-foreground/70"}>
            <span
              className={i < active ? "grid size-5 place-items-center rounded-full bg-ink text-[0.7rem] text-paper" : i === active ? "size-5 rounded-full border-2 border-ink bg-yellow" : "size-5 rounded-full border border-line-strong"}
            >
              {i < active ? "✓" : ""}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">Das dauert meist unter einer halben Minute. Deine Eingaben bleiben erhalten.</p>
    </div>
  );
}
