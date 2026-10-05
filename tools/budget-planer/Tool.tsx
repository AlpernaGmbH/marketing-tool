"use client";

import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chf, pctCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  EMPTY_FORM,
  EMPTY_STATE,
  KANAELE,
  LIMITS,
  PHASEN,
  RICHTWERT_NOTE,
  SLUG,
  START_ANTEIL_SATZ,
  ZIELE,
  budget,
  csvFilename,
  effectiveAnteil,
  effectiveKanaele,
  eingabeText,
  formFromInput,
  formProblem,
  isPhaseKey,
  kanaeleAusProfil,
  parseNumber,
  parseState,
  profilePatch,
  rahmen,
  reportMarkdown,
  toCsv,
  toDocument,
  toInput,
  type FormFields,
  type KanalKey,
  type PhaseKey,
  type ZielKey,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro({ verein }: { verein: boolean }) {
  return (
    <>
      <p>
        Gib {verein ? "das Jahresbudget deines Vereins" : "deinen Jahresumsatz"}, Phase, Ziel und den Anteil an, den du für Marketing einsetzen willst, dazu
        deine Kanäle. Der Planer rechnet daraus ein Marketing-Budget für zwölf Monate: Betrag je Kanal, getrennt in Fremdkosten und Werbebudget, eine
        Monatsübersicht und die Eigenleistung aus euren Stunden. Alles rechnet in deinem Browser, ohne KI.
      </p>
      <p>
        Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können. Die Aufteilung
        auf die Kanäle ist ein {RICHTWERT_NOTE}.
      </p>
    </>
  );
}

function BudgetFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // Änderungen am Formular leben im Entwurf, bis «Budget berechnen» ihn speichert; vorher gilt die gespeicherte Eingabe.
  const [draft, setDraft] = useState<FormFields | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  const form: FormFields = draft ?? (saved.input ? formFromInput(saved.input) : EMPTY_FORM);
  const output = ready && !editing ? saved.output : null;
  const verein = (profile.organisationstyp ?? "kmu") === "verein";

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (!shouldFocus.current || !output) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [output]);

  const patch = (p: Partial<FormFields>) => {
    setError(null);
    setDraft({ ...form, ...p });
  };

  const kanaele = effectiveKanaele(form, profile);
  const kanaeleVomProfil = form.kanaele === null && kanaeleAusProfil(profile).length > 0;
  const toggleKanal = (key: KanalKey, on: boolean) => patch({ kanaele: KANAELE.map((k) => k.key).filter((k) => (k === key ? on : kanaele.includes(k))) });

  const anteil = effectiveAnteil(form);
  const umsatz = parseNumber(form.umsatz);
  const betragJahr = umsatz !== null && !Number.isNaN(umsatz) && !Number.isNaN(anteil) && umsatz > 0 && anteil > 0 ? Math.round((umsatz * anteil) / 100) : null;
  const spanne = isPhaseKey(form.phase) ? rahmen(form.phase) : null;
  const anteilWert = form.anteil !== null ? form.anteil : Number.isNaN(anteil) ? "" : String(anteil);

  async function start() {
    const problem = formProblem(form, profile);
    if (problem) return setError(problem);
    const input = toInput(form, profile);
    if (!input) return setError("Bitte prüfe deine Angaben und versuch es noch einmal.");
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const result = budget(input);
      shouldFocus.current = true;
      set({ v: 1, input, output: result });
      setDraft(null);
      setEditing(false);
      const p = profilePatch(profile, result);
      if (Object.keys(p).length > 0) update(p);
      void ctx.sendResult({ eingabe: eingabeText(input), ausgabe: reportMarkdown(result, input) });
    } finally {
      setBusy(false);
    }
  }

  const edit = () => {
    setError(null);
    setDraft(saved.input ? formFromInput(saved.input) : EMPTY_FORM);
    setEditing(true);
  };

  const backToResult = () => {
    setError(null);
    setDraft(null);
    setEditing(false);
  };

  const restart = () => {
    setError(null);
    setDraft({ ...EMPTY_FORM });
    setEditing(false);
    set(EMPTY_STATE);
  };

  if (output && saved.input) {
    const input = saved.input;
    const doc = toDocument(output, input);
    const downloadCsv = () =>
      ctx.guardDownload(() => {
        setCsvError(null);
        try {
          downloadBytes(new TextEncoder().encode(toCsv(output)), csvFilename(input), "text/csv;charset=utf-8");
        } catch {
          setCsvError("Der CSV-Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Text.");
        }
      });
    return (
      <ResultCard
        title="Dein Marketing-Budget"
        headingRef={headingRef}
        actions={
          <>
            <DocumentExport model={doc} />
            <Button type="button" variant="outline" onClick={downloadCsv} data-umami-event="export_csv" data-umami-event-tool={ctx.slug}>
              CSV herunterladen
            </Button>
            <Button type="button" variant="outline" onClick={edit}>
              Angaben ändern
            </Button>
            <Button type="button" variant="ghost" onClick={restart}>
              Neu beginnen
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground" data-testid="bp-richtwert">
          {RICHTWERT_NOTE}: Aufteilung auf die Kanäle, Trennung in Fremdkosten und Werbebudget und der Startwert des Anteils. Das Geldbudget pro Jahr steht
          in deinem Firmenprofil, in deinem Browser, sofern dort noch kein Budget stand.
        </p>
        <div data-testid="bp-dokument">
          <DocView blocks={doc.blocks} />
        </div>
        {csvError && (
          <p role="alert" className="text-sm text-destructive">
            {csvError}
          </p>
        )}
      </ResultCard>
    );
  }

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
        <Intro verein={verein} />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">{verein ? "Dein Verein" : "Dein Betrieb"}</legend>
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="bp" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="bp" fields={["firma", "branche", "groesse"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          {verein ? "Verein, Tätigkeit und Grösse" : "Firma, Branche und Grösse"} speichern wir in deinem Firmenprofil, in deinem Browser.
        </p>
      </fieldset>

      <fieldset className="grid gap-5" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Rahmen</legend>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="bp-umsatz">{verein ? "Jahresbudget des Vereins in CHF" : "Jahresumsatz in CHF (ungefähr)"}</Label>
            <Input
              id="bp-umsatz"
              type="number"
              inputMode="numeric"
              min={LIMITS.umsatz.min}
              max={LIMITS.umsatz.max}
              step={1}
              value={form.umsatz}
              onChange={(e) => patch({ umsatz: e.target.value })}
              aria-describedby="bp-umsatz-help"
              required
              disabled={!ready}
            />
            <p id="bp-umsatz-help" className="text-sm text-muted-foreground">
              {chf(LIMITS.umsatz.min)} bis {chf(LIMITS.umsatz.max)}. Eine Schätzung reicht; die Zahl bleibt in deinem Browser und geht nur mit dem Ergebnis an
              Alperna.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bp-phase">Phase</Label>
            <select id="bp-phase" className={selectClass} value={form.phase} onChange={(e) => patch({ phase: e.target.value as PhaseKey | "" })} disabled={!ready}>
              <option value="">Bitte wählen</option>
              {PHASEN.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bp-ziel">Ziel für dieses Jahr</Label>
            <select id="bp-ziel" className={selectClass} value={form.ziel} onChange={(e) => patch({ ziel: e.target.value as ZielKey | "" })} aria-describedby="bp-ziel-help" disabled={!ready}>
              <option value="">Bitte wählen</option>
              {ZIELE.map((z) => (
                <option key={z.key} value={z.key}>
                  {z.label}
                </option>
              ))}
            </select>
            <p id="bp-ziel-help" className="text-sm text-muted-foreground">
              {spanne
                ? `Verschiebt den Anteil innerhalb der Spanne: Halten im unteren Drittel, Leicht wachsen in der Mitte, Stark wachsen im oberen Drittel (${RICHTWERT_NOTE}).`
                : "Ohne Spanne aus Daten wirkt das Ziel nur als Hinweis; den Anteil setzt du selbst."}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bp-anteil">Anteil vom Umsatz in %</Label>
            <Input
              id="bp-anteil"
              type="number"
              inputMode="decimal"
              min={LIMITS.anteil.min}
              max={LIMITS.anteil.max}
              step={LIMITS.anteil.step}
              value={anteilWert}
              onChange={(e) => patch({ anteil: e.target.value })}
              aria-describedby="bp-anteil-help bp-betrag"
              required
              disabled={!ready}
            />
            <p id="bp-anteil-help" className="text-sm text-muted-foreground">
              {spanne
                ? `Vorbelegt aus der Spanne ${pctCH(spanne.min)} bis ${pctCH(spanne.max)} (Quelle: ${spanne.source}) und deinem Ziel. ${pctCH(LIMITS.anteil.min)} bis ${pctCH(LIMITS.anteil.max)}, Schritt ${pctCH(LIMITS.anteil.step)}.`
                : `${START_ANTEIL_SATZ} ${pctCH(LIMITS.anteil.min)} bis ${pctCH(LIMITS.anteil.max)}, Schritt ${pctCH(LIMITS.anteil.step)}.`}
            </p>
            <p id="bp-betrag" aria-live="polite" className="mono text-sm" data-testid="bp-betrag">
              {betragJahr !== null ? `Das sind ${chf(betragJahr)} im Jahr, ${chf(Math.round(betragJahr / 12))} pro Monat.` : "Der Betrag erscheint, sobald Umsatz und Anteil da sind."}
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Kanäle</legend>
        <p className="text-sm text-muted-foreground">
          {kanaeleVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : ""}Wähle nur Kanäle, die ihr in diesem Jahr wirklich bedient; jeder gewählte Kanal bekommt einen
          Teil des Budgets.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kanäle">
          {KANAELE.map((k) => (
            <li key={k.key} className="flex min-h-11 items-center gap-3">
              <Checkbox id={`bp-kanal-${k.key}`} aria-label={k.label} className="size-6" checked={ready && kanaele.includes(k.key)} onCheckedChange={(v) => toggleKanal(k.key, v === true)} disabled={!ready} />
              <label htmlFor={`bp-kanal-${k.key}`} className="cursor-pointer">
                {k.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Eigenleistung (freiwillig)</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="bp-stunden">Stunden pro Monat, die ihr selbst für Marketing einsetzt</Label>
          <Input
            id="bp-stunden"
            type="number"
            inputMode="decimal"
            min={LIMITS.stunden.min}
            max={LIMITS.stunden.max}
            step={0.5}
            value={form.stunden}
            onChange={(e) => patch({ stunden: e.target.value })}
            aria-describedby="bp-stunden-help"
            disabled={!ready}
          />
          <p id="bp-stunden-help" className="text-sm text-muted-foreground">
            {LIMITS.stunden.min} bis {LIMITS.stunden.max}. Beiträge, Fotos, Newsletter, Gespräche mit Partnern.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bp-stundensatz">Interner Stundensatz in CHF</Label>
          <Input
            id="bp-stundensatz"
            type="number"
            inputMode="numeric"
            min={LIMITS.stundensatz.min}
            max={LIMITS.stundensatz.max}
            step={1}
            value={form.stundensatz}
            onChange={(e) => patch({ stundensatz: e.target.value })}
            aria-describedby="bp-stundensatz-help"
            disabled={!ready}
          />
          <p id="bp-stundensatz-help" className="text-sm text-muted-foreground">
            Leer lassen, wenn du ihn nicht kennst. Die Eigenleistung ist Information, nicht Teil des Geldbudgets.
          </p>
        </div>
      </fieldset>

      <p id="bp-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
          Budget berechnen
        </Button>
        {editing && saved.output && (
          <Button type="button" variant="ghost" onClick={backToResult} disabled={busy}>
            Zurück zum Ergebnis
          </Button>
        )}
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <BudgetFlow />
    </ToolShell>
  );
}
