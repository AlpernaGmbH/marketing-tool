"use client";

import { useEffect, useRef, useState } from "react";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aiTried, fetchEinordnung, markAiTried, type EinordnungReason } from "@/lib/check/ai-client";
import { runCheck } from "@/lib/check/client";
import { CHECK_STEPS, INDUSTRY_KEYS, INDUSTRY_LABELS, POSTING_FREQUENCIES, SOCIAL_NETWORKS, type CheckStepId, type IndustryKey } from "@/lib/check/types";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { CheckResultView, type AiView } from "./Result";
import { toMarkdown } from "@/lib/export/model";
import { EMPTY_FORM, SLUG, buildInput, formProblem, host, industryFor, parseCheckState, profilePatch, toDocument, type FormState } from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type StepState = "wait" | "run" | "done";
const STEP_TEXT: Record<StepState, string> = { wait: "wartet", run: "läuft", done: "fertig" };
const freshSteps = (): Record<CheckStepId, StepState> => Object.fromEntries(CHECK_STEPS.map((s) => [s.id, "wait"])) as Record<CheckStepId, StepState>;

function Intro() {
  return (
    <>
      <p>
        Gib die Adresse deiner Website ein. Der Check ruft die Startseite ab, prüft Technik und Grundlagen für Suchmaschinen und sucht Hinweise auf
        Google-Profil, Social Media, Tracking, Newsletter, Online-Shop und Online-Buchung. Du bekommst eine Punktzahl und eine Liste der nächsten Schritte,
        geordnet nach Wirkung.
      </p>
      <p>
        Die Adresse geht an unseren Server, der die Seite abruft; er speichert sie nicht. Das Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an
        Alperna, damit wir dir bei Fragen weiterhelfen können.
      </p>
      <p>
        Eine KI schreibt zusätzlich eine kurze Einordnung. Dafür gehen Betrieb, Ort, Branche, die Domain und die Messwerte des Checks an unseren KI-Anbieter, nicht
        die Seite selbst.
      </p>
    </>
  );
}

