"use client";

import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocalJson } from "@/lib/use-local";
import { requestRewrite } from "./client";
import { FAIL_MESSAGES, MAX_INPUT_CHARS, SAMPLE_TEXT, SLUG, inputProblem, isAnrede, parseUmschreiberState } from "./logic";
import { ANREDEN, STYLES, getStyle, type Anrede } from "./styles";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const MAX_LABEL = MAX_INPUT_CHARS.toLocaleString("en-US").replace(/,/g, "'");

function Intro() {
  return (
    <>
      <p>
        Füge einen Text ein und wähle, was daraus werden soll: ein LinkedIn-Post, eine Instagram-Caption, ein Beitrag für dein Google-Profil, eine Medienmitteilung, ein
        Newsletter oder ein Text für deine Website. Du kannst auch nur die Rechtschreibung korrigieren lassen. Eine KI schreibt den Text im gewählten Stil neu und behält deine
        Fakten.
      </p>
      <p>
        Dein Text geht an unseren Server und von dort an unseren KI-Anbieter; unser Server speichert ihn nicht. Text und Fassung gehen zusammen mit deiner
        E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können. Gib keine vertraulichen Angaben und keine Daten Dritter ein.
      </p>
    </>
  );
}

function StylePicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled: boolean }) {
  const style = getStyle(value);
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">Stil</legend>
      <div className="flex flex-wrap gap-2">
        {STYLES.map((s) => (
          <label
            key={s.id}
            className="cursor-pointer rounded-full border border-line bg-paper px-4 py-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input type="radio" name="tu-style" value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} className="sr-only" />
            {s.label}
          </label>
        ))}
      </div>
      {style && (
        <p id="tu-style-hint" className="text-sm text-muted-foreground">
          {style.hint}
        </p>
      )}
    </fieldset>
  );
}

function RewriteFlow() {
  const ctx = useToolContext();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseUmschreiberState);

  // Der Entwurf lebt im Feld, der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? saved.text;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Änderungen des Besuchers am Ergebnis (Platzhalter ausfüllen). Gelten nur für die Fassung, zu der sie gehören.
  const [edit, setEdit] = useState<{ base: string; value: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    if (draft === null || draft === savedRef.current.text) return;
    const timer = setTimeout(() => set({ ...savedRef.current, text: draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current) headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved.result]);

  const shown = edit && edit.base === saved.result ? edit.value : saved.result;

  async function rewrite(input: string, styleId: string, anrede: Anrede) {
    setBusy(true);
    try {
      let outcome = await requestRewrite({ text: input, styleId, anrede });
      // Der Server kennt keine Adresse (Cookie fehlt): erst das Fenster, dann einmal wiederholen.
      if (!outcome.ok && outcome.reason === "gate" && (await ctx.renewEmail())) outcome = await requestRewrite({ text: input, styleId, anrede });
      if (!outcome.ok) {
        setError(FAIL_MESSAGES[outcome.reason]);
        return;
      }
      const current = savedRef.current;
      shouldFocus.current = true;
      setEdit(null);
      setDraft(null);
      set({ ...current, text: input, result: outcome.text, warnings: outcome.warnings });
      void ctx.sendResult({ eingabe: `Stil: ${getStyle(styleId)?.label ?? styleId}\nAnrede: ${anrede}\n\n${input}`, ausgabe: outcome.text });
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    const problem = inputProblem(text, saved.styleId);
    if (problem) return setError(problem);
    setError(null);
    set({ ...saved, text });
    if (!(await ctx.ensureEmail())) return;
    await rewrite(text, saved.styleId, saved.anrede);
  }

  return (
    <form
      className="grid gap-5"
      noValidate
      aria-busy={busy || !ready}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <StylePicker
        value={saved.styleId}
        disabled={!ready || busy}
        onChange={(id) => {
          setError(null);
          set({ ...saved, styleId: id });
        }}
      />

      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="tu-anrede">Anrede</Label>
        <select
          id="tu-anrede"
          className={selectClass}
          value={saved.anrede}
          disabled={!ready || busy}
          onChange={(e) => {
            if (isAnrede(e.target.value)) set({ ...saved, anrede: e.target.value });
          }}
        >
          {ANREDEN.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tu-text">Dein Text</Label>
        <Textarea
          id="tu-text"
          rows={10}
          maxLength={MAX_INPUT_CHARS}
          value={text}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          aria-describedby="tu-count tu-error"
          aria-invalid={Boolean(error)}
          lang="de-CH"
          spellCheck
          disabled={!ready || busy}
        />
        <p id="tu-count" className="mono text-sm text-muted-foreground">
          {text.length.toLocaleString("en-US").replace(/,/g, "'")} von {MAX_LABEL} Zeichen
        </p>
      </div>

      <p id="tu-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || busy}>
          {busy ? "Die KI schreibt …" : "Umschreiben"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!ready || busy}
          onClick={() => {
            setDraft(SAMPLE_TEXT);
            setError(null);
          }}
        >
          Beispieltext einfügen
        </Button>
        {saved.result && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setEdit(null);
              setDraft("");
              setError(null);
              set({ ...saved, text: "", result: "", warnings: [] });
            }}
          >
            Neuer Text
          </Button>
        )}
      </div>

      <p role="status" className="sr-only">
        {busy ? "Die KI schreibt deinen Text um." : ""}
      </p>

      {saved.result && (
        <ResultCard
          title={`Deine Fassung: ${getStyle(saved.styleId)?.label ?? "Ergebnis"}`}
          headingRef={headingRef}
          actions={<CopyButton text={() => shown} label="Fassung kopieren" variant="default" />}
        >
          <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
            Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.
          </p>
          {saved.warnings.length > 0 && (
            <ul className="grid gap-2" data-testid="warnungen">
              {saved.warnings.map((w) => (
                <li key={w} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2">
            <Label htmlFor="tu-result">Fassung</Label>
            <Textarea
              id="tu-result"
              rows={12}
              value={shown}
              onChange={(e) => setEdit({ base: saved.result, value: e.target.value })}
              lang="de-CH"
              spellCheck
              className="text-base"
            />
            <p className="text-sm text-muted-foreground">Du kannst die Fassung hier ändern, zum Beispiel Platzhalter ausfüllen. Das Kopieren übernimmt deine Änderungen.</p>
          </div>
        </ResultCard>
      )}

    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <RewriteFlow />
    </ToolShell>
  );
}
