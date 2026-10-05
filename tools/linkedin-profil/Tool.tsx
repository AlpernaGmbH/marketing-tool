"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  EMPTY_STATE,
  FRAGEN,
  HEADLINE_RICHTWERT,
  LIMITS,
  RICHTWERT_HINWEIS,
  SAMPLE,
  SECTION_HEADLINES,
  SLUG,
  STUFEN_HINWEIS,
  URL_LABEL,
  auswerten,
  documentParts,
  eingabeText,
  offeneFragen,
  outputOf,
  parseState,
  reportMarkdown,
  toDocument,
  validate,
  vorbefuellt,
  zielgruppeVorschlag,
  type Auswertung,
  type FrageId,
  type LinkedinState,
  type Punkte,
} from "./logic";
import config from "./tool.config";

type Form = Pick<LinkedinState, "antworten" | "urlAngepasst" | "headline" | "about" | "zielgruppe" | "ergebnis" | "beweis">;

const formOf = (s: LinkedinState): Form => ({
  antworten: s.antworten,
  urlAngepasst: s.urlAngepasst,
  headline: s.headline,
  about: s.about,
  zielgruppe: s.zielgruppe,
  ergebnis: s.ergebnis,
  beweis: s.beweis,
});

const choice =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input px-4 py-3 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";

const BEISPIELE = {
  kmu: { zielgruppe: "Familien in Gossau", ergebnis: "Fassadenanstrich und Farbberatung", beweis: "Referenzen in Gossau, Flawil und Herisau" },
  verein: { zielgruppe: "Familien in Trogen", ergebnis: "Einstieg in den Fussball", beweis: "Training für alle Altersstufen" },
} as const;

const clip = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const fmt = (n: number) => n.toLocaleString("en-US").replace(/,/g, "'");

function Intro() {
  return (
    <>
      <p>
        Acht Fragen zu deinem LinkedIn-Profil, dazu auf Wunsch deine Headline und der Anfang deines Info-Texts. Du bekommst einen Punktwert von 0 bis 100, die
        wichtigsten Verbesserungen und drei Headline-Vorschläge zum Kopieren.
      </p>
      <p>
        Das Werkzeug liest dein Profil nicht, weil LinkedIn das nicht zulässt. Der Punktwert ist darum eine Selbsteinschätzung und nur so genau wie deine
        Antworten. {RICHTWERT_HINWEIS}
      </p>
      <p>
        Die Auswertung läuft in deinem Browser. Dein Ergebnis geht zusammen mit deinen Antworten, den eingefügten Texten und deiner E-Mail-Adresse an Alperna,
        damit wir dir bei Fragen weiterhelfen können. Bei Vereinen steht Kundschaft für Mitglieder, Publikum und Sponsoren.
      </p>
    </>
  );
}

