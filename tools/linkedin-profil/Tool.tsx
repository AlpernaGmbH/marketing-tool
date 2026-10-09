"use client";

import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isKiDown } from "@/lib/generate-client";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { linkedinGenerator } from "./generator";
import {
  EMPTY_STATE,
  HEADLINE_RICHTWERT,
  KI_AUSFALL,
  KI_HINWEIS,
  LIMITS,
  RICHTWERT_HINWEIS,
  SAMPLE,
  SECTION_INFO,
  SECTION_KI,
  SLUG,
  documentParts,
  eingabeText,
  kiInput,
  outputOf,
  parseState,
  reportMarkdown,
  toDocument,
  validate,
  vorbefuellt,
  zielgruppeVorschlag,
  type LinkedinState,
} from "./logic";
import config from "./tool.config";

/** Was die Person getippt hat. `null`: noch nicht angefasst, dann gelten die gespeicherten Angaben und der Vorschlag aus dem Profil. */
type Form = Pick<LinkedinState, "headline" | "about" | "zielgruppe">;

const formOf = (s: LinkedinState): Form => ({ headline: s.headline, about: s.about, zielgruppe: s.zielgruppe });

/** Schritte der Ladeansicht: Das Werkzeug liest die Texte, schreibt Vorschläge und kontrolliert sie (Zahlen, Angaben, Floskeln). */
const LOADING_STEPS = ["Texte lesen", "Vorschläge schreiben", "Vorschläge kontrollieren"];

/** Ein Versuch, die Vorschläge zu holen. `keep`: Es gibt schon ein Ergebnis, das ein Ausfall der KI nicht ersetzen soll. */
type Attempt = { state: LinkedinState; keep: boolean };

const clip = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const fmt = (n: number) => n.toLocaleString("en-US").replace(/,/g, "'");

function Intro() {
  return (
    <>
      <p>
        Füge die Headline und den Info-Text aus deinem LinkedIn-Profil ein. Das Werkzeug prüft beide nach zehn festen Regeln und rechnet einen Punktwert von 0 bis
        100. Eine KI schlägt dazu drei Headlines und einen neuen Anfang für den Info-Text vor.
      </p>
      <p>
        Das Werkzeug liest dein Profil nicht, weil LinkedIn das nicht zulässt. Bild, Banner und Aktivität gehen darum nicht in den Punktwert ein. {RICHTWERT_HINWEIS}
      </p>
    </>
  );
}

function KiSection({ state }: { state: LinkedinState }) {
  const ki = state.ki;
  return (
    <section className="grid gap-3" aria-label={SECTION_KI} data-testid="lp-ki">
      <h4 className="font-heading text-lg font-medium">{SECTION_KI}</h4>
      {ki ? (
        <>
          <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
            {KI_HINWEIS}
          </p>
          <ol aria-label="Headline-Vorschläge" className="grid gap-3">
            {ki.headlines.map((h, i) => (
              <li key={i} className="grid gap-2 rounded-xl border border-line bg-surface p-4" data-testid={`lp-headline-${i + 1}`}>
                <p className="break-words">{h.text}</p>
                <p className="text-sm text-muted-foreground">{h.grund}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <CopyButton text={h.text} label={`Vorschlag ${i + 1} kopieren`} />
                  <span className="mono text-xs text-muted-foreground">{h.text.length} Zeichen</span>
                </div>
              </li>
            ))}
          </ol>
          <h5 className="font-heading font-medium">{SECTION_INFO}</h5>
          <div className="grid gap-2 rounded-xl border border-line bg-surface p-4" data-testid="lp-info">
            <p className="whitespace-pre-line break-words">{ki.infoAnfang}</p>
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton text={ki.infoAnfang} label="Neuen Anfang kopieren" />
              <span className="mono text-xs text-muted-foreground">{ki.infoAnfang.length} Zeichen</span>
            </div>
          </div>
        </>
      ) : (
        <p role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="ki-ausfall">
          {state.kiAusfall ? KI_AUSFALL : "Zu diesem Stand gibt es keine Vorschläge der KI."}
        </p>
      )}
    </section>
  );
}

function LinkedinFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  const attemptRef = useRef<Attempt | null>(null);
  const gen = useGenerator(linkedinGenerator, {
    eingabe: (i) => eingabeText({ firma: i.betrieb, branche: i.branche, zielgruppe: i.zielgruppe, headline: i.headline, about: i.about }),
    // Das Dokument fürs CRM braucht den Punktwert; die Texte stehen in der Eingabe, die der Versuch festhält.
    ausgabe: (o) => (attemptRef.current ? reportMarkdown({ ...attemptRef.current.state, ki: o, kiAusfall: false }) : ""),
    loadingSteps: LOADING_STEPS,
  });

  // Der Entwurf lebt in den Feldern, der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const handled = useRef<Attempt | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<"result" | "edit" | null>(null);
  const savedRef = useRef(saved);

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  const busy = gen.busy;
  const form: Form = draft ?? formOf(vorbefuellt(saved, profile));
  const vorschlag = zielgruppeVorschlag(profile.primaersegment);

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => set({ ...savedRef.current, ...draft, phase: "edit", output: undefined }), 400);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Ladeansicht weg ist.
  useEffect(() => {
    if (busy) return;
    if (shouldFocus.current === "result" && saved.phase === "result") headingRef.current?.focus();
    if (shouldFocus.current === "edit" && saved.phase === "edit") editRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase, busy]);

  // Ist die KI nicht erreichbar, erscheint trotzdem das Ergebnis aus den festen Regeln, und es geht einmal ins CRM. Ein vorhandenes
  // Ergebnis bleibt (`keep`), wenn nur das Neuschreiben der Vorschläge scheitert.
  const kiDown = isKiDown(gen.error);
  useEffect(() => {
    if (busy || !attempt || !kiDown || handled.current === attempt) return;
    handled.current = attempt;
    if (attempt.keep) return;
    const next: LinkedinState = { ...attempt.state, phase: "result", ki: null, kiAusfall: true, output: outputOf(attempt.state.headline, attempt.state.about) };
    shouldFocus.current = "result";
    set(next);
    setDraft(null);
    void ctx.sendResult({ eingabe: eingabeText(next), ausgabe: reportMarkdown(next) });
  }, [busy, attempt, kiDown, set, ctx]);

  const change = (patch: Partial<Form>) => {
    setDraft({ ...form, ...patch });
    setError(null);
  };

  async function run(state: LinkedinState, keep: boolean) {
    setError(null);
    gen.clearError();
    const next: Attempt = { state, keep };
    attemptRef.current = next;
    handled.current = null;
    setAttempt(next);
    // generate() macht Fenster, Anfrage, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const ki = await gen.generate(kiInput(state));
    if (!ki) return;
    shouldFocus.current = "result";
    set({ ...state, phase: "result", ki, kiAusfall: false, output: outputOf(state.headline, state.about) });
    setDraft(null);
  }

  async function start() {
    const problem = validate(form);
    if (problem) return setError(problem);
    const state: LinkedinState = {
      ...EMPTY_STATE,
      ...form,
      phase: "result",
      firma: clip(profile.firma, LIMITS.betrieb),
      branche: clip(profile.branche, LIMITS.branche),
    };
    await run(state, false);
  }

  const regenerate = () => {
    if (saved.phase === "result") void run(saved, true);
  };

  const edit = () => {
    shouldFocus.current = "edit";
    setError(null);
    gen.clearError();
    set({ ...saved, phase: "edit", output: undefined });
  };

  const restart = () => {
    shouldFocus.current = "edit";
    setError(null);
    gen.clearError();
    setDraft(null);
    set(EMPTY_STATE);
  };

  if (ready && saved.phase === "result") {
    const doc = toDocument(saved);
    const teile = documentParts(saved);
    const cardError = attempt?.keep ? gen.error : null;
    return (
      <>
        <ResultCard
          title="Dein LinkedIn-Profil-Score"
          headingRef={headingRef}
          actions={
            <>
              <DocumentExport model={doc} />
              <Button type="button" variant="outline" disabled={busy} onClick={regenerate}>
                {busy ? "Die KI schreibt …" : "Vorschläge neu schreiben"}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={edit}>
                Angaben ändern
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={restart}>
                Neu beginnen
              </Button>
            </>
          }
        >
          <DocView blocks={teile.vor} />
          <KiSection state={saved} />
          <DocView blocks={teile.nach} />
          <p id="lp-ergebnis-error" role="alert" className="min-h-6 text-destructive">
            {cardError}
          </p>
        </ResultCard>
        <p role="status" aria-live="polite" className="sr-only">
          {busy ? "Die KI schreibt neue Vorschläge." : ""}
        </p>
      </>
    );
  }

  const aus = vorschlag !== "" && form.zielgruppe === vorschlag;
  const disabled = !ready || !profileReady || busy;
  const shownError = error ?? (kiDown ? null : gen.error);

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={disabled}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={disabled}>
        <legend className="px-2 font-heading font-semibold">
          <span ref={editRef} tabIndex={-1} className="outline-none">
            Dein Betrieb
          </span>
        </legend>
        <ProfileFieldsForm idPrefix="lp" fields={["firma", "branche"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">Firma und Branche speichern wir in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-4" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Deine Texte</legend>
        <p className="text-sm text-muted-foreground">
          Kopiere sie aus deinem LinkedIn-Profil. Mindestens einer der beiden Texte genügt, beide sind besser.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="lp-headline">Deine Headline</Label>
          <Input
            id="lp-headline"
            value={form.headline}
            maxLength={LIMITS.headline}
            onChange={(e) => change({ headline: e.target.value })}
            aria-describedby="lp-headline-help"
            autoComplete="off"
            lang="de-CH"
          />
          <p id="lp-headline-help" className="mono text-sm text-muted-foreground">
            {form.headline.trim().length} Zeichen, Richtwert {HEADLINE_RICHTWERT}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lp-about">Dein Info-Text</Label>
          <Textarea
            id="lp-about"
            rows={8}
            value={form.about}
            maxLength={LIMITS.about}
            onChange={(e) => change({ about: e.target.value })}
            aria-describedby="lp-about-help"
            lang="de-CH"
          />
          <p id="lp-about-help" className="mono text-sm text-muted-foreground">
            {fmt(form.about.length)} von {fmt(LIMITS.about)} Zeichen
          </p>
        </div>
        <div className="grid gap-1.5 md:max-w-md">
          <Label htmlFor="lp-zielgruppe">Für wen arbeitest du? (freiwillig)</Label>
          <Input
            id="lp-zielgruppe"
            value={form.zielgruppe}
            maxLength={LIMITS.zielgruppe}
            onChange={(e) => change({ zielgruppe: e.target.value })}
            aria-describedby="lp-zielgruppe-help"
            autoComplete="off"
            lang="de-CH"
          />
          <p id="lp-zielgruppe-help" className="text-sm text-muted-foreground">
            {aus ? "Aus deinem Firmenprofil übernommen. " : ""}Bis {LIMITS.zielgruppe} Zeichen, zum Beispiel «Familien in Gossau». Die KI nutzt sie für die Vorschläge.
          </p>
        </div>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Dafür gehen die beiden Texte, der Name deines Betriebs, die Branche und die Zielgruppe an unseren Server und von dort an unseren KI-Anbieter, nicht deine
        E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und das Ergebnis gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei
        Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
      </p>

      <p id="lp-error" role="alert" className="min-h-6 text-destructive">
        {shownError}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={disabled}>
          {busy ? "Die KI schreibt …" : "Profil prüfen"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setDraft({ ...SAMPLE });
            setError(null);
          }}
        >
          Beispiel einfügen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? "Die KI schreibt deine Vorschläge." : ""}
      </p>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <LinkedinFlow />
    </ToolShell>
  );
}