function CheckFlow() {
  const ctx = useToolContext();
  const { profile, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseCheckState);

  // Änderungen am Formular leben im Entwurf, bis der Check startet; vorher gilt der gespeicherte Stand.
  const [draft, setDraft] = useState<FormState | null>(null);
  const form = draft ?? saved.form ?? EMPTY_FORM;
  const industry = industryFor(profile, form);

  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState(freshSteps);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // KI-Einordnung: sobald eine Adresse bekannt ist, einmal pro Ergebnis (Kennung = Signatur des Servers).
  // Der Zwischenspeicher im Browser hält sie fest, der Server hält sie 24 Stunden vor.
  const [aiFailed, setAiFailed] = useState<{ sig: string; reason: EinordnungReason } | null>(null);
  const [aiTry, setAiTry] = useState(0);
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  const requested = useRef<string | null>(null);
  const sig = saved.result?.sig;
  const canAi = ready && Boolean(ctx.email) && saved.phase === "result" && !!sig && !saved.einordnung;

  useEffect(() => {
    if (!canAi || !sig || requested.current === `${sig}:${aiTry}`) return;
    requested.current = `${sig}:${aiTry}`;
    const current = savedRef.current;
    if (!current.result) return;
    // Beim Neuladen nach einem Fehlversuch nicht von selbst wieder anfragen; der Knopf «Noch einmal versuchen» bleibt.
    if (aiTry === 0 && aiTried(sig)) {
      setAiFailed({ sig, reason: "failed" });
      return;
    }
    markAiTried(sig);
    void fetchEinordnung(current.result).then((outcome) => {
      const now = savedRef.current;
      // Hat der Besucher inzwischen neu geprüft, gehört die Antwort nicht mehr zum Ergebnis.
      if (now.result?.sig !== sig) return;
      if (outcome.ok) {
        setAiFailed(null);
        set({ ...now, einordnung: outcome.einordnung });
      } else {
        setAiFailed({ sig, reason: outcome.reason });
      }
    });
  }, [canAi, sig, aiTry, set]);

  const ai: AiView = !ctx.email || !sig
    ? { status: "none" }
    : saved.einordnung
      ? { status: "ok", einordnung: saved.einordnung }
      : aiFailed?.sig === sig
        ? { status: "unavailable", reason: aiFailed.reason }
        : { status: "loading" };

  const retryAi = () => {
    setAiFailed(null);
    setAiTry((n) => n + 1);
  };

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  const shouldFocus = useRef(false);

  useEffect(() => {
    if (shouldFocus.current) {
      headingRef.current?.focus();
      shouldFocus.current = false;
    }
  }, [running, saved.phase]);

  const onStep = (id: CheckStepId, state: "start" | "done") => setSteps((s) => ({ ...s, [id]: state === "start" ? "run" : "done" }));

  async function start() {
    const input = buildInput(profile, form);
    const problem = formProblem(input);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const keepForm: FormState = { ...form, industry: industry || "other" };
      set({ ...saved, form: keepForm });
      setSteps(freshSteps());
      shouldFocus.current = true;
      setRunning(true);

      let outcome = await runCheck(input, onStep);
      // Der Server kennt keine Adresse (Cookie fehlt): Fenster zeigen, dann einmal wiederholen.
      if (!outcome.ok && outcome.code === "gate" && (await ctx.renewEmail())) {
        setSteps(freshSteps());
        outcome = await runCheck(input, onStep);
      }

      shouldFocus.current = true;
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      set({ v: 1, phase: "result", step: 0, answers: {}, form: keepForm, result: outcome.result });
      update(profilePatch(profile, outcome.result));
      setDraft(null);
      const socials = SOCIAL_NETWORKS.map((n) => (keepForm.socials[n.key].url ? `${n.label}: ${keepForm.socials[n.key].url} (${keepForm.socials[n.key].freq || "keine Angabe"})` : ""))
        .filter(Boolean)
        .join("\n");
      void ctx.sendResult({
        eingabe: [`Website: ${input.website}`, `Betrieb: ${input.company}`, `Ort: ${input.city}`, `Branche: ${INDUSTRY_LABELS[keepForm.industry as IndustryKey] ?? keepForm.industry}`, socials].filter(Boolean).join("\n"),
        ausgabe: toMarkdown(toDocument(outcome.result)),
      });
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
    return <CheckResultView result={saved.result} onRestart={restart} headingRef={headingRef} ai={ai} onRetryAi={retryAi} />;
  }

  // ---- Prüfung läuft ---------------------------------------------------------------------------
  if (running) {
    const done = CHECK_STEPS.filter((s) => steps[s.id] === "done").length;
    return (
      <div className="grid gap-5" role="status" aria-live="polite">
        <h3 ref={headingRef} tabIndex={-1} className="outline-none">
          Dein Check läuft
        </h3>
        <p className="text-muted-foreground">Wir lesen die Startseite von {host(buildInput(profile, form).website || "deiner Website")}. Das dauert meist wenige Sekunden.</p>
        <div
          role="progressbar"
          aria-label="Fortschritt"
          aria-valuemin={0}
          aria-valuemax={CHECK_STEPS.length}
          aria-valuenow={done}
          className="h-2 w-full overflow-hidden rounded-full bg-line"
        >
          <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${(done / CHECK_STEPS.length) * 100}%` }} />
        </div>
        <ol className="grid gap-2">
          {CHECK_STEPS.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0">
              <span className={steps[s.id] === "wait" ? "text-muted-foreground" : "font-medium"}>{s.label}</span>
              <span className="mono text-sm text-muted-foreground">{STEP_TEXT[steps[s.id]]}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // ---- Formular --------------------------------------------------------------------------------
  const setIndustry = (value: string) => setDraft({ ...form, industry: value as IndustryKey | "" });
  const setSocial = (key: (typeof SOCIAL_NETWORKS)[number]["key"], patch: Partial<FormState["socials"][typeof key]>) =>
    setDraft({ ...form, socials: { ...form.socials, [key]: { ...form.socials[key], ...patch } } });

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
        <ProfileFieldsForm idPrefix="dac" fields={["firma", "website", "ort"]} />
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="dac-industry">Branche</Label>
          <select id="dac-industry" className={selectClass} value={industry} onChange={(e) => setIndustry(e.target.value)} aria-describedby="dac-industry-help">
            <option value="">Bitte wählen</option>
            {INDUSTRY_KEYS.map((k) => (
              <option key={k} value={k}>
                {INDUSTRY_LABELS[k]}
              </option>
            ))}
          </select>
          <p id="dac-industry-help" className="text-sm text-muted-foreground">
            Sie entscheidet, ob Online-Shop und Online-Buchung für dich zählen. Firma, Website und Ort speichern wir in deinem Firmenprofil, in deinem Browser.
          </p>
        </div>
      </fieldset>

      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer font-heading font-semibold">Social-Media-Kanäle (freiwillig)</summary>
        <div className="mt-4 grid gap-4">
          <p className="text-sm text-muted-foreground">
            Instagram, LinkedIn und TikTok lassen sich nicht automatisch auslesen. Deine Angaben verbessern die Bewertung. Ohne Angabe zur Häufigkeit gehen wir von
            «etwa monatlich» aus und sagen das im Ergebnis. Kanäle, die auf deiner Website verlinkt sind, erkennen wir selbst.
          </p>
          {SOCIAL_NETWORKS.map((n) => (
            <div key={n.key} className="grid gap-2 md:grid-cols-[1fr_14rem]">
              <div className="grid gap-1.5">
                <Label htmlFor={`dac-soc-${n.key}`}>{n.label}</Label>
                <Input
                  id={`dac-soc-${n.key}`}
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={n.placeholder}
                  value={form.socials[n.key].url}
                  onChange={(e) => setSocial(n.key, { url: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`dac-freq-${n.key}`}>Beiträge auf {n.label}</Label>
                <select
                  id={`dac-freq-${n.key}`}
                  className={selectClass}
                  value={form.socials[n.key].freq}
                  onChange={(e) => setSocial(n.key, { freq: e.target.value as FormState["socials"][typeof n.key]["freq"] })}
                >
                  <option value="">Keine Angabe</option>
                  {POSTING_FREQUENCIES.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </details>

      <p role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || busy}>
          Website prüfen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert etwa zehn Sekunden.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <CheckFlow />
    </ToolShell>
  );
}
