"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dateCH } from "@/lib/ch";
import { writeLocal } from "@/lib/storage";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  ANREDEN,
  CTAS,
  CTA_KEYS,
  EMPTY_STATE,
  FOLD_NOTE,
  HOOKS,
  HOOK_KEYS,
  LIMITS,
  MAX_ENTWUERFE,
  PLATFORMS,
  PLATFORM_KEYS,
  STORAGE_KEY,
  STRUCTURES,
  STRUCTURE_KEYS,
  TEXTCHECK_KEY,
  TEXTCHECK_PATH,
  addDraft,
  anredeFromProfile,
  ausgabeText,
  captionTexts,
  counterLabel,
  ctaVorschlaege,
  eingabeText,
  fieldLabel,
  foldHint,
  foldInfo,
  hookExample,
  hookFieldId,
  hookText,
  inputProblem,
  newDraft,
  parseState,
  removeDraft,
  resolveAnrede,
  splitAtFold,
  stepProblem,
  switchCta,
  teilFieldId,
  textcheckState,
  type Anrede,
  type CtaKey,
  type Entwurf,
  type Felder,
  type HookKey,
  type Platform,
  type Problem,
  type StructureKey,
} from "./logic";
import config from "./tool.config";

const choice =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input px-4 py-3 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";

const STEP_TITLES = ["Hook", "Hauptteil", "Aufforderung"] as const;
type Step = 1 | 2 | 3;

