"use client";

import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ScoreBadge } from "@/components/tool/ScoreBadge";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { placeholdersIn } from "@/lib/generator";
import { readWebsite } from "@/lib/read-client";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { MAX_FREITEXT, positionierungGenerator, type PositionierungInput } from "./generator";
import {
  EMPTY_STATE,
  KI_HINWEIS,
  RICHTWERT_HINWEIS,
  SLUG,
  checkPositionierung,
  eingabeText,
  entwurfBodyBlocks,
  hostOf,
  inputProblem,
  parseState,
  profilePatch,
  prozent,
  reportMarkdown,
  stripText,
  toDocument,
  toInput,
  type Fund,
  type PositionierungCheck,
  type Status,
  type StoredInput,
} from "./logic";
import config from "./tool.config";

type Step = "lesen" | "pruefen" | "schreiben";
const STEPS: { id: Step; label: string }[] = [
  { id: "lesen", label: "Website lesen" },
  { id: "pruefen", label: "Text prüfen" },
  { id: "schreiben", label: "Entwurf schreiben" },
];

const STATUS_TEXT: Record<Status, string> = { gut: "gut", teil: "zum Teil", fehlt: "fehlt" };

function Intro() {
  return (
    <>
      <p>
        Gib deine Website an. Das Werkzeug liest den Text deiner Startseite und prüft sechs Punkte: Für wen bist du da, was unterscheidet dich, welche Belege
        stehen da, wie oft sprichst du die Kundschaft an, nennst du Ort und Region, und wie viele Floskeln stehen im Text. Du bekommst eine Punktzahl mit Funden.
      </p>
      <p>Danach schreibt eine KI den Entwurf deiner Positionierung: Kernsatz, für wen, was anders, Beweise, drei Varianten und was du zuerst änderst.</p>
    </>
  );
}

