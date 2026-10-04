"use client";

import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ScoreBadge } from "@/components/tool/ScoreBadge";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateCH } from "@/lib/ch";
import { runCheck } from "@/lib/check/client";
import { CHECK_STEPS, INDUSTRY_KEYS, INDUSTRY_LABELS, type CheckStepId, type IndustryKey } from "@/lib/check/types";
import { toMarkdown } from "@/lib/export/model";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  CHECKS_PER_HOUR,
  EMPTY_FORM,
  MAX_COMPETITORS,
  SLUG,
  checkInputFor,
  eingabeText,
  failedSite,
  industryFor,
  parseState,
  summarize,
  toDocument,
  validate,
  type ComparisonResult,
  type FormState,
  type SiteSummary,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type SiteState = { host: string; own: boolean; state: "wait" | "run" | "done" | "failed"; note?: string };
const STATE_TEXT: Record<SiteState["state"], string> = { wait: "wartet", run: "läuft", done: "fertig", failed: "nicht erreichbar" };
const STEP_LABEL = Object.fromEntries(CHECK_STEPS.map((s) => [s.id, s.label])) as Record<CheckStepId, string>;

function Intro() {
  return (
    <>
      <p>
        Gib deine Website und ein bis drei Mitbewerber an. Der Vergleich liest die Startseiten nacheinander mit derselben Prüfung wie der
        Digitaler-Auftritt-Check und stellt die Punkte je Bereich nebeneinander: Website und SEO, Google-Profil, Social Media, Tracking, Newsletter,
        Shop und Buchung. Du siehst, wo du vorne liegst, wo die anderen vorne liegen und was du zuerst angehst.
      </p>
      <p>
        Die Adressen gehen an unseren Server, der jede Startseite einmal abruft; er speichert sie nicht. Das Ergebnis geht zusammen mit deinen Angaben
        und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können. Von den Mitbewerbern bleiben nur Adresse und Punkte.
      </p>
    </>
  );
}

