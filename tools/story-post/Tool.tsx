"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { numberCH } from "@/lib/ch";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { foldHint, splitAtFold } from "@/tools/caption-baukasten/logic";
import {
  ANREDEN,
  EMPTY_STATE,
  FELDER,
  FOLD_NOTE,
  HOOK_MAX,
  INSTAGRAM_MAX,
  LESEZEIT_NOTE,
  SAETZE_NOTE,
  STORAGE_KEY,
  anredeFromProfile,
  ausgabeText,
  beispielOf,
  charCount,
  compose,
  counterLabel,
  eingabeText,
  fieldId,
  fieldLabel,
  foldInfo,
  hookLabel,
  parseState,
  readyCount,
  resolveAnrede,
  tidy,
  toDocument,
  validate,
  PFLICHT_KEYS,
  type Anrede,
  type Felder,
  type HookWahl,
  type Problem,
  type Story,
} from "./logic";
import config from "./tool.config";

const choice =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input px-4 py-3 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";

function Intro() {
  return (
    <>
      <p>
        Beantworte sechs Fragen zu einer Geschichte aus deinem Betrieb. Daraus entsteht ein Beitrag im LinkedIn-Format mit zwei Hook-Vorschlägen für die erste
        Zeile, dazu die Lesezeit und eine Instagram-Fassung, die auf die Zeichengrenze gekürzt wird. Eine KI ist nicht im Spiel: {SAETZE_NOTE}
      </p>
      <p>
        Der Beitrag entsteht in deinem Browser. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können. Dein Zwischenstand bleibt in deinem Browser.
      </p>
    </>
  );
}

type Option<T extends string> = { value: T; label: string; hint?: string };

