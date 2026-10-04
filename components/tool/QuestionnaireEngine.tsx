"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuestionInput } from "@/components/tool/question-inputs";
import {
  EMPTY_STATE,
  defaultAnswer,
  formatAnswer,
  parseState,
  planQuestions,
  validateAnswer,
  validateQuestions,
  type AnswerValue,
  type Answers,
  type Question,
  type SavedState,
} from "@/components/tool/questionnaire";
import { useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { useLocalJson } from "@/lib/use-local";

type Props<R> = {
  /** Slug des Tools; der Zwischenstand liegt unter mt:<slug>. */
  slug: string;
  questions: Question[];
  /** Reine Funktion aus logic.ts: Antworten → Ergebnis. */
  scoreFn: (answers: Answers) => R;
  renderResult: (result: R, answers: Answers) => React.ReactNode;
  intro?: React.ReactNode;
  startLabel?: string;
  /** Antworten aus dem Firmenprofil. Diese Fragen werden nicht gestellt (Harte Regel 10). */
  prefill?: Answers;
  /** Nur bei einem frisch berechneten Ergebnis (nicht beim Wiederherstellen): Profil schreiben. */
  onResult?: (result: R, answers: Answers) => void;
  /** Das Ergebnis als Text für das CRM (Zugang v3). Ohne: JSON. */
  resultText?: (result: R) => string;
};

/**
 * Fragebogen mit Start, Fragen, Zusammenfassung und Ergebnis. Zwischenstand lokal,
 * Ergebnis sofort sichtbar. Vor dem ersten Ergebnis fragt ToolShell.ensureEmail() nach der E-Mail-Adresse (Zugang v3).
 */
export function QuestionnaireEngine<R>({
  slug,
  questions,
  scoreFn,
  renderResult,
  intro,
  startLabel = "Starten",
  prefill,
  onResult,
  resultText,
}: Props<R>) {
  const ctx = useToolContext();
  const { value: state, ready, set, reset } = useLocalJson<SavedState>(`mt:${slug}`, parseState);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Fokus nur nach einer Aktion des Besuchers setzen, nicht beim Wiederherstellen aus dem Speicher.
  const shouldFocus = useRef(false);

  if (process.env.NODE_ENV !== "production") {
    const problems = validateQuestions(questions);
    if (problems.length > 0) console.error(`[${slug}] Fragenkatalog:`, problems.join("; "));
  }

  const plan = useMemo(() => planQuestions(questions, state.answers, prefill), [questions, state.answers, prefill]);
  const { asked } = plan;
  const step = Math.min(state.step, Math.max(asked.length - 1, 0));
  const current = state.phase === "questions" ? asked[step] : undefined;

  // Ergebnis ist rein aus den Antworten berechenbar; beim Wiederherstellen kein erneutes Zählen.
  const restoredResult = useMemo(() => {
    if (state.phase !== "result") return null;
    try {
      return { value: scoreFn(plan.answers) };
    } catch {
      return null;
    }
    // scoreFn kommt aus logic.ts und ist stabil
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, plan.answers]);

  // Fokus auf die neue Überschrift, damit Screenreader und Tastatur mitkommen.
  useEffect(() => {
    if (shouldFocus.current) {
      headingRef.current?.focus();
      shouldFocus.current = false;
    }
  }, [state.phase, step]);

  const patch = useCallback(
    (next: Partial<SavedState>) => {
      shouldFocus.current = true;
      set({ ...state, ...next });
    },
    [set, state],
  );

  const start = () => {
    setError(null);
    setCalcError(null);
    shouldFocus.current = true;
    set({ ...EMPTY_STATE, answers: state.answers, phase: asked.length > 0 ? "questions" : "summary" });
  };

  const setAnswer = (q: Question, value: AnswerValue) => {
    setError(null);
    patch({ answers: { ...state.answers, [q.id]: value } });
  };

  const valueOf = (q: Question): AnswerValue | undefined => state.answers[q.id] ?? defaultAnswer(q) ?? undefined;

  const next = () => {
    if (!current) return;
    const problem = validateAnswer(current, valueOf(current));
    if (problem) return setError(problem);
    setError(null);
    // Ranking-Standardwert wird erst mit «Weiter» zur Antwort.
    const answers = current.type === "ranking" && state.answers[current.id] === undefined
      ? { ...state.answers, [current.id]: valueOf(current) as AnswerValue }
      : state.answers;
    if (step < asked.length - 1) patch({ answers, step: step + 1 });
    else patch({ answers, phase: "summary", step });
  };

  const back = () => {
    setError(null);
    if (state.phase === "summary") return patch({ phase: asked.length > 0 ? "questions" : "intro", step: Math.max(asked.length - 1, 0) });
    if (step > 0) return patch({ step: step - 1 });
    patch({ phase: "intro" });
  };

  const showResult = async () => {
    setCalcError(null);
    // Alles prüfen, falls sich durch showIf etwas geändert hat.
    for (let i = 0; i < asked.length; i++) {
      const q = asked[i];
      const problem = validateAnswer(q, state.answers[q.id] ?? (q.type === "ranking" ? defaultAnswer(q) : undefined));
      if (problem) {
        setError(problem);
        return patch({ phase: "questions", step: i });
      }
    }
    let result: R;
    try {
      result = scoreFn(plan.answers);
    } catch {
      return setCalcError("Das Ergebnis konnte nicht berechnet werden. Bitte prüfe deine Antworten.");
    }
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
    } finally {
      setBusy(false);
    }
    patch({ phase: "result" });
    onResult?.(result, plan.answers);
    void ctx.sendResult({
      eingabe: asked.map((q) => `${q.label}: ${formatAnswer(q, plan.answers[q.id])}`).join("\n"),
      ausgabe: resultText ? resultText(result) : JSON.stringify(result, null, 1),
    });
  };

  const restart = () => {
    setError(null);
    setCalcError(null);
    reset();
  };

  // Vor dem Lesen des lokalen Speichers dieselbe Struktur wie der Start-Bildschirm (Knopf gesperrt).
  // So bleibt der Einleitungstext beim Hydrieren stehen, statt neu aufgebaut zu werden:
  // ein Neuaufbau verschiebt den LCP-Zeitpunkt auf das Ende der Hydration.
  if (!ready) {
    return (
      <div className="grid gap-6" aria-busy="true">
        {intro && <div className="content">{intro}</div>}
        <p className="text-sm text-muted-foreground">
          {asked.length} {asked.length === 1 ? "Frage" : "Fragen"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled>
            {startLabel}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Start -------------------------------------------------------------------------------
  if (state.phase === "intro") {
    const hasProgress = Object.keys(state.answers).length > 0;
    return (
      <div className="grid gap-6">
        {intro && <div className="content">{intro}</div>}
        <p className="text-sm text-muted-foreground">
          {asked.length} {asked.length === 1 ? "Frage" : "Fragen"}
          {plan.fromProfile.length > 0 && `, ${plan.fromProfile.length} aus deinem Firmenprofil übernommen`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={start} disabled={busy}>
            {hasProgress ? "Weitermachen" : startLabel}
          </Button>
          {hasProgress && (
            <Button size="lg" variant="ghost" onClick={restart}>
              Neu beginnen
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ---- Fragen ------------------------------------------------------------------------------
  if (state.phase === "questions" && current) {
    const errorId = `err-${current.id}`;
    const helpId = `help-${current.id}`;
    const describedBy = [current.help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
    const isGroup = current.type !== "text" && current.type !== "number";
    const heading = (
      <>
        <span className="mb-1 block text-sm font-normal text-muted-foreground">
          Frage {step + 1} von {asked.length}
        </span>
        <span>{current.label}</span>
        {!current.required && <span className="ml-2 text-sm font-normal text-muted-foreground">(freiwillig)</span>}
      </>
    );

    return (
      <form
        className="grid gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <div
          role="progressbar"
          aria-label="Fortschritt"
          aria-valuemin={0}
          aria-valuemax={asked.length}
          aria-valuenow={step + 1}
          className="h-2 w-full overflow-hidden rounded-full bg-line"
        >
          <div className="h-full bg-ink" style={{ width: `${((step + 1) / asked.length) * 100}%` }} />
        </div>

        <h3 ref={headingRef} tabIndex={-1} className="outline-none">
          {isGroup ? <span id={`q-${current.id}-legend`}>{heading}</span> : <label htmlFor={`q-${current.id}`}>{heading}</label>}
        </h3>
        {current.help && (
          <p id={helpId} className="-mt-3 text-muted-foreground">
            {current.help}
          </p>
        )}

        {isGroup ? (
          <div role={current.type === "ranking" ? "group" : current.type === "multi" ? "group" : "radiogroup"} aria-labelledby={`q-${current.id}-legend`}>
            <QuestionInput q={current} value={valueOf(current)} onChange={(v) => setAnswer(current, v)} describedBy={describedBy} invalid={!!error} />
          </div>
        ) : (
          <QuestionInput q={current} value={valueOf(current)} onChange={(v) => setAnswer(current, v)} describedBy={describedBy} invalid={!!error} />
        )}

        <p id={errorId} role="alert" className="min-h-6 text-destructive">
          {error}
        </p>

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" size="lg" onClick={back}>
            Zurück
          </Button>
          <Button type="submit" size="lg">
            {step < asked.length - 1 ? "Weiter" : "Zur Zusammenfassung"}
          </Button>
        </div>
      </form>
    );
  }

  // ---- Zusammenfassung -------------------------------------------------------------------
  if (state.phase === "summary" || (state.phase === "questions" && !current)) {
    return (
      <div className="grid gap-6">
        <h3 ref={headingRef} tabIndex={-1} className="outline-none">
          Zusammenfassung
        </h3>
        <dl className="grid gap-4">
          {plan.fromProfile.map((q) => (
            <div key={q.id} className="grid gap-1 border-b border-line pb-4">
              <dt className="text-sm text-muted-foreground">{q.label}</dt>
              <dd>
                {formatAnswer(q, plan.answers[q.id])}{" "}
                <span className="text-sm text-muted-foreground">
                  (aus deinem Firmenprofil,{" "}
                  <Link href="/profil" className="underline underline-offset-4">
                    ändern
                  </Link>
                  )
                </span>
              </dd>
            </div>
          ))}
          {asked.map((q, i) => (
            <div key={q.id} className="grid gap-1 border-b border-line pb-4">
              <dt className="text-sm text-muted-foreground">{q.label}</dt>
              <dd className="flex flex-wrap items-baseline justify-between gap-3">
                <span>{formatAnswer(q, state.answers[q.id] ?? (q.type === "ranking" ? defaultAnswer(q) : undefined))}</span>
                <button
                  type="button"
                  className="text-sm underline underline-offset-4"
                  onClick={() => patch({ phase: "questions", step: i })}
                  aria-label={`Antwort ändern: ${q.label}`}
                >
                  ändern
                </button>
              </dd>
            </div>
          ))}
        </dl>
        {calcError && (
          <p role="alert" className="text-destructive">
            {calcError}
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" size="lg" onClick={back}>
            Zurück
          </Button>
          <Button type="button" size="lg" onClick={showResult}>
            Ergebnis anzeigen
          </Button>
        </div>
      </div>
    );
  }

  // ---- Ergebnis --------------------------------------------------------------------------
  return (
    <div className="grid gap-6">
      <h3 ref={headingRef} tabIndex={-1} className="sr-only outline-none">
        Ergebnis
      </h3>
      {restoredResult ? (
        renderResult(restoredResult.value, plan.answers)
      ) : (
        <p role="alert" className="text-destructive">
          Das Ergebnis konnte nicht berechnet werden. Bitte prüfe deine Antworten.
        </p>
      )}
      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <Button type="button" variant="outline" onClick={() => patch({ phase: "summary" })}>
          Antworten ändern
        </Button>
        <Button type="button" variant="ghost" onClick={restart}>
          Neu starten
        </Button>
      </div>
    </div>
  );
}
