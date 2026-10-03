"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AnswerValue, Option, Question } from "@/components/tool/questionnaire";

type Props = {
  q: Question;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  /** id des Elements mit Fehlertext und Hilfe, für aria-describedby */
  describedBy?: string;
  invalid?: boolean;
};

const choice =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input px-4 py-3 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";

function OptionList({
  name,
  type,
  options,
  selected,
  onToggle,
  describedBy,
}: {
  name: string;
  type: "radio" | "checkbox";
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  describedBy?: string;
}) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <label key={o.value} className={choice}>
          <input
            type={type}
            name={name}
            value={o.value}
            checked={selected.includes(o.value)}
            onChange={() => onToggle(o.value)}
            aria-describedby={describedBy}
            className="mt-0.5 size-5 shrink-0 accent-ink"
          />
          <span>
            <span className="block">{o.label}</span>
            {o.hint && <span className="block text-sm text-muted-foreground">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Gibt die Eingabe für eine Frage aus. Beschriftung (legend/label) setzt die Engine darüber. */
export function QuestionInput({ q, value, onChange, describedBy, invalid }: Props) {
  switch (q.type) {
    case "single":
      return (
        <OptionList
          name={q.id}
          type="radio"
          options={q.options}
          selected={typeof value === "string" ? [value] : []}
          onToggle={(v) => onChange(v)}
          describedBy={describedBy}
        />
      );

    case "multi": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <OptionList
          name={q.id}
          type="checkbox"
          options={q.options}
          selected={selected}
          onToggle={(v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])}
          describedBy={describedBy}
        />
      );
    }

    case "text":
      return q.multiline ? (
        <Textarea
          id={`q-${q.id}`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          maxLength={q.maxLength ? q.maxLength + 50 : undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      ) : (
        <Input
          id={`q-${q.id}`}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      );

    case "number":
      return (
        <div className="flex items-center gap-3">
          <Input
            id={`q-${q.id}`}
            type="number"
            inputMode="decimal"
            min={q.min}
            max={q.max}
            step={q.step ?? "any"}
            value={typeof value === "number" && Number.isFinite(value) ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className="max-w-48"
          />
          {q.unit && <span className="text-muted-foreground">{q.unit}</span>}
        </div>
      );

    case "scale": {
      const steps = Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i);
      const current = typeof value === "number" ? value : typeof value === "string" ? Number(value) : null;
      return (
        <div>
          <div className="flex flex-wrap gap-2">
            {steps.map((n) => (
              <label key={n} className={`${choice} min-w-11 justify-center px-0`}>
                <input
                  type="radio"
                  name={q.id}
                  value={n}
                  checked={current === n}
                  onChange={() => onChange(n)}
                  aria-describedby={describedBy}
                  className="sr-only"
                />
                <span className="px-4">{n}</span>
              </label>
            ))}
          </div>
          {(q.minLabel || q.maxLabel) && (
            <div className="mt-2 flex justify-between text-sm text-muted-foreground">
              <span>{q.minLabel}</span>
              <span>{q.maxLabel}</span>
            </div>
          )}
        </div>
      );
    }

    case "ranking": {
      const order = Array.isArray(value) && value.length === q.options.length ? value : q.options.map((o) => o.value);
      const move = (i: number, by: -1 | 1) => {
        const next = [...order];
        const j = i + by;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      return (
        <ol className="grid gap-2" aria-describedby={describedBy}>
          {order.map((v, i) => {
            const label = q.options.find((o) => o.value === v)?.label ?? v;
            return (
              <li key={v} className="flex items-center gap-3 rounded-lg border border-input px-4 py-2">
                <span className="w-6 font-heading font-semibold" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="flex-1">{label}</span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`${label} nach oben`}
                  className="size-11 rounded-lg border border-input disabled:opacity-30"
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  aria-label={`${label} nach unten`}
                  className="size-11 rounded-lg border border-input disabled:opacity-30"
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </li>
            );
          })}
        </ol>
      );
    }

    case "matrix": {
      const current = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
      return (
        <div className="grid gap-4">
          {q.rows.map((row) => (
            <fieldset key={row.id} className="grid gap-2">
              <legend className="mb-1 font-medium">{row.label}</legend>
              <div className="flex flex-wrap gap-2">
                {q.columns.map((c) => (
                  <label key={c.value} className={choice}>
                    <input
                      type="radio"
                      name={`${q.id}-${row.id}`}
                      value={c.value}
                      checked={current[row.id] === c.value}
                      onChange={() => onChange({ ...current, [row.id]: c.value })}
                      aria-describedby={describedBy}
                      className="mt-0.5 size-5 shrink-0 accent-ink"
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      );
    }
  }
}
