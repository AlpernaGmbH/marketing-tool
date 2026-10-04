"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { placeholdersIn } from "@/lib/generator";
import { readWebsite } from "@/lib/read-client";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { ideenGenerator, type KanalKey } from "./generator";
import { FORMAT_LABELS, KANAELE, KI_HINWEIS, SLUG, eingabeText, hostOf, inputProblem, kanalLabel, pageSummary, parseState, reportMarkdown, toDocument, toInput } from "./logic";
import config from "./tool.config";

type Step = "lesen" | "schreiben";
const STEPS: { id: Step; label: string }[] = [
  { id: "lesen", label: "Website lesen" },
  { id: "schreiben", label: "Ideen schreiben" },
];

function Intro() {
  return (
    <p>
      Gib deine Website an und wähle die Kanäle. Das Werkzeug liest den Text deiner Startseite, und eine KI macht daraus acht bis zwölf Ideen für Beiträge, je
      mit Kanal, Format, Inhalt und erstem Satz. Dazu nennt sie drei Themen, die deine Website hergibt.
    </p>
  );
}

function IdeenFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Website für das CRM-Dokument kommt darum über einen Ref.
  const websiteRef = useRef("");
  const gen = useGenerator(ideenGenerator, { eingabe: eingabeText, ausgabe: (o) => reportMarkdown(o, websiteRef.current) });

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved.output, busy]);

  const website = profile.website ?? "";
  const shownError = error ?? gen.error;

  const toggleKanal = (key: KanalKey, on: boolean) => {
    setError(null);
    set({ ...saved, kanaele: KANAELE.map((k) => k.key).filter((k) => (k === key ? on : saved.kanaele.includes(k))) });
  };

  async function start() {
    const kanaele = saved.kanaele;
    const problem = inputProblem(website, kanaele);
    if (problem) return setError(problem);
    setError(null);
    gen.clearError();
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;

      setStep("lesen");
      let read = await readWebsite(website);
      // Der Server kennt keine Adresse (Cookie fehlt): erst das Fenster, dann einmal wiederholen.
      if (!read.ok && read.reason === "gate") {
        if (!(await ctx.renewEmail())) return;
        read = await readWebsite(website);
      }
      if (!read.ok) {
        setError(read.message);
        return;
      }

      setStep("schreiben");
      websiteRef.current = website;
      const input = toInput({ firma: profile.firma, branche: profile.branche, ort: profile.ort }, kanaele, read.page);
      // generate() macht Fenster, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
      const output = await gen.generate(input);
      if (!output) return;
      shouldFocus.current = true;
      set({ ...savedRef.current, v: 1, website, kanaele: input.kanaele, page: pageSummary(read.page), output });
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  const restart = () => {
    setError(null);
    gen.clearError();
    set({ ...saved, page: null, output: null });
  };

  const output = ready && !busy ? saved.output : null;
  const placeholders = output ? placeholdersIn(output) : [];
  const doc = output ? toDocument(output, saved.website) : null;
  const stepState = (id: Step): "wartet" | "läuft" | "fertig" => (step === null ? "wartet" : id === step ? "läuft" : STEPS.findIndex((s) => s.id === id) < STEPS.findIndex((s) => s.id === step) ? "fertig" : "wartet");

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
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="iaw" fields={["firma", "website", "ort"]} />
        <div className="grid gap-1.5">
          <Label htmlFor="iaw-branche">Branche</Label>
          <Input
            id="iaw-branche"
            value={profile.branche ?? ""}
            onChange={(e) => update({ branche: e.target.value.trim() === "" ? undefined : e.target.value })}
            aria-describedby="iaw-branche-help"
          />
          <p id="iaw-branche-help" className="text-sm text-muted-foreground">
            Zum Beispiel Malerei, Treuhand oder Physiotherapie.
          </p>
        </div>
        <p className="text-sm text-muted-foreground md:col-span-2">Firma, Website, Ort und Branche speichern wir in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-medium">Kanäle</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {KANAELE.map((k) => (
            <div key={k.key} className="flex min-h-11 items-center gap-3">
              <Checkbox id={`iaw-kanal-${k.key}`} checked={ready && saved.kanaele.includes(k.key)} onCheckedChange={(v) => toggleKanal(k.key, v === true)} disabled={!ready || busy} />
              <label htmlFor={`iaw-kanal-${k.key}`} className="cursor-pointer">
                {k.label}
              </label>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Die Ideen verteilen sich auf die gewählten Kanäle.</p>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Dafür gehen Betrieb, Branche, Ort und der Text deiner Startseite (bis {"8'000"} Zeichen) an unseren Server und von dort an unseren KI-Anbieter, nicht deine
        E-Mail-Adresse. Unser Server speichert den Text nicht. Deine Angaben und die Ideen gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können. Gib keine Website mit vertraulichen Inhalten an.
      </p>

      <p id="iaw-error" role="alert" className="min-h-6 text-destructive">
        {shownError}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
          {busy ? "Bitte warten …" : "Ideen finden"}
        </Button>
        <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
      </div>

      {busy && (
        <div role="status" aria-live="polite" className="grid gap-3 rounded-xl border border-line p-4">
          <p className="font-medium">
            {step === "schreiben" ? "Die KI schreibt deine Ideen." : step === "lesen" ? `Wir lesen die Startseite von ${hostOf(website)}.` : "Einen Moment."}
          </p>
          <ol className="grid gap-2">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0">
                <span className={stepState(s.id) === "wartet" ? "text-muted-foreground" : "font-medium"}>
                  {i + 1}. {s.label}
                </span>
                <span className="mono text-sm text-muted-foreground">{stepState(s.id)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {output && doc && (
        <ResultCard
          title="Deine Ideen"
          headingRef={headingRef}
          actions={
            <>
              <DocumentExport model={doc} />
              <Button type="button" variant="ghost" onClick={restart}>
                Neu beginnen
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
            {KI_HINWEIS}
          </p>
          {saved.page && (
            <p>
              Aus der Startseite von <span className="font-medium">{saved.page.host}</span>
              {saved.page.title ? ` («${saved.page.title}»)` : ""}.
            </p>
          )}
          {placeholders.length > 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {placeholders.join(", ")}
            </p>
          )}
          <ol className="grid gap-3" aria-label="Ideen für Beiträge">
            {output.ideen.map((idee, i) => (
              <li key={i} className="grid gap-2 rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h4 className="font-heading font-medium">
                    {i + 1}. {idee.titel}
                  </h4>
                  <span className="mono text-xs uppercase tracking-wide text-muted-foreground">
                    {kanalLabel(idee.kanal)} · {FORMAT_LABELS[idee.format]}
                  </span>
                </div>
                <p>{idee.worum}</p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Erster Satz:</span> «{idee.hook}»
                </p>
              </li>
            ))}
          </ol>
          <div className="rounded-xl border border-line bg-surface p-4">
            <h4 className="font-heading font-medium">Themen auf deiner Website</h4>
            <ul className="mt-2 grid list-disc gap-1 pl-5">
              {output.themen.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </ResultCard>
      )}
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <IdeenFlow />
    </ToolShell>
  );
}
