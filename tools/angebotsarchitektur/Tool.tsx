"use client";

import { cn } from "cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chf, numberCH, pctCH } from "@/lib/ch";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  FAKTOREN,
  FAUSTREGEL_SATZ,
  FORMEN,
  LIMITS,
  SLUG,
  ZIELMARGE_NOTE,
  eingabeText,
  emptyState,
  formDef,
  formOf,
  isEmptyRow,
  isFormKey,
  newLeistung,
  nextLeistungId,
  parseState,
  rechnen,
  reportMarkdown,
  roundPrice,
  spanneText,
  stufenLabel,
  toDocument,
  toInput,
  validate,
  vorschauLeistungen,
  zuordnungAusForm,
  type AngebotErgebnis,
  type AngebotInput,
  type FormFields,
  type FormLeistung,
  type Stufe,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const sameForm = (a: FormFields, b: FormFields) => JSON.stringify(formOf(a)) === JSON.stringify(formOf(b));
const stundenText = (h: number) => `${numberCH(h, 2)} h`;

function Intro() {
  return (
    <>
      <p>
        Trag deine Leistungen mit Preis, Aufwand und Kosten ein. Das Werkzeug schlägt daraus drei Stufen vor: Einstieg, Kern und Premium. Du siehst die
        Preisabstände, den Deckungsbeitrag je Stufe und eine Warnung, wenn eine Marge unter deiner Zielmarge liegt. Alles rechnet in deinem Browser, ohne KI.
      </p>
      <p>
        {FAUSTREGEL_SATZ} Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können.
        Rechtliche Fragen prüft das Werkzeug nicht.
      </p>
    </>
  );
}

