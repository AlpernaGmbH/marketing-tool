"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  ANDERE,
  ANNAHME_NOTE,
  EMPTY_STATE,
  KANAELE,
  LIMITS,
  SLUG,
  ZEITRAEUME,
  artDef,
  artenFuer,
  auswerten,
  baumModell,
  csvFilename,
  documentParts,
  eingabeText,
  emptyKpi,
  emptyMarketingZiel,
  heuteIso,
  hinweisOben,
  kpiDef,
  kpisFuer,
  parseState,
  reportMarkdown,
  rueckwaertsGilt,
  toCsv,
  toDocument,
  treeSvg,
  validate,
  type ArtKey,
  type BaumKnoten,
  type Ergebnis,
  type FormState,
  type KanalKey,
  type KpiBaumState,
  type KpiForm,
  type KpiKey,
  type MarketingZielForm,
  type Output,
  type Typ,
  type ZeitraumKey,
  type ZielForm,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro() {
  return (
    <>
      <p>
        Gib dein Unternehmensziel als Zahl an und bis wann du es erreichen willst. Dazu bis zu drei Marketingziele mit je einer oder zwei Kennzahlen (KPI). Das
        Werkzeug macht daraus einen Baum, prüft jedes Marketingziel auf «spezifisch», «messbar» und «terminiert», rechnet bei Aufträgen und neuer Kundschaft
        rückwärts bis zu den nötigen Anfragen und liefert einen Messplan mit einer CSV-Vorlage für die monatliche Erfassung.
      </p>
      <p>
        Alles rechnet in deinem Browser, ohne KI. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können. Die Quoten der Rückwärtsrechnung sind Annahmen von dir, keine Statistik.
      </p>
    </>
  );
}

function Zeile({ n }: { n: BaumKnoten }) {
  return (
    <>
      <strong className="font-medium">{n.titel}:</strong> {n.text}
      {n.detail && <span className="text-muted-foreground"> ({n.detail})</span>}
    </>
  );
}

// ---- Ergebnis ----------------------------------------------------------------------------------

