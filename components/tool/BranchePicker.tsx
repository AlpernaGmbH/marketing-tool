"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRANCHEN_LISTE, brancheHinweis, brancheOf } from "@/lib/branchen";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Alle Branchen als Knöpfe zeigen (Profilseite). In Werkzeugen genügt das Feld mit den Vorschlägen. */
  chips?: boolean;
};

/** Vorschläge beim Tippen: die Namen der Liste und ihre Beispiele, jedes Wort einmal. */
const SUGGESTIONS = [...new Set(BRANCHEN_LISTE.filter((b) => b.key !== "andere").flatMap((b) => [b.label, ...b.beispiele]))];

/**
 * Branche des Firmenprofils: ein Textfeld mit Vorschlägen aus der gemeinsamen Branchenliste (lib/branchen.ts). Die Bezeichnung bleibt so
 * genau, wie der Besucher sie schreibt («Malerei»); darunter steht, zu welcher Branche der Liste sie gehört (so ordnen alle Werkzeuge sie zu).
 */
export function BranchePicker({ id, label, value, onChange, chips = false }: Props) {
  const hint = brancheHinweis(value);
  const active = brancheOf(value)?.key;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} list={`${id}-vorschlaege`} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hinweis`} />
      <datalist id={`${id}-vorschlaege`}>
        {SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <p id={`${id}-hinweis`} className="min-h-5 text-sm text-muted-foreground" data-testid="branche-hinweis">
        {hint ? `Gehört in den Werkzeugen zu: ${hint}` : value.trim() ? "Passt zu keiner Branche der Liste. Die Werkzeuge rechnen dann allgemein." : "Tippe oder wähle eine Branche."}
      </p>
      {chips && (
        <div role="group" aria-label="Branche wählen" className="flex flex-wrap gap-2">
          {BRANCHEN_LISTE.filter((b) => b.key !== "andere").map((b) => (
            <button
              key={b.key}
              type="button"
              aria-pressed={active === b.key}
              onClick={() => onChange(b.label)}
              className="min-h-9 rounded-full border border-input px-3 text-sm aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
