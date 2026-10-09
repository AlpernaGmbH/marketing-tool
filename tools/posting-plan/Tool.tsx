"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ResultPitch } from "@/components/tool/ResultPitch";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { numberCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  AUFWAND,
  EMPTY_STATE,
  FAEHIGKEITEN,
  FORMATE,
  KANAELE,
  MAX_SAEULE,
  MAX_SAEULEN,
  MAX_STUNDEN,
  MIN_STUNDEN,
  SLUG,
  TAGE,
  ausgabeText,
  availableFormats,
  buildPlan,
  csvFilename,
  effectiveKanaele,
  eingabeText,
  formFromInput,
  inputFromForm,
  kanaeleVomProfil,
  ohneFormatHinweis,
  parseState,
  pitchFor,
  saeulenAusProfil,
  toCsv,
  toDocument,
  validate,
  type Faehigkeit,
  type Plan,
  type PlanForm,
  type Tag,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const DOWNLOAD_ERROR = "Der Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Text.";

function Intro() {
  return (
    <>
      <p>
        Sag, wie viele Stunden pro Woche du für Beiträge hast, auf welchen Kanälen ihr postet und was ihr gut könnt. Du bekommst einen Plan für vier Wochen: welche
        Beiträge pro Kanal und Woche in dein Budget passen, welche Säule wann dran ist und ein fester Tag, an dem du alles am Stück produzierst.
      </p>
      <p>
        Der Aufwand je Format ist eine Annahme von Alperna, keine Statistik. Du kannst jeden Wert anpassen. Der Plan entsteht in deinem Browser. Stunden, Kanäle,
        Fähigkeiten, Säulen und Produktionstag gehen mit dem Ergebnis und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können. Eine KI rechnet
        nicht mit.
      </p>
    </>
  );
}

