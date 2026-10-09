"use client";

import { RECHTSFORMEN } from "@/lib/profile";

/** Rechtsformen, bei denen die Werkzeuge mit Mitgliedern statt Kundschaft schreiben. */
export const MITGLIEDER_FORMEN: readonly string[] = ["Verein", "Stiftung"];

/** Standard: kein Eintrag. Die Werkzeuge rechnen dann wie für ein KMU. */
const DEFAULT_LABEL = "KMU oder Selbständige";

type Props = {
  idPrefix: string;
  /** Gespeicherte Rechtsform, leer = Standard. */
  value: string;
  /** Wahl des Besuchers: leer = Standard (KMU). */
  onChange: (value: string) => void;
  ready: boolean;
};

/**
 * Rechtsform als Auswahl in einer Reihe (Beschluss vom 09.10.2026: «Rechtsform-Slider», Standard KMU, Verein und Stiftung getrennt).
 * Ein Radiogruppe mit Pillen: per Tastatur mit den Pfeiltasten, am Handy zum Umbrechen. Ohne Wahl gilt der KMU-Wortlaut.
 */
export function RechtsformSlider({ idPrefix, value, onChange, ready }: Props) {
  const options: { value: string; label: string }[] = [{ value: "", label: DEFAULT_LABEL }, ...RECHTSFORMEN.map((r) => ({ value: r, label: r }))];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 font-medium">Rechtsform</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value || "kmu"}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input type="radio" name={`${idPrefix}-rechtsform`} value={o.value} checked={ready && value === o.value} onChange={() => onChange(o.value)} className="size-5 accent-ink" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