function CompareFlow() {
  const ctx = useToolContext();
  const { profile } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // Änderungen am Formular leben im Entwurf, bis der Vergleich startet; vorher gilt der gespeicherte Stand.
  const [draft, setDraft] = useState<FormState | null>(null);
  const form = draft ?? saved.form ?? EMPTY_FORM;
  const industry = industryFor(profile, form);

  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sites, setSites] = useState<SiteState[]>([]);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Fokus nur nach einer Aktion der Person, nicht beim Wiederherstellen aus dem Speicher.
  const shouldFocus = useRef(false);
  useEffect(() => {
    if (shouldFocus.current) {
      headingRef.current?.focus();
      shouldFocus.current = false;
    }
  }, [running, saved.phase]);

  async function start() {
    const v = validate(profile, form);
    if (!v.ok) return setError(v.message);
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const keepForm: FormState = { ...form, industry: v.industry };
      set({ ...saved, form: keepForm });
      setSites(v.sites.map((s) => ({ host: s.host, own: s.own, state: "wait" })));
      setStep("");
      shouldFocus.current = true;
      setRunning(true);

      const summaries: SiteSummary[] = [];
      for (let i = 0; i < v.sites.length; i++) {
        const site = v.sites[i];
        const input = checkInputFor(site, v.industry, profile);
        const mark = (state: SiteState["state"], note?: string) => setSites((list) => list.map((s, j) => (j === i ? { ...s, state, note } : s)));
        const onStep = (id: CheckStepId, state: "start" | "done") => {
          if (state === "start") setStep(STEP_LABEL[id]);
        };
        mark("run");
        // Nacheinander, nicht parallel: Jede Prüfung ruft eine fremde Website ab.
        let outcome = await runCheck(input, onStep);
        // Der Server kennt keine Adresse (Cookie fehlt): Fenster zeigen, dann diese Website einmal wiederholen.
        if (!outcome.ok && outcome.code === "gate") {
          if (!(await ctx.renewEmail())) {
            setError(outcome.message);
            return;
          }
          outcome = await runCheck(input, onStep);
        }
        if (!outcome.ok && outcome.code === "rate_limited") {
          setError(`Das waren viele Prüfungen in kurzer Zeit. Das Limit liegt bei ${CHECKS_PER_HOUR} Prüfungen pro Stunde; jede Website zählt als eine. Bitte versuche es später wieder.`);
          return;
        }
        if (!outcome.ok) {
          mark("failed", outcome.message);
          summaries.push(failedSite(site, outcome.message));
          continue;
        }
        mark("done");
        summaries.push(summarize(outcome.result, site.own));
      }

      if (summaries.every((s) => s.score === null)) {
        setError("Keine der Websites konnte geprüft werden. Prüfe die Adressen und versuche es noch einmal.");
        return;
      }
      const result: ComparisonResult = { checkedAt: new Date().toISOString(), industry: v.industry, sites: summaries };
      shouldFocus.current = true;
      set({ v: 1, phase: "result", step: 0, answers: {}, form: keepForm, result });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(result), ausgabe: toMarkdown(toDocument(result)) });
    } finally {
      setRunning(false);
      setBusy(false);
    }
  }

  const restart = () => {
    shouldFocus.current = true;
    setError(null);
    setDraft(null);
    set({ v: 1, phase: "intro", step: 0, answers: {}, form: saved.form });
  };

  // ---- Ergebnis --------------------------------------------------------------------------------
  if (ready && saved.phase === "result" && saved.result && !running) {
    const result = saved.result;
    const own = result.sites.find((s) => s.own) ?? result.sites[0];
    const others = result.sites.filter((s) => !s.own).length;
    const doc = toDocument(result);
    return (
      <ResultCard title="Dein Vergleich" headingRef={headingRef} actions={<DocumentExport model={doc} />}>
        {own.score !== null && <ScoreBadge score={own.score} label={`Gesamtpunktzahl für ${own.host}`} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Verglichen am {dateCH(result.checkedAt)} mit {others === 1 ? "einem Mitbewerber" : `${others} Mitbewerbern`}.
          </p>
          <Button variant="outline" size="sm" onClick={restart}>
            Neu vergleichen
          </Button>
        </div>
        <DocView blocks={doc.blocks} />
      </ResultCard>
    );
  }

  // ---- Vergleich läuft -------------------------------------------------------------------------
  if (running) {
    const done = sites.filter((s) => s.state === "done" || s.state === "failed").length;
    const current = sites.findIndex((s) => s.state === "run");
    return (
      <div className="grid gap-5">
        <h3 ref={headingRef} tabIndex={-1} className="outline-none">
          Dein Vergleich läuft
        </h3>
        <p role="status" aria-live="polite" className="text-muted-foreground">
          {current >= 0 ? `${current + 1} von ${sites.length}: ${sites[current].host} läuft${step ? ` (${step})` : ""}` : `${done} von ${sites.length} geprüft`}
        </p>
        <div
          role="progressbar"
          aria-label="Fortschritt"
          aria-valuemin={0}
          aria-valuemax={sites.length}
          aria-valuenow={done}
          className="h-2 w-full overflow-hidden rounded-full bg-line"
        >
          <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${sites.length ? (done / sites.length) * 100 : 0}%` }} />
        </div>
        <ol className="grid gap-2">
          {sites.map((s) => (
            <li key={s.host} className="grid gap-0.5 border-b border-line pb-2 last:border-b-0">
              <span className="flex items-baseline justify-between gap-3">
                <span className={s.state === "wait" ? "text-muted-foreground" : "font-medium"}>
                  {s.host}
                  {s.own ? " (du)" : ""}
                </span>
                <span className={`mono text-sm ${s.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{STATE_TEXT[s.state]}</span>
              </span>
              {s.note && <span className="text-sm text-muted-foreground">{s.note}</span>}
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">Jede Website wird einmal abgerufen. Das dauert je Website meist wenige Sekunden.</p>
      </div>
    );
  }

  // ---- Formular --------------------------------------------------------------------------------
  const setIndustry = (value: string) => setDraft({ ...form, industry: value as IndustryKey | "" });
  const setCompetitor = (i: number, value: string) => setDraft({ ...form, competitors: form.competitors.map((c, j) => (j === i ? value : c)) });

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={!ready}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2">
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="wv" fields={["firma", "website", "ort"]} />
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="wv-industry">Branche</Label>
          <select id="wv-industry" className={selectClass} value={industry} onChange={(e) => setIndustry(e.target.value)} aria-describedby="wv-industry-help">
            <option value="">Bitte wählen</option>
            {INDUSTRY_KEYS.map((k) => (
              <option key={k} value={k}>
                {INDUSTRY_LABELS[k]}
              </option>
            ))}
          </select>
          <p id="wv-industry-help" className="text-sm text-muted-foreground">
            Sie gilt für alle Websites im Vergleich und entscheidet, ob Online-Shop und Online-Buchung zählen. Firma, Website und Ort speichern wir in deinem
            Firmenprofil, in deinem Browser.
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4">
        <legend className="px-2 font-heading font-semibold">Mitbewerber</legend>
        <p className="text-sm text-muted-foreground">
          Websites von Betrieben, mit denen du um dieselbe Kundschaft wirbst, zum Beispiel aus deiner Region. Mindestens einer, höchstens{" "}
          {MAX_COMPETITORS}.
        </p>
        {Array.from({ length: MAX_COMPETITORS }, (_, i) => (
          <div key={i} className="grid gap-1.5">
            <Label htmlFor={`wv-mb-${i}`}>
              Mitbewerber {i + 1}
              {i > 0 ? " (freiwillig)" : ""}
            </Label>
            <Input
              id={`wv-mb-${i}`}
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={i === 0 ? "malerei-brunner.ch" : ""}
              value={form.competitors[i] ?? ""}
              onChange={(e) => setCompetitor(i, e.target.value)}
            />
          </div>
        ))}
      </fieldset>

      <p role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || busy}>
          Vergleichen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert je Website etwa zehn Sekunden.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <CompareFlow />
    </ToolShell>
  );
}
