"use client";

import { cn } from "cn";
import { numberCH } from "@/lib/ch";

// Auswahl der Bildformate (Charge C10a, 09.10.2026): Jedes Format ist eine Karte mit dem Seitenverhältnis als kleinem Rechteck, dem Namen und
// den Pixelmassen; ein Klick wählt oder entfernt es. Darunter steht, falls nötig, die Vorschau-Wahl als Knöpfe (ein Klick statt eines Menüs).
// Die Kästchen sind echte Checkboxen (Tastatur, Screenreader, Formular), die Karte ist ihr Label.

export type PickerFormat = { key: string; label: string; width: number; height: number; detail?: string };

/** Grösse des Rechtecks in Pixeln: das Seitenverhältnis des Formats, eingepasst in eine Box von `box` Pixeln. */
export function shapeSize(width: number, height: number, box = 44): { width: number; height: number } {
  const scale = box / Math.max(width, height, 1);
  return { width: Math.max(8, Math.round(width * scale)), height: Math.max(8, Math.round(height * scale)) };
}

type CardsProps = {
  formats: readonly PickerFormat[];
  /** Schlüssel der gewählten Formate. */
  selected: readonly string[];
  onToggle: (key: string, on: boolean) => void;
  /** Die Kästchen heissen `<idPrefix>-<key>`. */
  idPrefix: string;
  disabled?: boolean;
  /** Schlüssel des Kästchens, das bei einem Fehler `aria-invalid` trägt (das erste, auf das der Fokus springt). */
  invalidKey?: string;
  describedBy?: string;
  className?: string;
};

export function FormatCards({ formats, selected, onToggle, idPrefix, disabled, invalidKey, describedBy, className }: CardsProps) {
  return (
    <ul aria-label="Formate" className={cn("grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11rem),1fr))]", className)}>
      {formats.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const size = shapeSize(f.width, f.height);
        return (
          <li key={f.key} className="flex">
            <label
              htmlFor={id}
              className={cn(
                "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-paper p-3",
                "has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                id={id}
                type="checkbox"
                className="peer sr-only"
                checked={selected.includes(f.key)}
                disabled={disabled}
                onChange={(e) => onToggle(f.key, e.target.checked)}
                aria-labelledby={`${id}-name`}
                aria-describedby={`${id}-detail${describedBy ? ` ${describedBy}` : ""}`}
                aria-invalid={invalidKey === f.key ? true : undefined}
              />
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center">
                <span className="block rounded-[3px] border-2 border-ink bg-paper peer-checked:bg-ink" style={{ width: size.width, height: size.height }} />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span id={`${id}-name`} className="font-medium">
                  {f.label}
                </span>
                <span id={`${id}-detail`} className="text-sm text-muted-foreground">
                  {f.detail ?? `${numberCH(f.width, 0)} × ${numberCH(f.height, 0)} Pixel`}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

type TabsProps = {
  /** Sichtbare Beschriftung und Name der Gruppe. */
  label: string;
  /** Nur die gewählten Formate; bei weniger als zwei Formaten bleibt die Gruppe leer. */
  formats: readonly { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
};

const TAB =
  "inline-flex min-h-11 items-center rounded-full border border-input px-4 text-sm aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Die Vorschau-Wahl als Knöpfe: ein Klick wechselt das Format. */
export function PreviewTabs({ label, formats, value, onChange, className }: TabsProps) {
  if (formats.length < 2) return null;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {formats.map((f) => (
          <button key={f.key} type="button" aria-pressed={value === f.key} className={TAB} onClick={() => onChange(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