/** Die drei Stufen als Karten, in der Reihenfolge der Ausgabe. Der Kern trägt einen Rahmen. */
function Vergleich({ result, input }: { result: AngebotErgebnis; input: AngebotInput }) {
  const einheit = formDef(input.form).einheit;
  const max = Math.max(...result.reihenfolge.map((k) => result.stufen[k].preis));
  return (
    <ul role="list" aria-label="Vergleich der drei Stufen" data-testid="aa-vergleich" className="grid gap-3 md:grid-cols-3">
      {result.reihenfolge.map((key) => {
        const s: Stufe = result.stufen[key];
        return (
          <li
            key={key}
            data-testid={`aa-stufe-${key}`}
            className={cn("grid content-start gap-3 rounded-xl border-2 bg-paper p-4", key === "kern" ? "border-ink" : "border-line")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="mono text-xs uppercase tracking-wide text-muted-foreground">{stufenLabel(input.form, key)}</span>
              {key === "kern" && <span className="rounded-full border border-ink px-2.5 py-0.5 text-xs font-medium">Dein Kern</span>}
            </div>
            <p className="font-medium">{s.vorschlag ? "Vorschlag nach Faustregel" : s.name}</p>
            <p className="font-heading text-2xl font-medium tracking-tight">
              {chf(s.preis)}
              {einheit && <span className="text-base font-normal text-muted-foreground"> {einheit}</span>}
            </p>
            <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(4, Math.round((s.preis / max) * 100))}%` }} />
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Aufwand</dt>
              <dd className="text-right">{stundenText(s.aufwand)}</dd>
              <dt className="text-muted-foreground">Kosten</dt>
              <dd className="text-right">{chf(s.kosten)}</dd>
              <dt className="text-muted-foreground">Deckungsbeitrag</dt>
              <dd className="text-right">{chf(s.db)}</dd>
              <dt className="text-muted-foreground">Marge</dt>
              <dd className="text-right">{pctCH(s.margePct, 1)}</dd>
            </dl>
            {s.unterZiel && s.preisFuerZiel !== null ? (
              <p className="rounded-lg border border-destructive px-3 py-2 text-sm text-destructive">
                Unter deiner Zielmarge von {pctCH(input.zielmarge)}. Preis für die Zielmarge: {chf(s.preisFuerZiel)}.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Zielmarge von {pctCH(input.zielmarge)} erreicht.</p>
            )}
            {s.vorschlag && <p className="text-sm text-muted-foreground">Vorschlag, noch kein Angebot. Was müsste dieses Angebot enthalten?</p>}
          </li>
        );
      })}
    </ul>
  );
}

function ResultView({
  result,
  input,
  onEdit,
  onNew,
  headingRef,
}: {
  result: AngebotErgebnis;
  input: AngebotInput;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const doc = toDocument(result, input);
  return (
    <ResultCard
      title="Dein Angebot in drei Stufen"
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
      <p className="text-sm text-muted-foreground" data-testid="aa-richtwert">
        {FAUSTREGEL_SATZ} Die Zielmarge ist deine Annahme, kein Richtwert.
      </p>
      <Vergleich result={result} input={input} />
      <div data-testid="aa-dokument">
        <DocView blocks={doc.blocks} />
      </div>
    </ResultCard>
  );
}

type Focus = "heading" | "form" | null;

function AngebotFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const savedForm = useMemo(() => formOf(saved), [saved]);

  // Änderungen leben im Entwurf, der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<FormFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<Focus>(null);
  const form: FormFields = draft ?? savedForm;

  const savedFormRef = useRef(savedForm);
  useEffect(() => {
    savedFormRef.current = savedForm;
  }, [savedForm]);

  useEffect(() => {
    if (draft === null || sameForm(draft, savedFormRef.current)) return;
    const timer = setTimeout(() => set({ v: 1, phase: "edit", output: null, ...draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "form") document.getElementById("aa-name-1")?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const patch = (p: Partial<FormFields>) => {
    setError(null);
    setDraft({ ...form, ...p });
  };
  const patchRow = (id: string, p: Partial<FormLeistung>) => patch({ leistungen: form.leistungen.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const addRow = () => patch({ leistungen: [...form.leistungen, newLeistung(nextLeistungId(form.leistungen))] });
  const removeRow = (id: string) =>
    patch({
      leistungen: form.leistungen.filter((r) => r.id !== id),
      kern: form.kern === id ? "" : form.kern,
      einstiegId: form.einstiegId === id ? undefined : form.einstiegId,
      premiumId: form.premiumId === id ? undefined : form.premiumId,
    });
  const setKern = (id: string) =>
    patch({
      kern: id,
      einstiegId: form.einstiegId === id ? undefined : form.einstiegId,
      premiumId: form.premiumId === id ? undefined : form.premiumId,
    });

  const vorschau = vorschauLeistungen(form);
  const z = zuordnungAusForm(form);
  const kernPreis = z ? vorschau.find((l) => l.id === z.kernId)?.preis : undefined;
  const benannt = form.leistungen.filter((r) => !isEmptyRow(r) && r.name.trim() !== "");
  const optionText = (r: FormLeistung) => {
    const v = vorschau.find((l) => l.id === r.id);
    return `${r.name.trim().replace(/\s+/g, " ")}${v ? ` (${chf(v.preis)})` : ""}`;
  };
  const def = formDef(form.form);
  const zielText = (key: "einstieg" | "premium") =>
    kernPreis === undefined
      ? "Der Zielpreis erscheint, sobald ein Kern mit Preis da ist."
      : `Zielpreis nach Faustregel: ${chf(roundPrice(kernPreis * FAKTOREN[key].mittel))} (${pctCH(FAKTOREN[key].mittel * 100, 0)} vom Kern, Spanne ${spanneText(FAKTOREN[key])}). Ohne Leistung rechnet das Werkzeug einen Vorschlag.`;

  const resultInput = ready && profileReady && saved.phase === "result" && saved.output ? toInput(savedForm, profile) : null;

  async function start() {
    const problem = validate(form, profile);
    if (problem) return setError(problem);
    const input = toInput(form, profile);
    if (!input) return setError("Bitte prüfe deine Angaben und versuch es noch einmal.");
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const result = rechnen(input);
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", ...form, output: result });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(input), ausgabe: reportMarkdown(result, input) });
    } finally {
      setBusy(false);
    }
  }

  if (resultInput && saved.output) {
    return (
      <ResultView
        result={saved.output}
        input={resultInput}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "form";
          setError(null);
          setDraft(null);
          set({ ...saved, phase: "edit", output: null });
        }}
        onNew={() => {
          shouldFocus.current = "form";
          setError(null);
          setDraft(null);
          set(emptyState());
        }}
      />
    );
  }

  const canAdd = form.leistungen.length < LIMITS.leistungen.max;

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
        <ProfileFieldsForm idPrefix="aa" fields={["firma", "branche"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">Firma und Branche speichern wir in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-4" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Deine Leistungen</legend>
        <p className="text-sm text-muted-foreground">
          Trag ein bis sechs Leistungen ein, so wie du sie heute verkaufst. Der Aufwand zählt in Stunden und wird auf Viertelstunden gerundet. Zeilen ohne
          Angaben überspringt das Werkzeug. {def.hinweis}
        </p>
        <ul aria-label="Leistungen" className="grid gap-4">
          {form.leistungen.map((row, i) => {
            const n = i + 1;
            const titel = `aa-name-label-${n}`;
            return (
              <li key={row.id} className="grid gap-3 rounded-xl border border-line p-4">
                <div className="grid gap-1.5">
                  <Label id={titel} htmlFor={`aa-name-${n}`}>
                    Leistung {n}
                  </Label>
                  <Input
                    id={`aa-name-${n}`}
                    lang="de-CH"
                    value={row.name}
                    maxLength={LIMITS.name.max}
                    placeholder={def.beispiel}
                    onChange={(e) => patchRow(row.id, { name: e.target.value })}
                    disabled={!ready}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`aa-preis-${n}`} className="leading-snug">Preis in CHF</Label>
                    <Input
                      id={`aa-preis-${n}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={row.preis}
                      onChange={(e) => patchRow(row.id, { preis: e.target.value })}
                      aria-describedby={titel}
                      disabled={!ready}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`aa-aufwand-${n}`} className="leading-snug">Aufwand in Stunden</Label>
                    <Input
                      id={`aa-aufwand-${n}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.25}
                      value={row.aufwand}
                      onChange={(e) => patchRow(row.id, { aufwand: e.target.value })}
                      aria-describedby={titel}
                      disabled={!ready}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`aa-kosten-${n}`} className="leading-snug">Material und Fremdleistungen in CHF</Label>
                    <Input
                      id={`aa-kosten-${n}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={row.kosten}
                      onChange={(e) => patchRow(row.id, { kosten: e.target.value })}
                      aria-describedby={titel}
                      disabled={!ready}
                    />
                  </div>
                </div>
                <div>
                  <Button
                    id={`aa-entfernen-${n}`}
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Leistung ${n} entfernen`}
                    onClick={() => removeRow(row.id)}
                    disabled={!ready || form.leistungen.length <= 1}
                  >
                    Entfernen
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button id="aa-hinzufuegen" type="button" variant="outline" onClick={addRow} disabled={!ready || !canAdd}>
            Leistung hinzufügen
          </Button>
          {!canAdd && <span className="text-sm text-muted-foreground">Mehr als sechs Leistungen sind zu viele: Nimm die wichtigsten.</span>}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Rechnung</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="aa-satz">Interner Stundensatz in CHF</Label>
          <Input
            id="aa-satz"
            type="number"
            inputMode="decimal"
            min={LIMITS.satz.min}
            max={LIMITS.satz.max}
            step="any"
            value={form.satz}
            onChange={(e) => patch({ satz: e.target.value })}
            aria-describedby="aa-satz-help"
            required
            disabled={!ready}
          />
          <p id="aa-satz-help" className="text-sm text-muted-foreground">
            {chf(LIMITS.satz.min)} bis {chf(LIMITS.satz.max)}. 0 heisst: Die Arbeitszeit fliesst nicht in den Deckungsbeitrag ein; das Ergebnis sagt es dir.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="aa-zielmarge">Zielmarge in % vom Preis</Label>
          <Input
            id="aa-zielmarge"
            type="number"
            inputMode="decimal"
            min={LIMITS.zielmarge.min}
            max={LIMITS.zielmarge.max}
            step="any"
            value={form.zielmarge}
            onChange={(e) => patch({ zielmarge: e.target.value })}
            aria-describedby="aa-zielmarge-help"
            required
            disabled={!ready}
          />
          <p id="aa-zielmarge-help" className="text-sm text-muted-foreground">
            {ZIELMARGE_NOTE}. {pctCH(LIMITS.zielmarge.min, 0)} bis {pctCH(LIMITS.zielmarge.max, 0)}.
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Struktur</legend>
        <p className="text-sm text-muted-foreground md:col-span-2">
          {FAUSTREGEL_SATZ} Der Einstieg liegt bei {spanneText(FAKTOREN.einstieg)} vom Kern-Preis, das Premium bei {spanneText(FAKTOREN.premium)}. Gezeigt
          wird die Mitte, {pctCH(FAKTOREN.einstieg.mittel * 100, 0)} und {pctCH(FAKTOREN.premium.mittel * 100, 0)}. Wähle die Leistung, die jede Stufe trägt.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="aa-kern">Welche Leistung ist dein Kern?</Label>
          <select id="aa-kern" className={selectClass} value={z?.kernId ?? ""} onChange={(e) => setKern(e.target.value)} aria-describedby="aa-kern-help" disabled={!ready}>
            {benannt.length === 0 && <option value="">Trag zuerst Leistungen ein</option>}
            {benannt.map((r) => (
              <option key={r.id} value={r.id}>
                {optionText(r)}
              </option>
            ))}
          </select>
          <p id="aa-kern-help" className="text-sm text-muted-foreground">
            Der Kern ist der Referenzpreis. Vorgewählt ist die Leistung mit dem mittleren Preis.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="aa-form">Form</Label>
          <select
            id="aa-form"
            className={selectClass}
            value={form.form}
            onChange={(e) => {
              if (isFormKey(e.target.value)) patch({ form: e.target.value });
            }}
            aria-describedby="aa-form-help"
            disabled={!ready}
          >
            {FORMEN.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <p id="aa-form-help" className="text-sm text-muted-foreground">
            Ändert die Beschriftungen, nicht die Rechnung.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="aa-einstieg">Welche Leistung ist dein Einstieg?</Label>
          <select
            id="aa-einstieg"
            className={selectClass}
            value={z?.einstiegId ?? ""}
            onChange={(e) => patch({ einstiegId: e.target.value })}
            aria-describedby="aa-einstieg-help"
            disabled={!ready}
          >
            <option value="">Keine: Vorschlag nach Faustregel</option>
            {benannt
              .filter((r) => r.id !== z?.kernId)
              .map((r) => (
                <option key={r.id} value={r.id} disabled={r.id === z?.premiumId}>
                  {optionText(r)}
                </option>
              ))}
          </select>
          <p id="aa-einstieg-help" className="text-sm text-muted-foreground">
            {zielText("einstieg")}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="aa-premium">Welche Leistung ist dein Premium?</Label>
          <select
            id="aa-premium"
            className={selectClass}
            value={z?.premiumId ?? ""}
            onChange={(e) => patch({ premiumId: e.target.value })}
            aria-describedby="aa-premium-help"
            disabled={!ready}
          >
            <option value="">Keine: Vorschlag nach Faustregel</option>
            {benannt
              .filter((r) => r.id !== z?.kernId)
              .map((r) => (
                <option key={r.id} value={r.id} disabled={r.id === z?.einstiegId}>
                  {optionText(r)}
                </option>
              ))}
          </select>
          <p id="aa-premium-help" className="text-sm text-muted-foreground">
            {zielText("premium")}
          </p>
        </div>
        <div className="grid gap-1.5 md:col-span-2">
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox
              id="aa-anker"
              aria-label="Premium zuerst zeigen (Anker)"
              className="size-6"
              checked={ready && form.anker}
              onCheckedChange={(v) => patch({ anker: v === true })}
              disabled={!ready}
            />
            <label htmlFor="aa-anker" className="cursor-pointer">
              Premium zuerst zeigen (Anker)
            </label>
          </div>
          <p className="text-sm text-muted-foreground">Dreht die Reihenfolge in der Ausgabe: Premium steht links. Das ist eine Darstellung, keine Aussage über die Wirkung.</p>
        </div>
      </fieldset>

      <p id="aa-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
          Angebot aufbauen
        </Button>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <AngebotFlow />
    </ToolShell>
  );
}