function ResultView({ e, headingRef, onEdit, onNew }: { e: Ergebnis; headingRef: React.Ref<HTMLHeadingElement>; onEdit: () => void; onNew: () => void }) {
  const ctx = useToolContext();
  const [csvError, setCsvError] = useState<string | null>(null);
  const doc = toDocument(e);
  const { kopf, rest } = documentParts(e);
  const hinweis = hinweisOben(e);
  const modell = baumModell(e);
  const svg = treeSvg(modell);

  const downloadCsv = () =>
    ctx.guardDownload(() => {
      setCsvError(null);
      try {
        downloadBytes(new TextEncoder().encode(toCsv(e)), csvFilename(e.kontext.firma), "text/csv;charset=utf-8");
      } catch {
        setCsvError("Der CSV-Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Text.");
      }
    });

  return (
    <ResultCard
      title="Dein Ziel- und KPI-Baum"
      headingRef={headingRef}
      actions={
        <>
          <DocumentExport model={doc} />
          <Button type="button" variant="outline" onClick={downloadCsv} data-umami-event="export_csv" data-umami-event-tool={ctx.slug}>
            CSV-Vorlage herunterladen
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
      {hinweis && (
        <p role="status" data-testid="kb-hinweis" className="rounded-xl border border-ink bg-surface px-4 py-3 font-medium">
          {hinweis}
        </p>
      )}
      <div data-testid="kb-kopf">
        <DocView blocks={hinweis ? kopf.slice(1) : kopf} />
      </div>

      <section aria-labelledby="kb-baum-titel" className="grid gap-3" data-testid="kb-baum">
        <h4 id="kb-baum-titel" className="font-heading text-lg font-medium">
          Der Baum
        </h4>
        {/* Die Grafik gibt es ab 768 Pixel Breite, dort ist die Schrift gross genug. Darunter steht nur die Liste. */}
        <div className="hidden md:block" data-testid="kb-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        <ul aria-label="Der Baum als Liste" data-testid="kb-baum-liste" className="grid list-disc gap-2 pl-5">
          <li>
            <Zeile n={modell.ziel} />
            {modell.ziele.length > 0 && (
              <ul aria-label="Marketingziele" className="mt-2 grid list-disc gap-2 pl-5">
                {modell.ziele.map((z) => (
                  <li key={z.titel}>
                    <Zeile n={z} />
                    {z.kpis.length > 0 && (
                      <ul aria-label={`Kennzahlen zu ${z.titel}`} className="mt-2 grid list-disc gap-1.5 pl-5">
                        {z.kpis.map((k, i) => (
                          <li key={i}>
                            <Zeile n={k} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>
      </section>

      <div data-testid="kb-dokument">
        <DocView blocks={rest} />
      </div>
      {csvError && (
        <p role="alert" className="text-sm text-destructive">
          {csvError}
        </p>
      )}
    </ResultCard>
  );
}

// ---- Formular ----------------------------------------------------------------------------------

function KpiFelder({
  gi,
  ki,
  k,
  typ,
  canRemove,
  onChange,
  onRemove,
}: {
  gi: number;
  ki: number;
  k: KpiForm;
  typ: Typ;
  canRemove: boolean;
  onChange: (p: Partial<KpiForm>) => void;
  onRemove: () => void;
}) {
  const id = (f: string) => `kb-z${gi}-k${ki}-${f}`;
  const def = k.kpi ? kpiDef(k.kpi) : undefined;
  const erlaubt = kpisFuer(typ);
  const kpiValue = erlaubt.some((d) => d.key === k.kpi) ? k.kpi : "";
  const quelleValue = k.quelle === ANDERE ? ANDERE : def?.quellen.includes(k.quelle) ? k.quelle : "";

  return (
    <fieldset className="min-w-0 grid gap-4 rounded-xl bg-surface p-4 md:grid-cols-2">
      <legend className="px-2 font-medium">
        Marketingziel {gi}, Kennzahl {ki}
      </legend>
      <div className="grid gap-1.5">
        <Label htmlFor={id("kpi")}>Kennzahl</Label>
        <select
          id={id("kpi")}
          className={selectClass}
          value={kpiValue}
          onChange={(e) => onChange({ kpi: e.target.value as KpiKey | "", quelle: "", andere: "" })}
        >
          <option value="">Bitte wählen</option>
          {erlaubt.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("zielwert")}>Zielwert</Label>
        <Input
          id={id("zielwert")}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={k.zielwert}
          onChange={(e) => onChange({ zielwert: e.target.value })}
          aria-describedby={id("zielwert-hilfe")}
        />
        <p id={id("zielwert-hilfe")} className="text-sm text-muted-foreground">
          Eine Zahl über 0. Leer lassen, wenn du ihn noch nicht kennst.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("zeitraum")}>Zeitraum</Label>
        <select id={id("zeitraum")} className={selectClass} value={k.zeitraum} onChange={(e) => onChange({ zeitraum: e.target.value as ZeitraumKey })}>
          {ZEITRAEUME.map((z) => (
            <option key={z.key} value={z.key}>
              {z.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("quelle")}>Messquelle</Label>
        <select id={id("quelle")} className={selectClass} value={quelleValue} disabled={!def} onChange={(e) => onChange({ quelle: e.target.value })}>
          <option value="">{def ? "Bitte wählen" : "Wähl zuerst die Kennzahl"}</option>
          {def?.quellen.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
          {def && <option value={ANDERE}>Andere</option>}
        </select>
      </div>
      {quelleValue === ANDERE && (
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor={id("andere")}>Eigene Messquelle</Label>
          <Input
            id={id("andere")}
            value={k.andere}
            maxLength={LIMITS.andereMax}
            onChange={(e) => onChange({ andere: e.target.value })}
            aria-describedby={id("andere-hilfe")}
          />
          <p id={id("andere-hilfe")} className="text-sm text-muted-foreground">
            Wo holst du die Zahl, und wer notiert sie? Bis {LIMITS.andereMax} Zeichen.
          </p>
        </div>
      )}
      {canRemove && (
        <div className="md:col-span-2">
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Entfernen: Kennzahl ${ki} von Marketingziel ${gi}`}>
            Entfernen
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function MarketingZielFelder({
  gi,
  z,
  typ,
  canRemove,
  onChange,
  onRemove,
}: {
  gi: number;
  z: MarketingZielForm;
  typ: Typ;
  canRemove: boolean;
  onChange: (p: Partial<MarketingZielForm>) => void;
  onRemove: () => void;
}) {
  const id = (f: string) => `kb-z${gi}-${f}`;
  const setKpi = (ki: number, p: Partial<KpiForm>) => onChange({ kpis: z.kpis.map((k, n) => (n === ki ? { ...k, ...p } : k)) });
  const len = z.text.trim().length;

  return (
    <fieldset className="min-w-0 grid gap-4 rounded-xl border border-line p-4">
      <legend className="px-2 font-heading font-semibold">Marketingziel {gi}</legend>
      <div className="grid gap-1.5">
        <Label htmlFor={id("text")}>Marketingziel {gi}</Label>
        <Input
          id={id("text")}
          value={z.text}
          maxLength={LIMITS.textMax}
          placeholder={typ === "verein" ? "Mehr Mitglieder über Instagram" : "Mehr Anfragen über Google"}
          onChange={(e) => onChange({ text: e.target.value })}
          aria-describedby={id("text-hilfe")}
          lang="de-CH"
        />
        <p id={id("text-hilfe")} className="text-sm text-muted-foreground">
          {len} von {LIMITS.textMax} Zeichen. Schreib mindestens {LIMITS.textMin}, damit der SMART-Check «spezifisch» erfüllt ist.
        </p>
      </div>
      <div className="grid gap-1.5 md:max-w-sm">
        <Label htmlFor={id("kanal")}>Kanal</Label>
        <select id={id("kanal")} className={selectClass} value={z.kanal} onChange={(e) => onChange({ kanal: e.target.value as KanalKey | "" })}>
          <option value="">Bitte wählen</option>
          {KANAELE.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {z.kpis.map((k, ki) => (
        <KpiFelder
          key={ki}
          gi={gi}
          ki={ki + 1}
          k={k}
          typ={typ}
          canRemove={z.kpis.length > 1}
          onChange={(p) => setKpi(ki, p)}
          onRemove={() => onChange({ kpis: z.kpis.filter((_, n) => n !== ki) })}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {z.kpis.length < LIMITS.maxKpis && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ kpis: [...z.kpis, emptyKpi()] })} aria-label={`Kennzahl hinzufügen (Marketingziel ${gi})`}>
            Kennzahl hinzufügen
          </Button>
        )}
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Entfernen: Marketingziel ${gi}`}>
            Entfernen
          </Button>
        )}
      </div>
    </fieldset>
  );
}

function QuoteSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="leading-snug">
        {label}
      </Label>
      <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Bitte wählen</option>
        {Array.from({ length: LIMITS.quoteMax + 1 }, (_, n) => (
          <option key={n} value={String(n)}>
            {n} von 10
          </option>
        ))}
      </select>
    </div>
  );
}

// ---- Ablauf ------------------------------------------------------------------------------------

function KpiBaumFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const typ: Typ = profile.organisationstyp === "verein" ? "verein" : "kmu";
  const { value: saved, ready, set } = useLocalJson<KpiBaumState>(`mt:${SLUG}`, parseState);

  // Der Entwurf lebt im Formular; der Speicher folgt mit etwas Verzögerung, nicht bei jedem Tastendruck.
  const [draft, setDraft] = useState<FormState | null>(null);
  const form: FormState = draft ?? { ziel: saved.ziel, ziele: saved.ziele, rueckwaerts: saved.rueckwaerts };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const artRef = useRef<HTMLSelectElement>(null);
  const shouldFocus = useRef<"heading" | "form" | null>(null);

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => set({ v: 1, phase: "edit", ...draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "form") artRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const ergebnis = useMemo(
    () =>
      saved.phase === "result" && saved.output
        ? auswerten(saved, { heute: saved.output.datum, typ: saved.output.typ, firma: saved.output.firma, branche: saved.output.branche })
        : null,
    [saved],
  );

  const patch = (next: FormState) => {
    setError(null);
    setDraft(next);
  };
  const setZiel = (p: Partial<ZielForm>) => patch({ ...form, ziel: { ...form.ziel, ...p } });
  const setMz = (i: number, p: Partial<MarketingZielForm>) => patch({ ...form, ziele: form.ziele.map((z, n) => (n === i ? { ...z, ...p } : z)) });

  async function start() {
    const heute = heuteIso(new Date());
    const problem = validate(form, typ, heute);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const output: Output = { datum: heute, typ, firma: profile.firma?.trim() ?? "", branche: profile.branche?.trim() ?? "" };
      const e = auswerten(form, { heute, typ, firma: output.firma, branche: output.branche });
      if (!e) return setError("Bitte prüfe deine Angaben und versuch es noch einmal.");
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", ...form, output });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(e), ausgabe: reportMarkdown(e) });
    } finally {
      setBusy(false);
    }
  }

  if (ready && ergebnis) {
    return (
      <ResultView
        e={ergebnis}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "form";
          setError(null);
          setDraft(null);
          set({ v: 1, phase: "edit", ziel: saved.ziel, ziele: saved.ziele, rueckwaerts: saved.rueckwaerts });
        }}
        onNew={() => {
          shouldFocus.current = "form";
          setError(null);
          setDraft(null);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const verein = typ === "verein";
  const off = !ready || !profileReady || busy;
  const arten = artenFuer(typ);
  const artValue: ArtKey | "" = arten.some((a) => a.key === form.ziel.art) ? form.ziel.art : "";
  const art = artValue ? artDef(artValue) : undefined;
  const nurEineQuote = rueckwaertsGilt(artValue) && [form.rueckwaerts.anfragenZuOfferten, form.rueckwaerts.offertenZuAuftraegen].filter((v) => v !== "").length === 1;

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

      <fieldset className="min-w-0 grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={off}>
        <legend className="px-2 font-heading font-semibold">{verein ? "Dein Verein" : "Dein Betrieb"}</legend>
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="kb" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="kb" fields={["firma", "branche"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          {verein ? "Verein und Tätigkeit" : "Firma und Branche"} speichern wir in deinem Firmenprofil, in deinem Browser.
        </p>
      </fieldset>

      <fieldset className="min-w-0 grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={off}>
        <legend className="px-2 font-heading font-semibold">1. Unternehmensziel</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="kb-art">Was willst du erreichen?</Label>
          <select
            id="kb-art"
            ref={artRef}
            className={selectClass}
            value={artValue}
            onChange={(e) => setZiel({ art: e.target.value as ArtKey | "" })}
          >
            <option value="">Bitte wählen</option>
            {arten.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kb-zielwert">Zielwert</Label>
          <Input
            id="kb-zielwert"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.ziel.zielwert}
            onChange={(e) => setZiel({ zielwert: e.target.value })}
            aria-describedby="kb-zielwert-hilfe"
            required
          />
          <p id="kb-zielwert-hilfe" className="text-sm text-muted-foreground">
            {art?.key === "umsatz" ? "In Franken, zum Beispiel 500000." : "Die Zahl, die du am Ende erreicht haben willst, nicht der Zuwachs."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kb-ausgang">Wo stehst du heute?</Label>
          <Input
            id="kb-ausgang"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.ziel.ausgangswert}
            onChange={(e) => setZiel({ ausgangswert: e.target.value })}
            aria-describedby="kb-ausgang-hilfe"
          />
          <p id="kb-ausgang-hilfe" className="text-sm text-muted-foreground">
            Freiwillig, zum Beispiel die Aufträge, die du dieses Jahr schon hast. Leer heisst 0.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kb-ende">Bis wann?</Label>
          <Input id="kb-ende" type="date" value={form.ziel.ende} onChange={(e) => setZiel({ ende: e.target.value })} aria-describedby="kb-ende-hilfe" required />
          <p id="kb-ende-hilfe" className="text-sm text-muted-foreground">
            Ein angebrochener Monat zählt für die Rechnung voll.
          </p>
        </div>
      </fieldset>

      <fieldset className="min-w-0 grid gap-4" disabled={off}>
        <legend className="mb-1 font-heading font-semibold">2. Marketingziele (bis {LIMITS.maxZiele})</legend>
        {form.ziele.map((z, i) => (
          <MarketingZielFelder
            key={i}
            gi={i + 1}
            z={z}
            typ={typ}
            canRemove={form.ziele.length > 1}
            onChange={(p) => setMz(i, p)}
            onRemove={() => patch({ ...form, ziele: form.ziele.filter((_, n) => n !== i) })}
          />
        ))}
        {form.ziele.length < LIMITS.maxZiele && (
          <div>
            <Button type="button" variant="outline" onClick={() => patch({ ...form, ziele: [...form.ziele, emptyMarketingZiel()] })}>
              Marketingziel hinzufügen
            </Button>
          </div>
        )}
      </fieldset>

      {rueckwaertsGilt(artValue) && (
        <fieldset className="min-w-0 grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={off}>
          <legend className="px-2 font-heading font-semibold">3. Rückwärtsrechnung (freiwillig)</legend>
          <QuoteSelect
            id="kb-q-offerten"
            label="Wie viele von 10 Anfragen werden zu Offerten?"
            value={form.rueckwaerts.anfragenZuOfferten}
            onChange={(v) => patch({ ...form, rueckwaerts: { ...form.rueckwaerts, anfragenZuOfferten: v } })}
          />
          <QuoteSelect
            id="kb-q-auftraege"
            label="Wie viele von 10 Offerten werden zu Aufträgen?"
            value={form.rueckwaerts.offertenZuAuftraegen}
            onChange={(v) => patch({ ...form, rueckwaerts: { ...form.rueckwaerts, offertenZuAuftraegen: v } })}
          />
          <p className="text-sm text-muted-foreground md:col-span-2">
            {ANNAHME_NOTE} Schätze nach deinen letzten Monaten. Mit beiden Angaben rechnet das Werkzeug aus, wie viele Offerten und Anfragen es braucht.
          </p>
          {nurEineQuote && (
            <p role="status" className="text-sm md:col-span-2">
              Für die Rückwärtsrechnung brauchst du beide Angaben.
            </p>
          )}
        </fieldset>
      )}

      <p id="kb-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={off}>
          Baum erstellen
        </Button>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <KpiBaumFlow />
    </ToolShell>
  );
}
