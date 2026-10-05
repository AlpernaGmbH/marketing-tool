"use client";

import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { numberCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  LIMITS,
  MAX_POSTS,
  NOTE_BRANCHE,
  PLATTFORMEN,
  RICHTWERT,
  RICHTWERT_NOTE,
  SAMPLE,
  SLUG,
  addPost,
  chartSvg,
  csvFilename,
  eingabeText,
  isPlattformKey,
  markedPost,
  newForm,
  parseState,
  plattformOf,
  removePost,
  reportMarkdown,
  setPost,
  summary,
  toCsv,
  toDocument,
  toInput,
  validate,
  type FeldKey,
  type FormState,
  type PostForm,
  type Summary,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro() {
  return (
    <>
      <p>
        Gib die Followerzahl und die Zahlen von bis zu {MAX_POSTS} Beiträgen ein, so wie sie in der Statistik der Plattform stehen. Der Rechner zeigt die
        Interaktionsrate jedes Beitrags und im Schnitt, nach zwei Formeln, mit Balkendiagramm und einer Auswertung in Worten. Alles rechnet in deinem
        Browser, ohne KI.
      </p>
      <p>
        Instagram, LinkedIn, Facebook und TikTok lassen sich nicht auslesen, darum tippst du die Zahlen selbst ab. Verglichen werden nur deine Beiträge
        untereinander: {NOTE_BRANCHE} Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können.
      </p>
    </>
  );
}

/** Diagramm als SVG-Text aus logic.ts. Alle Texte darin sind maskiert, Zahlen endlich. */
function Chart({ s }: { s: Summary }) {
  return (
    <figure className="grid gap-2" data-testid="er-diagramm">
      <div className="rounded-xl border border-line bg-paper p-3" dangerouslySetInnerHTML={{ __html: chartSvg(s) }} />
      <figcaption className="text-sm text-muted-foreground">
        Rate auf Follower je Beitrag. Die gestrichelte Linie ist dein Schnitt
        {markedPost(s) !== null && ", der goldene Balken mit dem Rand ist der beste Beitrag"}. Dieselben Zahlen stehen in der Tabelle darunter.
      </figcaption>
    </figure>
  );
}

type Focus = "heading" | "follower" | "add" | number;

function RateFlow() {
  const ctx = useToolContext();
  const { profile } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // Änderungen am Formular leben im Entwurf; der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<FormState | null>(null);
  const form: FormState = draft ?? { plattform: saved.plattform, follower: saved.follower, posts: saved.posts };
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [csvError, setCsvError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<Focus | null>(null);

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => set({ v: 1, phase: "edit", ...draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion der Person, nicht beim Wiederherstellen aus dem Speicher.
  const phase = saved.phase;
  const rows = form.posts.length;
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === "heading" && phase === "result") headingRef.current?.focus();
    else if (target === "follower" && phase === "edit") document.getElementById("er-follower")?.focus();
    else if (target === "add" && phase === "edit") addRef.current?.focus();
    else if (typeof target === "number" && phase === "edit") document.getElementById(`er-p${target}-name`)?.focus();
    else return;
    pendingFocus.current = null;
  }, [phase, rows]);

  const change = (next: FormState) => {
    setErrors([]);
    setDraft(next);
  };

  const kopf = { firma: profile.firma, verein: profile.organisationstyp === "verein" };

  async function start() {
    const problems = validate(form);
    if (problems.length > 0) return setErrors(problems);
    const input = toInput(form);
    if (!input) return setErrors(["Bitte prüfe deine Angaben und versuch es noch einmal."]);
    setErrors([]);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const out = summary(input);
      pendingFocus.current = "heading";
      set({ v: 1, phase: "result", ...form, output: out });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(input), ausgabe: reportMarkdown(out, kopf) });
    } finally {
      setBusy(false);
    }
  }

  const output = ready && saved.phase === "result" ? saved.output : undefined;

  if (output) {
    const doc = toDocument(output, kopf);
    const split = doc.blocks.findIndex((b) => b.type === "table");
    const downloadCsv = () =>
      ctx.guardDownload(() => {
        setCsvError(null);
        try {
          downloadBytes(new TextEncoder().encode(toCsv(output)), csvFilename(output.plattform, profile.firma), "text/csv;charset=utf-8");
        } catch {
          setCsvError("Der CSV-Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Text.");
        }
      });
    return (
      <ResultCard
        title="Deine Engagement-Rate"
        headingRef={headingRef}
        actions={
          <>
            <DocumentExport model={doc} />
            <Button type="button" variant="outline" onClick={downloadCsv} data-umami-event="export_csv" data-umami-event-tool={ctx.slug}>
              CSV herunterladen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                pendingFocus.current = "follower";
                setErrors([]);
                setDraft(null);
                set({ v: 1, phase: "edit", plattform: saved.plattform, follower: saved.follower, posts: saved.posts });
              }}
            >
              Angaben ändern
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                pendingFocus.current = "follower";
                setErrors([]);
                setDraft(null);
                set({ v: 1, phase: "edit", ...newForm() });
              }}
            >
              Neu beginnen
            </Button>
          </>
        }
      >
        <DocView blocks={doc.blocks.slice(0, split)} />
        <Chart s={output} />
        <div data-testid="er-tabelle">
          <DocView blocks={doc.blocks.slice(split)} />
        </div>
        {csvError && (
          <p role="alert" className="text-sm text-destructive">
            {csvError}
          </p>
        )}
      </ResultCard>
    );
  }

  const plattform = plattformOf(form.plattform);
  const verein = profile.organisationstyp === "verein";
  const setField = (i: number, patch: Partial<PostForm>) => change({ ...form, posts: setPost(form.posts, i, patch) });

  return (
    <form
      className="grid gap-6"
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

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">{verein ? "Dein Verein" : "Dein Betrieb"}</legend>
        <ProfileFieldsForm idPrefix="er" fields={["firma"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          {verein ? "Der Name erscheint" : "Die Firma erscheint"} nur im Kopf des Dokuments. Wir speichern {verein ? "ihn" : "sie"} in deinem Firmenprofil, in
          deinem Browser.
        </p>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Plattform und Follower</legend>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="er-plattform">Plattform</Label>
          <select
            id="er-plattform"
            className={selectClass}
            value={form.plattform}
            aria-describedby="er-fundort"
            disabled={!ready}
            onChange={(e) => {
              if (isPlattformKey(e.target.value)) change({ ...form, plattform: e.target.value });
            }}
          >
            {PLATTFORMEN.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <p id="er-fundort" className="text-sm text-muted-foreground">
            {plattform.fundort} Die Plattformen benennen ihre Menüs ab und zu um; im Zweifel hilft die Suche in der Hilfe der Plattform.
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="er-follower">Follower (oder Abonnenten) am Tag der Auswertung</Label>
          <Input
            id="er-follower"
            type="number"
            inputMode="numeric"
            min={LIMITS.follower.min}
            max={LIMITS.follower.max}
            step={1}
            value={form.follower}
            onChange={(e) => change({ ...form, follower: e.target.value })}
            aria-describedby="er-follower-help"
            required
            disabled={!ready}
          />
          <p id="er-follower-help" className="text-sm text-muted-foreground">
            {numberCH(LIMITS.follower.min, 0)} bis {numberCH(LIMITS.follower.max, 0)}. Die Zahl vom Tag der Auswertung, nicht vom Tag der Veröffentlichung.
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Deine Beiträge</legend>
        <p className="text-sm text-muted-foreground">
          Trage je Beitrag die Zahlen aus der Statistik ein. Leere Zahlenfelder zählen als 0. Die Bezeichnung ist freiwillig und hilft dir, den Beitrag
          wiederzuerkennen. Die {plattform.reichweiteLabel} ist freiwillig: Ohne sie entfällt die zweite Formel für diesen Beitrag. Zeilen ohne Zahlen werden
          übersprungen. Werte mindestens {RICHTWERT.empfohlen} Beiträge aus ({RICHTWERT_NOTE}).
        </p>
        <ul className="grid gap-4" aria-label="Beiträge">
          {form.posts.map((p, i) => {
            const n = i + 1;
            const numberField = (key: FeldKey | "reichweite", label: string) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`er-p${n}-${key}`}>
                  <span className="sr-only">Beitrag {n}: </span>
                  {label}
                </Label>
                <Input
                  id={`er-p${n}-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LIMITS.zahl.max}
                  step={1}
                  value={p[key]}
                  onChange={(e) => setField(i, { [key]: e.target.value })}
                  disabled={!ready}
                />
              </div>
            );
            return (
              <li key={i} className="grid gap-3 rounded-xl border border-line p-4" data-testid="er-beitrag">
                <div className="flex items-end gap-3">
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Label htmlFor={`er-p${n}-name`}>Beitrag {n}</Label>
                    <Input
                      id={`er-p${n}-name`}
                      value={p.name}
                      maxLength={LIMITS.name}
                      placeholder="z. B. Fassade Gossau"
                      autoComplete="off"
                      lang="de-CH"
                      onChange={(e) => setField(i, { name: e.target.value })}
                      disabled={!ready}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Beitrag ${n} entfernen`}
                    disabled={rows <= LIMITS.beitraege.min}
                    onClick={() => {
                      const next = removePost(form.posts, i);
                      pendingFocus.current = "add";
                      change({ ...form, posts: next });
                      setStatus(`Beitrag ${n} entfernt. ${next.length} von ${MAX_POSTS} Beiträgen, die Nummern rücken nach.`);
                    }}
                  >
                    Entfernen
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {plattform.felder.map((f) => numberField(f.key, f.label))}
                  {numberField("reichweite", plattform.reichweiteLabel)}
                </div>
              </li>
            );
          })}
        </ul>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground" data-testid="er-anzahl">
          {status || `${rows} von ${MAX_POSTS} Beiträgen.`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            ref={addRef}
            type="button"
            variant="outline"
            disabled={!ready || rows >= MAX_POSTS}
            onClick={() => {
              const next = addPost(form.posts);
              if (next === form.posts) return;
              pendingFocus.current = next.length;
              change({ ...form, posts: next });
              setStatus(`Beitrag ${next.length} hinzugefügt. ${next.length} von ${MAX_POSTS} Beiträgen.`);
            }}
          >
            Beitrag hinzufügen
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!ready}
            onClick={() => {
              change({ plattform: SAMPLE.plattform, follower: SAMPLE.follower, posts: SAMPLE.posts.map((p) => ({ ...p })) });
              setStatus("Beispiel eingefügt: Malerei Keller, Instagram, fünf Beiträge.");
            }}
          >
            Beispiel einfügen
          </Button>
        </div>
      </fieldset>

      <div id="er-error" role="alert" className="min-h-6 text-destructive">
        {errors.length > 0 && (
          <ul className="grid gap-1">
            {errors.slice(0, 6).map((m) => (
              <li key={m}>{m}</li>
            ))}
            {errors.length > 6 && <li>und {errors.length - 6} weitere Hinweise.</li>}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || busy}>
          Rate berechnen
        </Button>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <RateFlow />
    </ToolShell>
  );
}