/** Radiogruppe mit Legende. Der Name des Radios ist die Beschriftung, der Hinweis die Beschreibung. */
function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  intro,
  compact = false,
  disabled = false,
}: {
  legend: string;
  name: string;
  options: Option<T>[];
  value: T | "";
  onChange: (value: T) => void;
  intro?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset role="radiogroup" className="grid gap-2" disabled={disabled}>
      <legend className="mb-1 font-heading font-semibold">{legend}</legend>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      <div className={compact ? "flex flex-wrap gap-2" : "grid gap-2"}>
        {options.map((o) => {
          const hintId = `${name}-${o.value}-hint`;
          return (
            <label key={o.value} className={choice}>
              <input
                type="radio"
                name={name}
                id={`${name}-${o.value}`}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                aria-label={o.label}
                aria-describedby={o.hint ? hintId : undefined}
                className="mt-0.5 size-5 shrink-0 accent-ink"
              />
              <span className="min-w-0">
                <span className="block">{o.label}</span>
                {o.hint && (
                  <span id={hintId} className="mono block text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {o.hint}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---- Ergebnis --------------------------------------------------------------------------------------

type Platform = "linkedin" | "instagram";

/** Vorschau einer Plattform: Text mit abgedunkeltem Rest hinter der Faltkante, Zähler, Hinweise, Kopierknopf. */
function Preview({ platform, story }: { platform: Platform; story: Story }) {
  const isLinkedin = platform === "linkedin";
  const label = isLinkedin ? "LinkedIn" : "Instagram";
  const text = isLinkedin ? story.linkedin : story.instagram.text;
  const { over } = foldInfo(platform, text);
  const { before, after } = splitAtFold(platform, text);
  const ig = story.instagram;
  return (
    <section aria-label={`Vorschau ${label}`} className="grid gap-3">
      <div className="rounded-xl border border-line bg-paper p-4">
        <p className="eyebrow mb-2">{label}</p>
        <p lang="de-CH" className="whitespace-pre-wrap [overflow-wrap:anywhere]" data-testid={`sp-${platform}-text`}>
          <span>{before}</span>
          {after && (
            <span className="rounded-sm bg-surface text-muted-foreground" data-testid={`sp-${platform}-over`}>
              {after}
            </span>
          )}
        </p>
      </div>
      <p className="mono text-sm" data-testid={`sp-${platform}-counter`}>
        {counterLabel(platform, text)}
      </p>
      <p className="text-sm text-muted-foreground">
        {foldHint(platform, over)} {FOLD_NOTE}
      </p>
      {isLinkedin ? (
        <p className="text-sm" data-testid="sp-lesezeit">
          Lesezeit: {story.lesezeit.label} ({numberCH(story.lesezeit.woerter, 0)} Wörter; {LESEZEIT_NOTE}).
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Höchstens {numberCH(INSTAGRAM_MAX, 0)} Zeichen (Richtwert von Alperna; die Plattform ändert die Grenze).
          </p>
          {ig.hinweis && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="sp-instagram-hinweis">
              {ig.hinweis}
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={text} label={`${label}-Text kopieren`} />
      </div>
    </section>
  );
}

function ResultView({
  story,
  firma,
  headingRef,
  onHook,
  onEdit,
  onNew,
}: {
  story: Story;
  firma: string | undefined;
  headingRef: React.Ref<HTMLHeadingElement>;
  onHook: (wahl: HookWahl) => void;
  onEdit: () => void;
  onNew: () => void;
}) {
  const doc = useMemo(() => toDocument(story, { firma }), [story, firma]);
  const options: Option<string>[] = [
    ...story.hooks.map((h, i) => ({ value: String(i + 1), label: hookLabel((i + 1) as HookWahl), hint: h })),
    { value: "0", label: hookLabel(0) },
  ];
  return (
    <ResultCard
      title="Dein Beitrag"
      headingRef={headingRef}
      actions={
        <>
          <DocumentExport model={doc} />
          <Button type="button" variant="outline" onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neu beginnen
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground" data-testid="sp-saetze">
        {SAETZE_NOTE} Es schreibt nichts dazu. Nur der Hook setzt Wörter aus deinen Antworten zusammen.
      </p>

      {story.platzhalter.length > 0 && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="sp-platzhalter">
          Noch ausfüllen: {story.platzhalter.map((p) => `[${p}]`).join(", ")}
        </p>
      )}

      <div className="grid gap-2">
        <RadioGroup<string>
          legend="Hook für die erste Zeile"
          name="sp-hook"
          intro={`Ein Hook hat höchstens ${HOOK_MAX} Zeichen und nur Wörter aus deinen Antworten.`}
          options={options}
          value={String(story.hook)}
          onChange={(v) => onHook(Number(v) as HookWahl)}
        />
        {story.hooks.length < 2 && (
          <p className="text-sm text-muted-foreground" data-testid="sp-hook2-fehlt">
            Einen zweiten Hook gibt es hier nicht: Aus Ergebnis und Wendepunkt ergäbe sich kein sinnvoller Satz bis {HOOK_MAX} Zeichen.
          </p>
        )}
      </div>

      <Preview platform="linkedin" story={story} />
      <Preview platform="instagram" story={story} />

      {story.hinweise.length > 0 && (
        <section aria-label="Hinweise" className="grid gap-2">
          <h4 className="font-heading font-medium">Hinweise</h4>
          <ul aria-label="Hinweise zu deinem Text" className="grid list-disc gap-1.5 pl-5 text-sm">
            {story.hinweise.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>
      )}
    </ResultCard>
  );
}

// ---- Ablauf ----------------------------------------------------------------------------------------

type Draft = { anrede: Anrede | ""; felder: Felder };

function StoryFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(STORAGE_KEY, parseState);

  // Die Angaben leben im Entwurf; der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<Draft | null>(null);
  const form: Draft = draft ?? { anrede: saved.anrede, felder: saved.felder };
  const profilAnrede = anredeFromProfile(profile);
  const anrede = resolveAnrede(form.anrede, profilAnrede);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<string | null>(null);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    if (draft === null) return;
    const s = savedRef.current;
    if (draft.anrede === s.anrede && JSON.stringify(draft.felder) === JSON.stringify(s.felder)) return;
    const timer = setTimeout(() => set({ ...savedRef.current, anrede: draft.anrede, felder: draft.felder }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion der Person, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    const target = shouldFocus.current;
    shouldFocus.current = null;
    if (target === "heading") headingRef.current?.focus();
    else if (target?.startsWith("field:")) document.getElementById(target.slice(6))?.focus();
  }, [saved.phase]);

  const editField = (key: keyof Felder, value: string) => {
    setDraft({ ...form, felder: { ...form.felder, [key]: value } });
    setProblems([]);
  };
  const chooseAnrede = (a: Anrede) => setDraft({ ...form, anrede: a });

  async function create() {
    const found = validate(form.felder);
    if (found.length > 0) {
      setProblems(found);
      document.getElementById(found[0].fieldId)?.focus();
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const input = { anrede, felder: form.felder, hook: saved.hook };
      const story = compose(input);
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", anrede, felder: form.felder, hook: saved.hook, output: { linkedin: story.linkedin, instagram: story.instagram.text } });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(input), ausgabe: ausgabeText(story) });
    } finally {
      setBusy(false);
    }
  }

  const resultAnrede = resolveAnrede(saved.anrede, profilAnrede);
  const story = useMemo(
    () => compose({ anrede: resultAnrede, felder: saved.felder, hook: saved.hook }),
    [resultAnrede, saved.felder, saved.hook],
  );

  if (ready && saved.phase === "result") {
    return (
      <ResultView
        story={story}
        firma={profile.firma}
        headingRef={headingRef}
        onHook={(hook) => {
          const next = compose({ anrede: resultAnrede, felder: saved.felder, hook });
          set({ ...saved, hook, output: { linkedin: next.linkedin, instagram: next.instagram.text } });
        }}
        onEdit={() => {
          shouldFocus.current = `field:${fieldId("ausgangslage")}`;
          setDraft(null);
          setProblems([]);
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = `field:${fieldId("ausgangslage")}`;
          setDraft(null);
          setProblems([]);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const disabled = !ready || busy;
  const bereit = readyCount(form.felder);
  const problemKeys = new Set(problems.map((p) => p.key));

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={!ready || !profileReady}
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:max-w-md" disabled={disabled}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="sp" fields={["firma"]} />
        <p className="text-sm text-muted-foreground">Die Firma speichern wir in deinem Firmenprofil, in deinem Browser. Sie steht im Kopf der Datei.</p>
      </fieldset>

      <RadioGroup<Anrede>
        legend="Anrede der Leserinnen und Leser"
        name="sp-anrede"
        intro="Gilt für den Beispieltext beim Bezug zur Leserin und für den Hinweis, wenn dein Text eine andere Anrede benutzt. Was du schreibst, bleibt, wie du es schreibst."
        options={ANREDEN.map((a) => ({ value: a.value, label: a.label }))}
        value={anrede}
        onChange={chooseAnrede}
        compact
        disabled={disabled}
      />

      <fieldset className="grid gap-5" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Deine Geschichte</legend>
        <p role="status" aria-live="polite" className="mono text-sm" data-testid="sp-fortschritt">
          {bereit} von {PFLICHT_KEYS.length} Pflichtfeldern bereit
        </p>
        {FELDER.map((f) => {
          const id = fieldId(f.key);
          const n = charCount(tidy(form.felder[f.key]));
          const beispiel = beispielOf(f, anrede);
          return (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={id}>{fieldLabel(f)}</Label>
              <Textarea
                id={id}
                rows={3}
                value={form.felder[f.key]}
                maxLength={f.max}
                placeholder={beispiel}
                onChange={(e) => editField(f.key, e.target.value)}
                aria-describedby={`${id}-hint ${id}-example ${id}-count`}
                aria-invalid={problemKeys.has(f.key) || undefined}
                lang="de-CH"
              />
              <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                {f.hinweis}
              </p>
              <p id={`${id}-example`} className="text-sm text-muted-foreground [overflow-wrap:anywhere]" data-testid={`${id}-beispiel`}>
                Beispiel, Malerei Keller: «{beispiel}»
              </p>
              <p id={`${id}-count`} className="mono text-sm text-muted-foreground">
                {`${numberCH(n, 0)} Zeichen (${f.pflicht ? "" : "leer oder "}${f.min} bis ${f.max})`}
              </p>
            </div>
          );
        })}
      </fieldset>

      <div id="sp-error" role="alert" className="min-h-6 text-destructive">
        {problems.length > 0 && (
          <ul aria-label="Das fehlt noch" className="grid gap-1">
            {problems.map((p) => (
              <li key={p.key}>{p.message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={disabled}>
          Beitrag zusammenstellen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert etwa sechs Minuten.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <StoryFlow />
    </ToolShell>
  );
}