function FundCard({ f }: { f: Fund }) {
  return (
    <li className="grid gap-1 rounded-xl border border-line bg-paper p-4">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{f.titel}</span>
        <span className="mono text-sm text-muted-foreground">
          {f.punkte} von {f.max} · {STATUS_TEXT[f.status]}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">{f.hinweis}</p>
      {f.beispiele.length > 0 && (
        <ul className="mt-1 grid gap-1">
          {f.beispiele.map((b, i) => (
            <li key={i} className="mono break-words rounded-md bg-surface px-2 py-1 text-sm">
              {b}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Kennzahlen({ check }: { check: PositionierungCheck }) {
  const k = check.kennzahlen;
  const items: [string, string][] = [
    ["Wörter", String(k.woerter)],
    ["Sätze an die Kundschaft", k.kundenAnteil === null ? "keine Anrede" : `${k.kundeSaetze} von ${k.kundeSaetze + k.wirSaetze} (${prozent(k.kundenAnteil)})`],
    ["Belege", String(k.beweise)],
    ["Floskeln", String(k.floskeln)],
  ];
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-line p-3">
          <dt className="eyebrow">{label}</dt>
          <dd className="mt-1 font-heading text-xl font-medium tracking-tight">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PositionierungFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; Check und Angaben für das CRM-Dokument kommen darum über Refs.
  const checkRef = useRef<PositionierungCheck | null>(null);
  const angabenRef = useRef<StoredInput | null>(null);
  const gen = useGenerator(positionierungGenerator, {
    eingabe: (i) => eingabeText(stripText(i)),
    ausgabe: (o) => (checkRef.current && angabenRef.current ? reportMarkdown(checkRef.current, o, angabenRef.current) : ""),
    // Der Check steht schon, während der Entwurf entsteht: Das Werkzeug bleibt sichtbar und zeigt seine eigene Statusmeldung.
    loading: false,
  });

  // Die volle Eingabe (mit Text) nur für «Entwurf noch einmal versuchen» in dieser Sitzung; im Speicher liegt sie ohne Text.
  const lastInputRef = useRef<PositionierungInput | null>(null);
  // Schlägt nur der Entwurf fehl, geht der Check einmal allein ins CRM.
  const checkSentRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (!shouldFocus.current || !saved.check) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved.check]);

  const website = profile.website ?? "";
  const shownError = error ?? gen.error;
  const setForm = (patch: Partial<typeof saved.form>) => {
    setError(null);
    set({ ...saved, form: { ...saved.form, ...patch } });
  };

  async function sendCheckOnly(input: PositionierungInput, check: PositionierungCheck) {
    if (checkSentRef.current) return;
    checkSentRef.current = true;
    await ctx.sendResult({ eingabe: eingabeText(stripText(input)), ausgabe: reportMarkdown(check, null, stripText(input)) });
  }

  async function entwurf(input: PositionierungInput, check: PositionierungCheck) {
    setStep("schreiben");
    // generate() macht Fenster, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const output = await gen.generate(input);
    if (!output) {
      void sendCheckOnly(input, check);
      return;
    }
    set({ ...savedRef.current, output });
    update(profilePatch(profile, output));
  }

  async function start() {
    const problem = inputProblem(website);
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

      setStep("pruefen");
      const check = checkPositionierung(read.page.text, { ort: profile.ort, kanton: profile.kanton, firma: profile.firma });
      const input = toInput({ firma: profile.firma, branche: profile.branche, ort: profile.ort, kanton: profile.kanton }, saved.form, read.page, check);
      const stored = stripText(input);
      checkRef.current = check;
      angabenRef.current = stored;
      lastInputRef.current = input;
      checkSentRef.current = false;
      shouldFocus.current = true;
      // Der Check steht sofort; der Entwurf kommt dazu, sobald die KI fertig ist.
      set({ ...savedRef.current, v: 1, input: stored, check, output: null });

      await entwurf(input, check);
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  async function retryEntwurf() {
    const check = savedRef.current.check;
    if (!check) return;
    setError(null);
    gen.clearError();
    if (!lastInputRef.current) {
      // Nach dem Neuladen fehlt der Text der Seite: noch einmal lesen und prüfen.
      return start();
    }
    setBusy(true);
    try {
      await entwurf(lastInputRef.current, check);
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  const change = () => {
    setError(null);
    gen.clearError();
    lastInputRef.current = null;
    set({ ...saved, input: null, check: null, output: null });
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    lastInputRef.current = null;
    set(EMPTY_STATE);
  };

  const showResult = ready && saved.check !== null && saved.input !== null;
  const stepState = (id: Step): "wartet" | "läuft" | "fertig" =>
    step === null ? "wartet" : id === step ? "läuft" : STEPS.findIndex((s) => s.id === id) < STEPS.findIndex((s) => s.id === step) ? "fertig" : "wartet";

  // ---- Ergebnis --------------------------------------------------------------------------------
  if (showResult && saved.check && saved.input) {
    const check = saved.check;
    const output = saved.output;
    const doc = toDocument(check, output, saved.input);
    const placeholders = output ? placeholdersIn(output) : [];
    // Im Ergebnis läuft nur noch der Entwurf (oder, nach dem Neuladen, Lesen und Prüfen davor).
    const writing = busy;
    return (
      <ResultCard
        title="Deine Positionierung"
        headingRef={headingRef}
        actions={
          <>
            <DocumentExport model={doc} />
            <Button type="button" variant="outline" onClick={change} disabled={busy}>
              Angaben ändern
            </Button>
            <Button type="button" variant="ghost" onClick={restart} disabled={busy}>
              Neu beginnen
            </Button>
          </>
        }
      >
        <ScoreBadge score={check.score} label="Positionierung auf der Startseite" />
        <p>
          Aus der Startseite von <span className="font-medium">{saved.input.host}</span>
          {saved.input.title ? ` («${saved.input.title}»)` : ""}. {RICHTWERT_HINWEIS}
        </p>
        <Kennzahlen check={check} />
        <ol className="grid gap-3" aria-label="Funde nach Gruppen">
          {check.funde.map((f) => (
            <FundCard key={f.id} f={f} />
          ))}
        </ol>

        <h4 className="font-heading text-lg font-medium">Dein Entwurf</h4>
        {writing && (
          <p role="status" aria-live="polite" className="rounded-xl border border-line p-4">
            {step === "lesen" ? "Wir lesen die Startseite noch einmal." : step === "pruefen" ? "Wir prüfen den Text." : "Die KI schreibt deinen Entwurf. Das dauert meist unter einer Minute."}
          </p>
        )}
        {!writing && output && (
          <>
            <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
              {KI_HINWEIS}
            </p>
            {placeholders.length > 0 && (
              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
                Platzhalter ausfüllen: {placeholders.join(", ")}
              </p>
            )}
            <div className="rounded-xl border border-line p-4 md:p-5">
              <DocView blocks={entwurfBodyBlocks(output)} baseLevel={5} />
            </div>
          </>
        )}
        {!writing && !output && (
          <div className="grid gap-3 rounded-xl border border-line p-4">
            {shownError ? (
              <p role="alert" className="text-destructive">
                {shownError}
              </p>
            ) : (
              <p className="text-muted-foreground">Der Entwurf fehlt noch. Der Check oben steht; den Entwurf kannst du nachholen.</p>
            )}
            <div>
              <Button type="button" onClick={() => void retryEntwurf()} disabled={busy}>
                Entwurf noch einmal versuchen
              </Button>
            </div>
          </div>
        )}
      </ResultCard>
    );
  }

  // ---- Formular --------------------------------------------------------------------------------
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
        <ProfileFieldsForm idPrefix="pos" fields={["firma", "website", "ort", "kanton"]} />
        <div className="grid gap-1.5">
          <Label htmlFor="pos-branche">Branche</Label>
          <Input
            id="pos-branche"
            value={profile.branche ?? ""}
            onChange={(e) => update({ branche: e.target.value.trim() === "" ? undefined : e.target.value })}
            aria-describedby="pos-branche-help"
          />
          <p id="pos-branche-help" className="text-sm text-muted-foreground">
            Zum Beispiel Malerei, Treuhand oder Physiotherapie.
          </p>
        </div>
        <p className="text-sm text-muted-foreground md:col-span-2">
          Die Website ist Pflicht; der Check liest nur ihre Startseite. Firma, Website, Ort, Kanton und Branche speichern wir in deinem Firmenprofil, in deinem
          Browser.
        </p>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">Freiwillig: was die Website nicht sagt</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="pos-unterscheidung">Was dich wirklich unterscheidet</Label>
          <Textarea
            id="pos-unterscheidung"
            value={ready ? saved.form.unterscheidung : ""}
            maxLength={MAX_FREITEXT}
            onChange={(e) => setForm({ unterscheidung: e.target.value })}
            aria-describedby="pos-unterscheidung-help"
          />
          <p id="pos-unterscheidung-help" className="text-sm text-muted-foreground">
            Zum Beispiel: «Wir machen nur Fassaden, keine Innenräume, und sind in zwei Wochen fertig.» Bis {MAX_FREITEXT} Zeichen.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pos-beweise">Beweise, die du hast</Label>
          <Textarea
            id="pos-beweise"
            value={ready ? saved.form.beweise : ""}
            maxLength={MAX_FREITEXT}
            onChange={(e) => setForm({ beweise: e.target.value })}
            aria-describedby="pos-beweise-help"
          />
          <p id="pos-beweise-help" className="text-sm text-muted-foreground">
            Jahre, Zahlen, Referenzen, Ausbildungen, Mitgliedschaften. Was hier nicht steht, erfindet die KI nicht; sie setzt Platzhalter. Bis {MAX_FREITEXT}{" "}
            Zeichen.
          </p>
        </div>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Dafür gehen Betrieb, Branche, Ort, Kanton, der Text deiner Startseite (bis {"6'000"} Zeichen), die Funde des Checks und die beiden freiwilligen Felder an
        unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse. Unser Server speichert den Text nicht. Deine Angaben, der Check und der
        Entwurf gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
      </p>

      <p id="pos-error" role="alert" className="min-h-6 text-destructive">
        {shownError}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
          {busy ? "Bitte warten …" : "Positionierung prüfen"}
        </Button>
        <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
      </div>

      {busy && (
        <div role="status" aria-live="polite" className="grid gap-3 rounded-xl border border-line p-4">
          <p className="font-medium">
            {step === "schreiben"
              ? "Die KI schreibt deinen Entwurf."
              : step === "pruefen"
                ? "Wir prüfen den Text."
                : step === "lesen"
                  ? `Wir lesen die Startseite von ${hostOf(website)}.`
                  : "Einen Moment."}
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
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <PositionierungFlow />
    </ToolShell>
  );
}