function Intro() {
  return (
    <>
      <p>
        Wähle eine Hook-Formel, bau den Hauptteil und setz eine Aufforderung dazu. Daraus entsteht deine Caption für Instagram, LinkedIn, Facebook und den
        Google-Beitrag, mit Vorschau an der Faltkante und Zeichenzähler. Eine KI ist nicht im Spiel: Das Werkzeug setzt zusammen, was du schreibst.
      </p>
      <p>
        Die Caption entsteht in deinem Browser. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können. Entwürfe bleiben in deinem Browser.
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
              <span>
                <span className="block">{o.label}</span>
                {o.hint && (
                  <span id={hintId} className="mono block text-sm break-words text-muted-foreground">
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

// ---- Schritte --------------------------------------------------------------------------------------

type StepProps = { form: Felder; anrede: Anrede; edit: (patch: Partial<Felder>) => void; disabled: boolean };

function HookStep({ form, anrede, edit, disabled }: StepProps) {
  const hook = HOOKS[form.formel];
  return (
    <div className="grid gap-5">
      <RadioGroup<HookKey>
        legend="Hook-Formel"
        name="cb-formel"
        intro="Der Hook ist der erste Satz. Er entscheidet, ob jemand weiterliest. Die Muster zeigen, wo deine Angaben hinkommen."
        options={HOOK_KEYS.map((k) => ({ value: k, label: HOOKS[k].label, hint: HOOKS[k].pattern[anrede] }))}
        value={form.formel}
        onChange={(formel) => edit({ formel })}
        disabled={disabled}
      />
      <p className="text-sm text-muted-foreground">{hook.beschreibung}</p>

      <div role="group" aria-label="Felder des Hooks" className="grid gap-4">
        {hook.fields.map((f) => {
          const id = hookFieldId(f.name);
          return (
            <div key={f.name} className="grid gap-1.5">
              <Label htmlFor={id}>{f.name}</Label>
              <Input
                id={id}
                value={form.hook[f.name] ?? ""}
                maxLength={LIMITS.hook}
                placeholder={f.beispiel}
                onChange={(e) => edit({ hook: { ...form.hook, [f.name]: e.target.value } })}
                aria-describedby={`${id}-hint`}
                lang="de-CH"
                disabled={disabled}
              />
              <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                {f.hint}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-1 rounded-lg bg-surface px-4 py-3" data-testid="cb-hook-preview">
        <p className="eyebrow">So klingt dein Hook</p>
        <p className="break-words">{hookText(form.formel, anrede, form.hook)}</p>
        <p className="text-sm break-words text-muted-foreground">Beispiel, Malerei Keller: {hookExample(form.formel, anrede)}</p>
      </div>
    </div>
  );
}

function TeilStep({ form, anrede, edit, disabled }: StepProps) {
  const aufbau = STRUCTURES[form.aufbau];
  return (
    <div className="grid gap-5">
      <RadioGroup<StructureKey>
        legend="Aufbau"
        name="cb-aufbau"
        intro="Der Hauptteil trägt den Inhalt. Wähle, wie er gebaut ist."
        options={STRUCTURE_KEYS.map((k) => ({ value: k, label: STRUCTURES[k].label }))}
        value={form.aufbau}
        onChange={(a) => edit({ aufbau: a })}
        disabled={disabled}
      />
      <p className="text-sm text-muted-foreground">{aufbau.beschreibung}</p>

      <div role="group" aria-label="Felder des Hauptteils" className="grid gap-4">
        {aufbau.fields.map((f) => {
          const id = teilFieldId(f.key);
          return (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={id}>{fieldLabel(f)}</Label>
              <Textarea
                id={id}
                rows={3}
                value={form.teile[f.key] ?? ""}
                maxLength={LIMITS.teil}
                placeholder={f.beispiel}
                onChange={(e) => edit({ teile: { ...form.teile, [f.key]: e.target.value } })}
                aria-describedby={`${id}-hint`}
                lang="de-CH"
                disabled={disabled}
              />
              <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                {f.hint[anrede]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CtaStep({ form, anrede, edit, disabled }: StepProps) {
  const vorschlaege = ctaVorschlaege(form.ziel, anrede);
  const picked = vorschlaege.findIndex((v) => v === form.cta.trim());
  return (
    <div className="grid gap-5">
      <RadioGroup<CtaKey>
        legend="Ziel"
        name="cb-ziel"
        intro="Was soll die Person nach dem Lesen tun?"
        options={CTA_KEYS.map((k) => ({ value: k, label: CTAS[k].label }))}
        value={form.ziel}
        onChange={(ziel) => edit({ ziel, cta: ctaVorschlaege(ziel, anrede)[0] })}
        disabled={disabled}
      />
      <p className="text-sm text-muted-foreground">{CTAS[form.ziel].beschreibung}</p>

      <RadioGroup<string>
        legend="Vorschlag"
        name="cb-vorschlag"
        options={vorschlaege.map((v, i) => ({ value: String(i), label: v }))}
        value={picked >= 0 ? String(picked) : ""}
        onChange={(i) => edit({ cta: vorschlaege[Number(i)] ?? form.cta })}
        disabled={disabled}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="cb-cta">Aufforderung</Label>
        <Textarea
          id="cb-cta"
          rows={3}
          value={form.cta}
          maxLength={LIMITS.cta}
          onChange={(e) => edit({ cta: e.target.value })}
          aria-describedby="cb-cta-hint"
          lang="de-CH"
          disabled={disabled}
        />
        <p id="cb-cta-hint" className="text-sm text-muted-foreground">
          Ändere den Vorschlag, wie es zu deinem Betrieb passt. Eine Adresse oder Nummer setzt du hier selbst ein.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="cb-hashtags">Hashtags (freiwillig)</Label>
        <Textarea
          id="cb-hashtags"
          rows={2}
          value={form.hashtags}
          maxLength={LIMITS.hashtags}
          placeholder="#MalereiKeller #Gossau"
          onChange={(e) => edit({ hashtags: e.target.value })}
          aria-describedby="cb-hashtags-hint"
          disabled={disabled}
        />
        <p id="cb-hashtags-hint" className="text-sm text-muted-foreground">
          Sie kommen nur unter den Instagram-Text, getrennt durch eine Leerzeile. Mit oder ohne # tippen geht beides.
        </p>
      </div>
    </div>
  );
}

// ---- Entwürfe --------------------------------------------------------------------------------------

function Entwuerfe({
  list,
  onLoad,
  onDelete,
  asHeading = false,
}: {
  list: Entwurf[];
  onLoad: (d: Entwurf) => void;
  onDelete: (d: Entwurf) => void;
  /** Im Ergebnis eine Überschrift, im Formular nicht (dort stünde sie direkt unter der H1). */
  asHeading?: boolean;
}) {
  const uid = useId();
  const Title = asHeading ? "h4" : "p";
  return (
    <section aria-label="Deine Entwürfe" className="grid gap-3">
      <Title className="font-heading font-medium">Deine Entwürfe</Title>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch kein Entwurf gespeichert. Es passen bis zu {MAX_ENTWUERFE}; beim nächsten fällt der älteste weg. Entwürfe bleiben in deinem Browser.
        </p>
      ) : (
        <ul aria-label="Gespeicherte Entwürfe" className="grid gap-2">
          {list.map((d) => {
            const titleId = `${uid}-${d.id}`;
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
                <p id={titleId} className="min-w-0 break-words">
                  <span className="block font-medium">{d.titel}</span>
                  <span className="mono block text-sm text-muted-foreground">{dateCH(d.gespeichertAm)}</span>
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => onLoad(d)} aria-describedby={titleId}>
                    Laden
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(d)} aria-describedby={titleId}>
                    Löschen
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---- Ergebnis --------------------------------------------------------------------------------------

function Preview({ platform, text }: { platform: Platform; text: string }) {
  const info = PLATFORMS[platform];
  const { over } = foldInfo(platform, text);
  const { before, after } = splitAtFold(platform, text);
  return (
    <section aria-label={`Vorschau ${info.label}`} className="grid gap-3">
      <div className="rounded-xl border border-line bg-paper p-4" data-testid="cb-preview">
        <p className="eyebrow mb-2">{info.label}</p>
        <p lang="de-CH" className="break-words whitespace-pre-wrap" data-testid="cb-text">
          <span>{before}</span>
          {after && (
            <span className="rounded-sm bg-surface text-muted-foreground" data-testid="cb-over">
              {after}
            </span>
          )}
        </p>
      </div>
      <p className="mono text-sm" data-testid="cb-counter">
        {counterLabel(platform, text)}
      </p>
      <p className="text-sm text-muted-foreground">
        {foldHint(platform, over)} {FOLD_NOTE}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={text} label={info.copyLabel} />
      </div>
    </section>
  );
}

function ResultView({
  felder,
  entwuerfe,
  headingRef,
  onSaveDraft,
  onLoad,
  onDelete,
  onEdit,
  onNew,
}: {
  felder: Felder;
  entwuerfe: Entwurf[];
  headingRef: React.Ref<HTMLHeadingElement>;
  onSaveDraft: () => void;
  onLoad: (d: Entwurf) => void;
  onDelete: (d: Entwurf) => void;
  onEdit: () => void;
  onNew: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [note, setNote] = useState("");
  const texte = useMemo(() => captionTexts(felder), [felder]);

  return (
    <ResultCard
      title="Deine Caption"
      headingRef={headingRef}
      actions={
        <>
          <Button
            type="button"
            onClick={() => {
              onSaveDraft();
              setNote("Entwurf gespeichert.");
            }}
          >
            Als Entwurf speichern
          </Button>
          <Button type="button" variant="outline" onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neu beginnen
          </Button>
          <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {note}
          </span>
        </>
      }
    >
      <div role="group" aria-label="Plattform" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLATFORM_KEYS.map((p) => (
          <Button key={p} type="button" variant={p === platform ? "default" : "outline"} aria-pressed={p === platform} onClick={() => setPlatform(p)}>
            {PLATFORMS[p].label}
          </Button>
        ))}
      </div>

      <Preview platform={platform} text={texte[platform]} />

      <section aria-label="Prüfen" className="grid gap-2">
        <h4 className="font-heading font-medium">Prüfen</h4>
        <p className="text-sm text-muted-foreground">
          Der Textcheck sucht Floskeln, doppelte Wörter und Formfehler. Er übernimmt den Instagram-Text und ersetzt dabei den Text, der dort gespeichert ist.
        </p>
        <div>
          <Link
            href={TEXTCHECK_PATH}
            className={buttonVariants({ variant: "outline" })}
            onClick={() => writeLocal(TEXTCHECK_KEY, JSON.stringify(textcheckState(texte.instagram)))}
          >
            Im Textcheck prüfen
          </Link>
        </div>
      </section>

      <Entwuerfe
        asHeading
        list={entwuerfe}
        onLoad={(d) => {
          setNote("");
          onLoad(d);
        }}
        onDelete={(d) => {
          onDelete(d);
          setNote("Entwurf gelöscht.");
        }}
      />
    </ResultCard>
  );
}

// ---- Ablauf ----------------------------------------------------------------------------------------

function CaptionFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(STORAGE_KEY, parseState);

  // Die Angaben leben im Entwurf; der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<Felder | null>(null);
  const form = draft ?? saved.felder;
  const anrede = resolveAnrede(form.anrede, anredeFromProfile(profile));
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLParagraphElement>(null);
  const shouldFocus = useRef<string | null>(null);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    if (draft === null || JSON.stringify(draft) === JSON.stringify(savedRef.current.felder)) return;
    const timer = setTimeout(() => set({ ...savedRef.current, felder: draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion der Person, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    const target = shouldFocus.current;
    shouldFocus.current = null;
    if (target === "heading") headingRef.current?.focus();
    else if (target === "step") stepRef.current?.focus();
    else if (target?.startsWith("field:")) document.getElementById(target.slice(6))?.focus();
  }, [saved.phase, step]);

  const edit = (patch: Partial<Felder>) => {
    setDraft({ ...form, ...patch });
    setError(null);
  };

  const chooseAnrede = (a: Anrede) => edit({ anrede: a, cta: switchCta(form.ziel, form.cta, anrede, a) });

  function showProblem(problem: Problem) {
    setError(problem.message);
    if (problem.step === step) document.getElementById(problem.fieldId)?.focus();
    else {
      shouldFocus.current = `field:${problem.fieldId}`;
      setStep(problem.step);
    }
  }

  function go(to: Step, commit: Felder) {
    // Beim Weitergehen sofort speichern, damit nach dem Neuladen nichts fehlt.
    setDraft(commit);
    set({ ...savedRef.current, felder: commit });
    shouldFocus.current = "step";
    setError(null);
    setStep(to);
  }

  function next() {
    const problem = stepProblem(step, form);
    if (problem) return showProblem(problem);
    if (step === 2) {
      // Der erste Vorschlag steht schon da, wenn die Person noch nichts geschrieben hat.
      const cta = form.cta.trim() ? form.cta : ctaVorschlaege(form.ziel, anrede)[0];
      return go(3, { ...form, cta });
    }
    go((step + 1) as Step, form);
  }

  function back() {
    go((step - 1) as Step, form);
  }

  async function create() {
    const problem = inputProblem(form);
    if (problem) return showProblem(problem);
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const felder: Felder = { ...form, anrede };
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", felder, entwuerfe: savedRef.current.entwuerfe });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(felder), ausgabe: ausgabeText(captionTexts(felder)) });
    } finally {
      setBusy(false);
    }
  }

  const loadDraft = (d: Entwurf) => {
    // Ein geladener Entwurf ist kein neues Ergebnis: nichts geht ins CRM.
    shouldFocus.current = "heading";
    setDraft(null);
    setError(null);
    set({ v: 1, phase: "result", felder: d.felder, entwuerfe: savedRef.current.entwuerfe });
  };
  const deleteDraft = (d: Entwurf) => set({ ...savedRef.current, entwuerfe: removeDraft(savedRef.current.entwuerfe, d.id) });

  if (ready && saved.phase === "result") {
    return (
      <ResultView
        felder={saved.felder}
        entwuerfe={saved.entwuerfe}
        headingRef={headingRef}
        onSaveDraft={() => set({ ...saved, entwuerfe: addDraft(saved.entwuerfe, newDraft(saved.felder, new Date(), saved.entwuerfe)) })}
        onLoad={loadDraft}
        onDelete={deleteDraft}
        onEdit={() => {
          shouldFocus.current = "step";
          setDraft(null);
          setStep(1);
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "step";
          setDraft(null);
          setError(null);
          setStep(1);
          set({ ...EMPTY_STATE, entwuerfe: saved.entwuerfe });
        }}
      />
    );
  }

  const disabled = !ready || busy;
  const stepProps: StepProps = { form, anrede, edit, disabled };

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-6"
        noValidate
        aria-busy={!ready || !profileReady}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) next();
          else void create();
        }}
      >
        <div className="content">
          <Intro />
        </div>

        <RadioGroup<Anrede>
          legend="Anrede"
          name="cb-anrede"
          intro="Gilt für den Hook und die Vorschläge. Was du selbst schreibst, bleibt, wie du es schreibst."
          options={ANREDEN.map((a) => ({ value: a.value, label: a.label }))}
          value={anrede}
          onChange={chooseAnrede}
          compact
          disabled={disabled}
        />

        <div className="grid gap-3">
          <p role="status" aria-live="polite" className="mono text-sm" data-testid="cb-step">
            Schritt {step} von 3
          </p>
          <div className="grid grid-cols-3 gap-1" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`h-1 rounded-full ${n <= step ? "bg-ink" : "bg-line"}`} />
            ))}
          </div>
          <p ref={stepRef} tabIndex={-1} className="font-heading text-lg font-medium outline-none" data-testid="cb-step-title">
            {STEP_TITLES[step - 1]}
          </p>
        </div>

        {step === 1 && <HookStep {...stepProps} />}
        {step === 2 && <TeilStep {...stepProps} />}
        {step === 3 && <CtaStep {...stepProps} />}

        <p id="cb-error" role="alert" className="min-h-6 text-destructive">
          {error}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {step > 1 && (
            <Button type="button" variant="outline" size="lg" onClick={back} disabled={disabled}>
              Zurück
            </Button>
          )}
          <Button type="submit" size="lg" disabled={disabled}>
            {step < 3 ? "Weiter" : "Caption erstellen"}
          </Button>
          <span className="text-sm text-muted-foreground">Dauert etwa vier Minuten.</span>
        </div>
      </form>

      {saved.entwuerfe.length > 0 && <Entwuerfe list={saved.entwuerfe} onLoad={loadDraft} onDelete={deleteDraft} />}
    </div>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <CaptionFlow />
    </ToolShell>
  );
}