function ResultView({
  plan,
  firma,
  headingRef,
  onEdit,
  onNew,
}: {
  plan: Plan;
  firma: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  const ctx = useToolContext();
  const doc = useMemo(() => toDocument(plan, firma), [plan, firma]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadCsv = () =>
    ctx.guardDownload(() => {
      setError(null);
      setBusy(true);
      try {
        downloadBytes(new TextEncoder().encode(toCsv(plan)), csvFilename(firma), "text/csv;charset=utf-8");
      } catch {
        setError(DOWNLOAD_ERROR);
      } finally {
        setBusy(false);
      }
    });

  return (
    <ResultCard
      title="Dein Posting-Plan"
      headingRef={headingRef}
      actions={
        <>
          <DocumentExport model={doc} />
          <Button type="button" variant="outline" disabled={busy} onClick={downloadCsv} data-testid="pp-csv" data-umami-event="export_csv" data-umami-event-tool={SLUG}>
            {busy ? "CSV wird erstellt …" : "CSV"}
          </Button>
          <Button type="button" variant="outline" onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neu beginnen
          </Button>
        </>
      }
    >
      <div data-testid="pp-plan">
        <DocView blocks={doc.blocks} />
      </div>
      <ResultPitch spec={pitchFor(plan)} />
      <p role="alert" className="min-h-6 text-sm text-destructive">
        {error}
      </p>
    </ResultCard>
  );
}

function PlanFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const live = ready && profileReady;

  // Änderungen am Formular leben im Entwurf; gespeichert wird der Stand mit dem Ergebnis.
  const [draft, setDraft] = useState<PlanForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stundenRef = useRef<HTMLInputElement>(null);
  const shouldFocus = useRef<"heading" | "stunden" | null>(null);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "stunden") stundenRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const form = draft ?? formFromInput(saved.input);
  const firma = profile.firma?.trim() ?? "";
  const kanaeleList = effectiveKanaele(form, profile);
  const vomProfil = kanaeleVomProfil(form, profile);
  const profilSaeulen = saeulenAusProfil(profile);
  const ohneFormat = kanaeleList.filter((k) => availableFormats(k, form.faehigkeiten).length === 0);

  const patch = (p: Partial<PlanForm>) => {
    setError(null);
    setDraft({ ...form, ...p });
  };
  const toggleKanal = (key: (typeof KANAELE)[number]["key"], on: boolean) => patch({ kanaele: KANAELE.map((k) => k.key).filter((k) => (k === key ? on : kanaeleList.includes(k))) });
  const toggleFaehigkeit = (key: Faehigkeit, on: boolean) => patch({ faehigkeiten: FAEHIGKEITEN.map((f) => f.key).filter((f) => (f === key ? on : form.faehigkeiten.includes(f))) });
  const setSaeule = (i: number, value: string) => patch({ saeulen: form.saeulen.map((s, j) => (j === i ? value : s)) });
  const setAufwand = (key: keyof PlanForm["aufwand"], value: string) => patch({ aufwand: { ...form.aufwand, [key]: value } });

  const plan = useMemo(() => (ready && saved.phase === "result" ? (saved.output ?? null) : null), [ready, saved]);
  // Nach «Angaben ändern» führt dieser Knopf zum gespeicherten Plan zurück, ohne neue Anfrage und ohne zweiten CRM-Eintrag.
  const zurueck = ready && saved.phase === "edit" && saved.input && validate(saved.input) === null ? saved.input : null;

  async function start() {
    const r = inputFromForm(form, profile);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const result = buildPlan(r.input);
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", input: r.input, output: result });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(r.input), ausgabe: ausgabeText(result, firma) });
    } finally {
      setBusy(false);
    }
  }

  if (plan) {
    return (
      <ResultView
        plan={plan}
        firma={firma}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "stunden";
          setDraft(null);
          set({ v: 1, phase: "edit", input: saved.input });
        }}
        onNew={() => {
          shouldFocus.current = "stunden";
          setDraft(null);
          setError(null);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={!live}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="pp" fields={["organisationstyp", "firma"]} />
        <p className="text-sm text-muted-foreground">Firma und Art der Organisation speichern wir in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Dein Zeitbudget</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="pp-stunden">Stunden pro Woche für Beiträge</Label>
          <Input
            id="pp-stunden"
            ref={stundenRef}
            type="number"
            inputMode="decimal"
            min={MIN_STUNDEN}
            max={MAX_STUNDEN}
            step={0.5}
            value={form.stunden}
            onChange={(e) => patch({ stunden: e.target.value })}
            disabled={!live}
            aria-describedby="pp-stunden-help"
            data-testid="pp-stunden"
          />
          <p id="pp-stunden-help" className="text-sm text-muted-foreground">
            Zwischen {numberCH(MIN_STUNDEN)} und {MAX_STUNDEN} Stunden. Vom Budget gehen 0,25 Stunden für die Planung ab (Annahme von Alperna).
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pp-produktionstag">Produktionstag</Label>
          <select
            id="pp-produktionstag"
            className={selectClass}
            value={form.produktionstag}
            onChange={(e) => patch({ produktionstag: e.target.value as Tag })}
            disabled={!live}
            aria-describedby="pp-produktionstag-help"
            data-testid="pp-produktionstag"
          >
            {TAGE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <p id="pp-produktionstag-help" className="text-sm text-muted-foreground">
            An diesem Tag entstehen alle Beiträge der Woche am Stück. Veröffentlicht wird an den anderen Tagen.
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Kanäle</legend>
        <p className="text-sm text-muted-foreground">
          {vomProfil ? "Vorbelegt aus deinem Firmenprofil. " : "Ohne Angabe im Firmenprofil sind Instagram und Google-Unternehmensprofil gewählt. "}Wähle die Kanäle, auf
          denen ihr Beiträge veröffentlicht.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kanäle">
          {KANAELE.map((k) => (
            <li key={k.key} className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={`pp-kanal-${k.key}`}
                aria-label={k.label}
                className="size-6"
                checked={live && kanaeleList.includes(k.key)}
                onCheckedChange={(v) => toggleKanal(k.key, v === true)}
                disabled={!live}
              />
              <label htmlFor={`pp-kanal-${k.key}`} className="cursor-pointer">
                {k.label}
              </label>
            </li>
          ))}
        </ul>
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground" data-testid="pp-kanal-hinweis">
          {ohneFormat.map(ohneFormatHinweis).join(" ")}
        </p>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Was könnt ihr gut?</legend>
        <p className="text-sm text-muted-foreground">Die Fähigkeiten bestimmen, welche Formate in den Plan kommen. «Text» gehört immer dazu.</p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Fähigkeiten">
          {FAEHIGKEITEN.map((f) => (
            <li key={f.key} className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={`pp-faehigkeit-${f.key}`}
                aria-label={f.label}
                className="size-6"
                checked={live && form.faehigkeiten.includes(f.key)}
                onCheckedChange={(v) => toggleFaehigkeit(f.key, v === true)}
                disabled={!live}
              />
              <label htmlFor={`pp-faehigkeit-${f.key}`} className="cursor-pointer">
                {f.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Säulen</legend>
        {profilSaeulen.namen.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Vorbelegt aus deinem Firmenprofil. Ändern kannst du sie im{" "}
              <Link href="/profil" className="underline underline-offset-4">
                Firmenprofil
              </Link>
              .{profilSaeulen.total > MAX_SAEULEN ? ` Dein Profil nennt ${profilSaeulen.total} Säulen, der Plan nimmt die ersten ${MAX_SAEULEN}.` : ""}
            </p>
            <ul aria-label="Säulen aus dem Firmenprofil" className="grid list-disc gap-1 pl-5" data-testid="pp-saeulen-profil">
              {profilSaeulen.namen.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Eine Säule ist ein Thema, auf das du immer wieder zurückkommst, zum Beispiel «Vor und nach der Arbeit». Nenne mindestens eine, bis zu {MAX_SAEULEN}. Wenn du noch
              keine hast, hilft das Werkzeug{" "}
              <Link href="/tools/content-saeulen" className="underline underline-offset-4">
                Content-Säulen
              </Link>
              .
            </p>
            <ul aria-label="Säulen eingeben" className="grid gap-3">
              {form.saeulen.map((s, i) => (
                <li key={i} className="grid gap-1.5">
                  <Label htmlFor={`pp-saeule-${i}`}>{`Säule ${i + 1}`}</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id={`pp-saeule-${i}`}
                      className="min-w-0 flex-1"
                      value={s}
                      maxLength={MAX_SAEULE}
                      onChange={(e) => setSaeule(i, e.target.value)}
                      disabled={!live}
                      aria-describedby="pp-saeulen-help"
                    />
                    {form.saeulen.length > 2 && (
                      <Button type="button" variant="ghost" size="sm" aria-label={`Säule ${i + 1} entfernen`} onClick={() => patch({ saeulen: form.saeulen.filter((_, j) => j !== i) })}>
                        Entfernen
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p id="pp-saeulen-help" className="text-sm text-muted-foreground">
              Höchstens {MAX_SAEULE} Zeichen je Säule.
            </p>
            <div>
              <Button type="button" variant="outline" size="sm" disabled={!live || form.saeulen.length >= MAX_SAEULEN} onClick={() => patch({ saeulen: [...form.saeulen, ""] })}>
                Säule hinzufügen
              </Button>
            </div>
          </>
        )}
      </fieldset>

      <details className="rounded-xl border border-line p-4" data-testid="pp-aufwand">
        <summary className="cursor-pointer font-heading font-semibold">Aufwand anpassen</summary>
        <div className="mt-4 grid gap-4">
          <p id="pp-aufwand-help" className="text-sm text-muted-foreground">
            Stunden pro Beitrag. Die Standardwerte sind eine Annahme von Alperna, keine Statistik. Überschreibe, was bei dir länger oder kürzer dauert.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {FORMATE.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`pp-aufwand-${f.key}`}>{`Aufwand: ${f.label}`}</Label>
                <Input
                  id={`pp-aufwand-${f.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0.1}
                  max={10}
                  step={0.05}
                  value={form.aufwand[f.key] ?? String(AUFWAND[f.key])}
                  onChange={(e) => setAufwand(f.key, e.target.value)}
                  disabled={!live}
                  aria-describedby="pp-aufwand-help"
                />
              </div>
            ))}
          </div>
          <div>
            <Button type="button" variant="ghost" size="sm" disabled={!live || Object.keys(form.aufwand).length === 0} onClick={() => patch({ aufwand: {} })}>
              Standardwerte
            </Button>
          </div>
        </div>
      </details>

      <p id="pp-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!live || busy}>
          Plan erstellen
        </Button>
        {zurueck && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setError(null);
              setDraft(null);
              shouldFocus.current = "heading";
              set({ v: 1, phase: "result", input: zurueck, output: buildPlan(zurueck) });
            }}
          >
            Zurück zum Plan
          </Button>
        )}
        <span className="text-sm text-muted-foreground">Dauert fünf Minuten.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <PlanFlow />
    </ToolShell>
  );
}