function Score({ a, firma }: { a: Auswertung; firma: string }) {
  return (
    <div className="grid gap-2" data-testid="lp-score">
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-4xl font-bold leading-none">{a.score}</span>
        <span className="text-muted-foreground">von 100</span>
        <span className="ml-auto rounded-full border border-ink px-3 py-0.5 text-sm font-medium">{a.stufe}</span>
      </div>
      {firma && <div className="text-sm text-muted-foreground">{firma}</div>}
      <div
        role="meter"
        aria-label="LinkedIn-Profil-Score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={a.score}
        aria-valuetext={`${a.score} von 100, Stufe ${a.stufe}`}
        className="h-3 w-full overflow-hidden rounded-full bg-line"
      >
        <div className="h-full bg-ink" style={{ width: `${a.score}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">{STUFEN_HINWEIS}</p>
    </div>
  );
}

function Headlines({ a }: { a: Auswertung }) {
  return (
    <div className="grid gap-3" data-testid="lp-headlines">
      <h4 className="font-heading text-lg font-medium">{SECTION_HEADLINES}</h4>
      {a.vorschlaege.length > 0 ? (
        <ol aria-label={SECTION_HEADLINES} className="grid gap-3">
          {a.vorschlaege.map((v, i) => (
            <li key={v.muster} className="grid gap-2 rounded-xl border border-line bg-surface p-4">
              <p className="break-words">{v.text}</p>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton text={v.text} label={`Vorschlag ${i + 1} kopieren`} />
                <span className="mono text-xs text-muted-foreground">
                  {v.zeichen} Zeichen{v.gekuerzt ? ", gekürzt" : ""}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>{a.headlineHinweis} Wähle «Angaben ändern» und trag es nach, dann entstehen drei Vorschläge.</p>
      )}
    </div>
  );
}

function ResultView({
  state,
  onEdit,
  onNew,
  headingRef,
}: {
  state: LinkedinState;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const a = auswerten(state);
  const doc = toDocument(state);
  const teile = documentParts(state);
  return (
    <ResultCard
      title="Dein LinkedIn-Profil-Score"
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
      <Score a={a} firma={state.firma} />
      {/* Der erste Block des Dokuments (Steckbrief mit Punktwert) steht oben schon als Anzeige. */}
      <DocView blocks={teile.vor.slice(1)} />
      <Headlines a={a} />
      <DocView blocks={teile.nach} />
    </ResultCard>
  );
}

function LinkedinFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // Der Entwurf lebt in den Feldern, der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<"result" | "edit" | null>(null);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  const form: Form = draft ?? formOf(vorbefuellt(saved, profile));
  const typ = profile.organisationstyp === "verein" ? "verein" : "kmu";
  const vorschlag = zielgruppeVorschlag(profile.primaersegment);

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => set({ ...savedRef.current, ...draft, phase: "edit", output: undefined }), 400);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "result" && saved.phase === "result") headingRef.current?.focus();
    if (shouldFocus.current === "edit" && saved.phase === "edit") editRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const change = (patch: Partial<Form>) => {
    setDraft({ ...form, ...patch });
    setError(null);
  };
  const answer = (id: FrageId, punkte: Punkte) => change({ antworten: { ...form.antworten, [id]: punkte } });

  async function start() {
    const problem = validate(form);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const next: LinkedinState = {
        v: 1,
        phase: "result",
        ...form,
        firma: clip(profile.firma, LIMITS.firma),
        branche: clip(profile.branche, LIMITS.branche),
        output: outputOf(form.antworten),
      };
      shouldFocus.current = "result";
      set(next);
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(next), ausgabe: reportMarkdown(next) });
    } finally {
      setBusy(false);
    }
  }

  if (ready && saved.phase === "result") {
    return (
      <ResultView
        state={saved}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "edit";
          set({ ...saved, phase: "edit", output: undefined });
        }}
        onNew={() => {
          shouldFocus.current = "edit";
          setError(null);
          setDraft(null);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const offen = offeneFragen(form.antworten).length;
  const beantwortet = FRAGEN.length - offen;
  const bsp = BEISPIELE[typ];
  const aus = vorschlag !== "" && form.zielgruppe === vorschlag;
  const positionierung = clip(profile.positionierung, 240);
  const disabled = !ready || !profileReady;

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

      <fieldset className="grid gap-5" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Acht Fragen zu deinem Profil</legend>
        <p className="text-sm text-muted-foreground">Öffne dein LinkedIn-Profil in einem zweiten Fenster und antworte so, wie es heute aussieht.</p>
        {FRAGEN.map((f, nr) => (
          <fieldset key={f.id} className="grid gap-2">
            <legend className="mb-1 font-medium">
              <span className="mb-0.5 block text-sm font-normal text-muted-foreground">Frage {nr + 1} von {FRAGEN.length}</span>
              {f.text}
            </legend>
            <div className="grid gap-2">
              {[...f.antworten].reverse().map((a) => (
                <label key={a.punkte} className={choice}>
                  <input
                    type="radio"
                    name={`lp-${f.id}`}
                    value={a.punkte}
                    checked={form.antworten[f.id] === a.punkte}
                    onChange={() => answer(f.id, a.punkte)}
                    className="mt-0.5 size-5 shrink-0 accent-ink"
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className={choice}>
          <input
            id="lp-url"
            type="checkbox"
            checked={form.urlAngepasst}
            onChange={(e) => change({ urlAngepasst: e.target.checked })}
            className="mt-0.5 size-5 shrink-0 accent-ink"
          />
          <span>
            {URL_LABEL}
            <span className="block text-sm text-muted-foreground">Zusatzfrage ohne Gewicht: Sie ändert den Punktwert nicht, ergänzt aber die Verbesserungen.</span>
          </span>
        </label>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground" data-testid="lp-fortschritt">
          {beantwortet} von {FRAGEN.length} Fragen beantwortet.
        </p>
      </fieldset>

      <fieldset className="grid gap-4" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Deine Texte (freiwillig)</legend>
        <p className="text-sm text-muted-foreground">
          Füge sie aus deinem Profil ein, dann prüft das Werkzeug sie nach festen Regeln. Die Funde ändern den Punktwert nicht.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="lp-headline">Deine Headline (freiwillig)</Label>
          <Input
            id="lp-headline"
            value={form.headline}
            maxLength={LIMITS.headline}
            onChange={(e) => change({ headline: e.target.value })}
            aria-describedby="lp-headline-help"
            lang="de-CH"
          />
          <p id="lp-headline-help" className="mono text-sm text-muted-foreground">
            {form.headline.trim().length} Zeichen, Richtwert {HEADLINE_RICHTWERT}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lp-about">Anfang deines Info-Texts (freiwillig)</Label>
          <Textarea
            id="lp-about"
            rows={5}
            value={form.about}
            maxLength={LIMITS.about}
            onChange={(e) => change({ about: e.target.value })}
            aria-describedby="lp-about-help"
            lang="de-CH"
          />
          <p id="lp-about-help" className="mono text-sm text-muted-foreground">
            {fmt(form.about.length)} von {fmt(LIMITS.about)} Zeichen. Die ersten Sätze genügen.
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Headline-Vorschläge (freiwillig)</legend>
        <p className="text-sm text-muted-foreground">
          Aus Zielgruppe, Ergebnis und Beleg entstehen drei Vorschläge. Das Werkzeug setzt nur deine Wörter ein und beugt keines: Schreib sie so, dass
          «Ich helfe …» und «für …» passen.
        </p>
        {positionierung && (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="lp-positionierung">
            Deine Positionierung aus dem Firmenprofil: «{positionierung}» Die Headline darf sie aufgreifen.{" "}
            <Link href="/profil" className="underline underline-offset-4">
              Im Profil ändern
            </Link>
          </p>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="lp-zielgruppe">Für wen arbeitest du?</Label>
          <Input
            id="lp-zielgruppe"
            value={form.zielgruppe}
            maxLength={LIMITS.zielgruppe}
            onChange={(e) => change({ zielgruppe: e.target.value })}
            placeholder={bsp.zielgruppe}
            aria-describedby="lp-zielgruppe-help"
            lang="de-CH"
          />
          <p id="lp-zielgruppe-help" className="text-sm text-muted-foreground">
            {aus ? "Aus deinem Firmenprofil übernommen. " : ""}Bis {LIMITS.zielgruppe} Zeichen, zum Beispiel «{bsp.zielgruppe}».
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lp-ergebnis">Was erreichen deine Kundinnen und Kunden?</Label>
          <Input
            id="lp-ergebnis"
            value={form.ergebnis}
            maxLength={LIMITS.ergebnis}
            onChange={(e) => change({ ergebnis: e.target.value })}
            placeholder={bsp.ergebnis}
            aria-describedby="lp-ergebnis-help"
            lang="de-CH"
          />
          <p id="lp-ergebnis-help" className="text-sm text-muted-foreground">
            Ein kurzer Ausdruck ohne Artikel, der nach «bei» passt. Bis {LIMITS.ergebnis} Zeichen, zum Beispiel «{bsp.ergebnis}».
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lp-beweis">Was belegt es? (Zahl, Ort, Referenz; freiwillig)</Label>
          <Input
            id="lp-beweis"
            value={form.beweis}
            maxLength={LIMITS.beweis}
            onChange={(e) => change({ beweis: e.target.value })}
            placeholder={bsp.beweis}
            aria-describedby="lp-beweis-help"
            lang="de-CH"
          />
          <p id="lp-beweis-help" className="text-sm text-muted-foreground">
            Nur, was du belegen kannst. Bis {LIMITS.beweis} Zeichen, zum Beispiel «{bsp.beweis}».
          </p>
        </div>
      </fieldset>

      <p id="lp-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={disabled || busy}>
          Profil auswerten
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
        <span className="text-sm text-muted-foreground">Dauert etwa fünf Minuten.</span>
      </div>
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
