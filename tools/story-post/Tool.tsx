"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { numberCH } from "@/lib/ch";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { foldHint, splitAtFold } from "@/tools/caption-baukasten/logic";
import { KI_HINWEIS, profilTeile } from "@/tools/post-generator/logic";
import { storyGenerator, type StoryInput, type StoryOutput } from "./generator";
import {
  ANREDEN,
  EMPTY_STATE,
  FELDER,
  FOLD_NOTE,
  HOOK_MAX,
  INSTAGRAM_MAX,
  LESEZEIT_NOTE,
  MODI,
  SAETZE_NOTE,
  STORAGE_KEY,
  anredeFromProfile,
  ausgabeText,
  beispielOf,
  beitragFelder,
  charCount,
  compose,
  counterLabel,
  eingabeText,
  fieldId,
  fieldLabel,
  foldInfo,
  hookLabel,
  minOf,
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
  type Modus,
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
        Beantworte sechs Fragen zu einer Geschichte aus deinem Betrieb, Stichworte genügen. Eine KI formuliert daraus Sätze, ohne etwas dazuzuerfinden. Du bekommst
        einen Beitrag im LinkedIn-Format mit zwei Hook-Vorschlägen für die erste Zeile, dazu die Lesezeit und eine Instagram-Fassung, die auf die Zeichengrenze
        gekürzt wird. Wer lieber selbst schreibt, wählt den Weg «Meine Sätze ordnen»: {SAETZE_NOTE}
      </p>
      <p>
        Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können. Dein Zwischenstand
        bleibt in deinem Browser.
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
  modus,
  busy,
  error,
  firma,
  headingRef,
  onHook,
  onRewrite,
  onEdit,
  onNew,
}: {
  story: Story;
  modus: Modus;
  busy: boolean;
  error: string | null;
  firma: string | undefined;
  headingRef: React.Ref<HTMLHeadingElement>;
  onHook: (wahl: HookWahl) => void;
  onRewrite: () => void;
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
          {modus === "ki" && (
            <Button type="button" variant="outline" disabled={busy} onClick={onRewrite}>
              {busy ? "Die KI schreibt …" : "Neu formulieren"}
            </Button>
          )}
          <Button type="button" variant="outline" disabled={busy} onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onNew}>
            Neu beginnen
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {modus === "ki" ? (
        <p className="text-sm text-muted-foreground" data-testid="sp-ki-hinweis">
          {KI_HINWEIS} Die KI formuliert aus deinen Stichworten und erfindet nichts dazu. Nur der Hook setzt Wörter aus deinen Antworten zusammen.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="sp-saetze">
          {SAETZE_NOTE} Es schreibt nichts dazu. Nur der Hook setzt Wörter aus deinen Antworten zusammen.
        </p>
      )}

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

type Draft = { modus: Modus; anrede: Anrede | ""; felder: Felder };

function StoryFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(STORAGE_KEY, parseState);

  // useGenerator hält seine Optionen fest; die Angaben fürs CRM kommen darum über einen Ref.
  const crmRef = useRef<{ modus: Modus; anrede: Anrede; felder: Felder; hook: HookWahl } | null>(null);
  const gen = useGenerator(storyGenerator, {
    eingabe: () => (crmRef.current ? eingabeText(crmRef.current) : ""),
    ausgabe: (o) => (crmRef.current ? ausgabeText(compose({ ...crmRef.current, felder: o })) : ""),
  });

  // Die Angaben leben im Entwurf; der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<Draft | null>(null);
  const form: Draft = draft ?? { modus: saved.modus, anrede: saved.anrede, felder: saved.felder };
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
    if (draft.modus === s.modus && draft.anrede === s.anrede && JSON.stringify(draft.felder) === JSON.stringify(s.felder)) return;
    const timer = setTimeout(() => set({ ...savedRef.current, modus: draft.modus, anrede: draft.anrede, felder: draft.felder }), 500);
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
  const chooseModus = (modus: Modus) => {
    setDraft({ ...form, modus });
    setProblems([]);
    setKiError(null);
  };
  const [kiError, setKiError] = useState<string | null>(null);

  /** Die Eingabe für die KI: Betrieb, Branche, Ort, Anrede, Tonalität und zu vermeidende Wörter aus dem Profil, dazu die sechs Antworten. */
  function kiInput(felder: Felder, a: Anrede): StoryInput {
    const teile = profilTeile(profile);
    return {
      betrieb: (profile.firma ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      branche: (profile.branche ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      ort: (profile.ort ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      anrede: a,
      tonalitaet: teile.tonalitaet,
      vermeiden: teile.vermeiden,
      felder: Object.fromEntries(FELDER.map((f) => [f.key, tidy(felder[f.key] ?? "")])) as Felder,
    };
  }

  /** Schreibt mit der KI und zeigt das Ergebnis. Bei einem Fehler bleibt das Formular (oder das alte Ergebnis) stehen. */
  async function createKi(felder: Felder, a: Anrede) {
    if (!(profile.firma ?? "").trim()) {
      setProblems([]);
      setKiError("Gib den Namen deines Betriebs an.");
      document.getElementById("sp-firma")?.focus();
      return;
    }
    setKiError(null);
    gen.clearError();
    crmRef.current = { modus: "ki", anrede: a, felder, hook: saved.hook };
    const out: StoryOutput | null = await gen.generate(kiInput(felder, a));
    if (!out) return;
    const next = out as Felder;
    const story = compose({ anrede: a, felder: next, hook: saved.hook, modus: "ki" });
    shouldFocus.current = "heading";
    set({ v: 1, phase: "result", modus: "ki", anrede: a, felder, ki: next, hook: saved.hook, output: { linkedin: story.linkedin, instagram: story.instagram.text } });
    setDraft(null);
  }

  async function create() {
    const found = validate(form.felder, form.modus);
    if (found.length > 0) {
      setProblems(found);
      document.getElementById(found[0].fieldId)?.focus();
      return;
    }
    setProblems([]);
    if (form.modus === "ki") return createKi(form.felder, anrede);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const input = { anrede, felder: form.felder, hook: saved.hook, modus: "ordnen" as const };
      const story = compose(input);
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", modus: "ordnen", anrede, felder: form.felder, hook: saved.hook, output: { linkedin: story.linkedin, instagram: story.instagram.text } });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(input), ausgabe: ausgabeText(story) });
    } finally {
      setBusy(false);
    }
  }

  const resultAnrede = resolveAnrede(saved.anrede, profilAnrede);
  const beitrag = beitragFelder(saved);
  const story = useMemo(
    () => compose({ anrede: resultAnrede, felder: beitrag, hook: saved.hook, modus: saved.modus }),
    [resultAnrede, beitrag, saved.hook, saved.modus],
  );

  if (ready && saved.phase === "result") {
    return (
      <ResultView
        story={story}
        modus={saved.modus}
        busy={gen.busy}
        error={kiError ?? gen.error}
        firma={profile.firma}
        headingRef={headingRef}
        onHook={(hook) => {
          const next = compose({ anrede: resultAnrede, felder: beitrag, hook, modus: saved.modus });
          set({ ...saved, hook, output: { linkedin: next.linkedin, instagram: next.instagram.text } });
        }}
        onRewrite={() => void createKi(saved.felder, resultAnrede)}
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
          set({ ...EMPTY_STATE, modus: saved.modus });
        }}
      />
    );
  }

  const kiBusy = gen.busy;
  const disabled = !ready || busy || kiBusy;
  const bereit = readyCount(form.felder, form.modus);
  const teile = profilTeile(profile);
  const profilNamen = [teile.tonalitaet ? "Tonalität" : "", teile.vermeiden.length > 0 ? "zu vermeidende Wörter" : ""].filter(Boolean);
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

      <RadioGroup<Modus>
        legend="Wie soll der Beitrag entstehen?"
        name="sp-modus"
        options={MODI.map((m) =>
          m === "ki"
            ? { value: m, label: "Von der KI formulieren lassen", hint: "Du gibst Stichworte an, die KI macht Sätze daraus und erfindet nichts dazu." }
            : { value: m, label: "Meine Sätze ordnen", hint: "Du schreibst die Sätze selbst, das Werkzeug ordnet und kürzt sie, ohne KI." },
        )}
        value={form.modus}
        onChange={chooseModus}
        disabled={disabled}
      />

      <fieldset className={`grid gap-4 rounded-xl border border-line p-4 ${form.modus === "ki" ? "md:grid-cols-3" : "md:max-w-md"}`} disabled={disabled}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="sp" fields={form.modus === "ki" ? ["firma", "branche", "ort"] : ["firma"]} />
        <p className={`text-sm text-muted-foreground ${form.modus === "ki" ? "md:col-span-3" : ""}`}>
          {form.modus === "ki" ? "Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser." : "Die Firma speichern wir in deinem Firmenprofil, in deinem Browser. Sie steht im Kopf der Datei."}
        </p>
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
        <legend className="mb-1 font-heading font-semibold">{form.modus === "ki" ? "Deine Geschichte in Stichworten" : "Deine Geschichte"}</legend>
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
                {`${numberCH(n, 0)} Zeichen (${f.pflicht ? "" : "leer oder "}${minOf(f, form.modus)} bis ${f.max})`}
              </p>
            </div>
          );
        })}
      </fieldset>

      {form.modus === "ki" && (
        <p className="text-sm text-muted-foreground">
          Dafür gehen Betrieb, Branche, Ort, deine sechs Antworten und die Anrede{profilNamen.length > 0 ? `, dazu ${profilNamen.join(" und ")} aus deinem Profil,` : ""} an unseren
          Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse. Unser Server speichert die Angaben nicht. Gib nichts Vertrauliches ein.
        </p>
      )}

      <div id="sp-error" role="alert" className="min-h-6 text-destructive">
        {kiError ?? gen.error}
        {problems.length > 0 && (
          <ul aria-label="Das fehlt noch" className="grid gap-1">
            {problems.map((p) => (
              <li key={p.key}>{p.message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={disabled || !profileReady}>
          {form.modus === "ki" ? (kiBusy ? "Die KI schreibt …" : "Beitrag schreiben") : "Beitrag zusammenstellen"}
        </Button>
        <span className="text-sm text-muted-foreground">{form.modus === "ki" ? "Dauert meist unter einer Minute." : "Dauert etwa sechs Minuten."}</span>
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
