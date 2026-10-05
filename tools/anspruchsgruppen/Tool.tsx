"use client";

import { cn } from "cn";
import { useEffect, useMemo, useRef, useState } from "react";
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
  ADD_BUTTON_ID,
  BEZIEHUNGEN,
  LIMITS,
  MATRIX,
  MAX_GRUPPEN,
  QUADRANT_INFO,
  RICHTWERT_NOTE,
  SCHWELLE,
  SKALA,
  SLUG,
  STRATEGIEN,
  analysiere,
  aufTyp,
  ausgabeText,
  eingabeText,
  emptyState,
  feldId,
  formProblem,
  matrixLayout,
  neueGruppe,
  parseState,
  planFuer,
  setzePlanFeld,
  strategieSlug,
  toDocument,
  typWechselHinweis,
  vorlage,
  zusammenfassung,
  type AgState,
  type Analyse,
  type Beziehung,
  type Gruppe,
  type GruppenFeld,
  type PlanEintrag,
  type PlanFeld,
  type Problem,
  type Strategie,
  type Typ,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** Auf dem Desktop stehen die vier Karten wie die Quadranten der Matrix; auf dem Handy in der Reihenfolge der Wichtigkeit. */
const KARTEN_REIHENFOLGE: Record<Strategie, string> = {
  "eng einbinden": "md:order-2",
  zufriedenstellen: "md:order-1",
  informieren: "md:order-4",
  beobachten: "md:order-3",
};

function Intro() {
  return (
    <>
      <p>
        Trag ein, welche Gruppen für dich zählen, und bewerte jede nach Interesse und Einfluss. Daraus entstehen eine Matrix, eine Strategie je Quadrant und
        ein Kommunikationsplan. Die Vorlage passt zu Verein oder Betrieb; streich, was nicht passt, und füge eigene Gruppen hinzu (bis zu {MAX_GRUPPEN}).
        Trag Gruppen ein, keine einzelnen Personen mit Namen.
      </p>
      <p>
        Alles rechnet in deinem Browser, ohne KI. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei
        Fragen weiterhelfen können. Die Grenze zwischen «hoch» und «tiefer» (ab {SCHWELLE} von 5) und die Vorschläge für Kanal und Rhythmus sind ein{" "}
        {RICHTWERT_NOTE}.
      </p>
    </>
  );
}

// ---- Formular ----------------------------------------------------------------------------------

function GruppenKarte({
  gruppe,
  index,
  disabled,
  invalidId,
  onChange,
  onRemove,
}: {
  gruppe: Gruppe;
  index: number;
  disabled: boolean;
  invalidId: string | undefined;
  onChange: (patch: Partial<Gruppe>) => void;
  onRemove: () => void;
}) {
  const nr = index + 1;
  const name = gruppe.name.trim() || `Gruppe ${nr}`;
  const id = (f: GruppenFeld) => feldId(gruppe.id, f);
  const invalid = (f: GruppenFeld) => invalidId === id(f);
  const wert = (v: number) => (v === 0 ? "" : String(v));
  const setWert = (key: "interesse" | "einfluss", raw: string) => onChange({ [key]: raw === "" ? 0 : Number(raw) });

  return (
    <li className="grid gap-4 rounded-xl border border-line p-4" data-testid={`gruppe-${nr}`}>
      <div className="flex items-end gap-3">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor={id("name")}>Gruppe</Label>
          <Input
            id={id("name")}
            aria-label={`Gruppe ${nr}`}
            maxLength={LIMITS.name}
            autoComplete="off"
            value={gruppe.name}
            disabled={disabled}
            aria-invalid={invalid("name")}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <Button type="button" variant="ghost" aria-label={`Entfernen: ${name}`} disabled={disabled} onClick={onRemove}>
          Entfernen
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(["interesse", "einfluss"] as const).map((key) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={id(key)}>{key === "interesse" ? "Interesse" : "Einfluss"}</Label>
            <select
              id={id(key)}
              className={selectClass}
              aria-label={`${key === "interesse" ? "Interesse" : "Einfluss"}: ${name}`}
              aria-describedby="ag-hilfe"
              value={wert(gruppe[key])}
              disabled={disabled}
              aria-invalid={invalid(key)}
              onChange={(e) => setWert(key, e.target.value)}
            >
              <option value="">Bitte wählen</option>
              {SKALA.map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 (gering)" : n === 5 ? "5 (hoch)" : String(n)}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="col-span-2 grid gap-1.5 sm:col-span-1">
          <Label htmlFor={id("beziehung")}>Beziehung</Label>
          <select
            id={id("beziehung")}
            className={selectClass}
            aria-label={`Beziehung: ${name}`}
            value={gruppe.beziehung}
            disabled={disabled}
            aria-invalid={invalid("beziehung")}
            onChange={(e) => onChange({ beziehung: (e.target.value || "") as Beziehung | "" })}
          >
            <option value="">Bitte wählen</option>
            {BEZIEHUNGEN.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("erwartung")}>Was sie erwartet</Label>
          <Textarea
            id={id("erwartung")}
            aria-label={`Was sie erwartet: ${name}`}
            className="min-h-16"
            rows={2}
            maxLength={LIMITS.text}
            value={gruppe.erwartung}
            disabled={disabled}
            aria-invalid={invalid("erwartung")}
            onChange={(e) => onChange({ erwartung: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("bedarf")}>Was wir von ihr brauchen</Label>
          <Textarea
            id={id("bedarf")}
            aria-label={`Was wir von ihr brauchen: ${name}`}
            className="min-h-16"
            rows={2}
            maxLength={LIMITS.text}
            value={gruppe.bedarf}
            disabled={disabled}
            aria-invalid={invalid("bedarf")}
            onChange={(e) => onChange({ bedarf: e.target.value })}
          />
        </div>
      </div>
    </li>
  );
}

// ---- Ergebnis ----------------------------------------------------------------------------------

function Matrix({ analyse }: { analyse: Analyse }) {
  const L = useMemo(() => matrixLayout(analyse.gruppen), [analyse]);
  const { plot } = L;
  return (
    <figure className="grid gap-3">
      <svg
        viewBox={`0 0 ${L.width} ${L.height}`}
        role="img"
        aria-label="Matrix Einfluss und Interesse"
        aria-describedby="ag-lage"
        data-testid="ag-matrix"
        className="h-auto w-full max-w-xl"
      >
        {L.quadranten.map((q) => (
          <g key={q.strategie}>
            <rect x={q.x} y={q.y} width={q.w} height={q.h} className={cn("stroke-line-strong", q.strategie === "eng einbinden" ? "fill-surface" : "fill-paper")} />
            <text x={q.textX} y={q.textY} textAnchor={q.anker} fontSize={12} className="fill-muted-foreground">
              {q.strategie}
            </text>
          </g>
        ))}
        {L.ticksX.map((t) => (
          <text key={`x${t.wert}`} x={t.x} y={plot.y + plot.h + 16} textAnchor="middle" fontSize={12} className="fill-muted-foreground">
            {t.wert}
          </text>
        ))}
        {L.ticksY.map((t) => (
          <text key={`y${t.wert}`} x={plot.x - 8} y={t.y + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground">
            {t.wert}
          </text>
        ))}
        <text x={plot.x + plot.w / 2} y={plot.y + plot.h + 38} textAnchor="middle" fontSize={13} fontWeight={600} className="fill-ink">
          Interesse
        </text>
        <text
          x={12}
          y={plot.y + plot.h / 2}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          transform={`rotate(-90 12 ${plot.y + plot.h / 2})`}
          className="fill-ink"
        >
          Einfluss
        </text>
        {L.punkte.map((p) => (
          <g key={p.id}>
            <circle cx={p.cx} cy={p.cy} r={MATRIX.r} className="fill-ink" />
            <text x={p.cx} y={p.cy} dy="0.35em" textAnchor="middle" fontSize={12} fontWeight={600} className="fill-paper">
              {p.nr}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="text-sm text-muted-foreground">Die Zahl im Kreis gehört zur Gruppe in der Liste. 1 heisst gering, 5 heisst hoch.</figcaption>
      <ol id="ag-lage" aria-label="Lage der Gruppen" data-testid="ag-lage" className="grid gap-1 text-sm sm:grid-cols-2">
        {analyse.gruppen.map((g) => (
          <li key={g.id}>
            <span className="mono font-medium">{g.nr}</span> {g.name}: Interesse {g.interesse}, Einfluss {g.einfluss}
          </li>
        ))}
      </ol>
    </figure>
  );
}

function QuadrantKarten({ analyse }: { analyse: Analyse }) {
  return (
    <ul aria-label="Strategie je Quadrant" className="grid gap-3 md:grid-cols-2">
      {STRATEGIEN.map((s) => {
        const info = QUADRANT_INFO[s];
        const gruppen = analyse.je[s];
        const headingId = `ag-q-${strategieSlug(s)}`;
        return (
          <li
            key={s}
            aria-labelledby={headingId}
            data-testid={`quadrant-${strategieSlug(s)}`}
            className={cn("grid content-start gap-2 rounded-xl border border-line p-4", KARTEN_REIHENFOLGE[s], s === "eng einbinden" && "bg-surface")}
          >
            <h4 id={headingId} className="font-heading text-base font-semibold">
              {info.titel}
            </h4>
            <p className="text-sm text-muted-foreground">{info.lage}</p>
            <p className="text-sm">{info.text}</p>
            {gruppen.length > 0 ? (
              <ul aria-label={`Gruppen: ${info.titel}`} className="grid gap-1 text-sm">
                {gruppen.map((g) => (
                  <li key={g.id}>
                    <span className="mono font-medium">{g.nr}</span> {g.name}
                    {g.hinweis && <span className="ml-2 rounded-full border border-ink px-2 py-0.5 text-xs font-medium">{g.hinweis}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Keine Gruppe in diesem Quadranten.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PlanTabelle({ analyse, plan, onChange }: { analyse: Analyse; plan: PlanEintrag[]; onChange: (id: string, feld: PlanFeld, wert: string) => void }) {
  const feld = (p: PlanEintrag, name: string, key: PlanFeld, label: string, placeholder?: string) => (
    <Input
      id={`ag-plan-${p.id}-${key}`}
      aria-label={`${name}: ${label}`}
      className="min-w-40"
      maxLength={LIMITS.plan}
      placeholder={placeholder}
      value={p[key]}
      onChange={(e) => onChange(p.id, key, e.target.value)}
    />
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="ag-plan">
        <caption className="sr-only">Kommunikationsplan</caption>
        <thead>
          <tr>
            {["Gruppe", "Quadrant", "Strategie", "Kanal", "Rhythmus", "Verantwortlich"].map((h) => (
              <th key={h} scope="col" className="border-b border-ink py-2 pr-3 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.map((p, i) => {
            const g = analyse.gruppen[i];
            return (
              <tr key={p.id} data-testid={`plan-${p.id}`}>
                <th scope="row" className="border-b border-line py-2 pr-3 text-left align-top font-medium">
                  {g.name}
                </th>
                <td className="border-b border-line py-2 pr-3 align-top">{QUADRANT_INFO[g.strategie].lage}</td>
                <td className="border-b border-line py-2 pr-3 align-top whitespace-nowrap">{g.strategie}</td>
                <td className="border-b border-line py-2 pr-3 align-top">{feld(p, g.name, "kanal", "Kanal")}</td>
                <td className="border-b border-line py-2 pr-3 align-top">{feld(p, g.name, "rhythmus", "Rhythmus")}</td>
                <td className="border-b border-line py-2 pr-3 align-top">{feld(p, g.name, "verantwortlich", "Verantwortlich", "Name")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Ergebnis({
  state,
  analyse,
  firma,
  onPlan,
  onEdit,
  onNew,
  headingRef,
}: {
  state: AgState;
  analyse: Analyse;
  firma: string;
  onPlan: (plan: PlanEintrag[]) => void;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const plan = useMemo(() => planFuer(analyse.gruppen, state.plan), [analyse, state.plan]);
  const doc = useMemo(() => toDocument(analyse, plan, { firma, typ: state.typ }), [analyse, plan, firma, state.typ]);

  return (
    <ResultCard
      title="Deine Anspruchsgruppen"
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
      <p data-testid="ag-zusammenfassung">{zusammenfassung(analyse)}</p>
      <p className="text-sm text-muted-foreground" data-testid="ag-richtwert">
        {RICHTWERT_NOTE}: Die Grenze zwischen hoch und tiefer liegt bei {SCHWELLE} von 5, Kanal und Rhythmus sind Vorschläge je Quadrant. Pass sie in der
        Tabelle an eure Lage an.
      </p>

      <Matrix analyse={analyse} />
      <QuadrantKarten analyse={analyse} />

      <section aria-labelledby="ag-plan-titel" className="grid gap-3">
        <h4 id="ag-plan-titel" className="font-heading text-base font-semibold">
          Kommunikationsplan
        </h4>
        <p className="text-sm text-muted-foreground">Trag ein, wer die Gruppe betreut. Änderungen erscheinen in Text, PDF und Word.</p>
        <PlanTabelle analyse={analyse} plan={plan} onChange={(id, feld, wert) => onPlan(setzePlanFeld(plan, id, feld, wert))} />
      </section>

      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer py-2.5 font-medium">Dokument ansehen (so erscheint es in PDF und Word)</summary>
        <div className="mt-4" data-testid="ag-dokument">
          <DocView blocks={doc.blocks} />
        </div>
      </details>
    </ResultCard>
  );
}

// ---- Ablauf ------------------------------------------------------------------------------------

function AnspruchsgruppenFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusId = useRef<string | null>(null);
  const focusHeading = useRef(false);

  const profilTyp: Typ = profile.organisationstyp === "verein" ? "verein" : "kmu";
  const loaded = ready && profileReady;
  const state = useMemo(() => (loaded ? aufTyp(saved, profilTyp) : saved), [loaded, saved, profilTyp]);
  const gruppen = state.gruppen;
  const verein = profilTyp === "verein";
  const firma = (profile.firma ?? "").trim();
  const analyse = useMemo(() => (state.phase === "result" ? analysiere(state.gruppen) : null), [state.phase, state.gruppen]);

  // Fokus nach einer Aktion des Besuchers (neue Karte, Meldung, Ergebnis), nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (focusId.current) {
      document.getElementById(focusId.current)?.focus();
      focusId.current = null;
    }
    if (focusHeading.current && analyse) {
      headingRef.current?.focus();
      focusHeading.current = false;
    }
  });

  const save = (next: Partial<AgState>) => {
    setProblem(null);
    setNotice(null);
    set({ ...state, phase: "edit", ...next });
  };

  const patchGruppe = (id: string, patch: Partial<Gruppe>) => save({ gruppen: gruppen.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

  function add() {
    if (gruppen.length >= MAX_GRUPPEN) return;
    const neu = neueGruppe(gruppen);
    focusId.current = feldId(neu.id, "name");
    save({ gruppen: [...gruppen, neu] });
  }

  function remove(id: string) {
    const name = gruppen.find((g) => g.id === id)?.name.trim() || "ohne Namen";
    focusId.current = ADD_BUTTON_ID;
    save({ gruppen: gruppen.filter((g) => g.id !== id), plan: state.plan.filter((p) => p.id !== id) });
    setNotice(`Gruppe «${name}» entfernt.`);
  }

  const loadTemplate = () => {
    focusId.current = gruppen.length > 0 ? feldId("g1", "name") : ADD_BUTTON_ID;
    save({ typ: profilTyp, gruppen: vorlage(profilTyp), plan: [] });
  };

  async function start() {
    const p = formProblem(firma, profilTyp, gruppen);
    if (p) {
      focusId.current = p.fieldId ?? null;
      return setProblem(p);
    }
    const a = analysiere(gruppen);
    if (!a) return;
    setProblem(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const plan = planFuer(a.gruppen, state.plan);
      focusHeading.current = true;
      set({ v: 1, phase: "result", typ: profilTyp, gruppen, plan });
      void ctx.sendResult({ eingabe: eingabeText({ firma, typ: profilTyp }, gruppen), ausgabe: ausgabeText({ firma, typ: profilTyp }, a, plan) });
    } finally {
      setBusy(false);
    }
  }

  if (loaded && state.phase === "result" && analyse) {
    return (
      <Ergebnis
        state={state}
        analyse={analyse}
        firma={firma}
        headingRef={headingRef}
        onPlan={(plan) => set({ ...state, plan })}
        onEdit={() => {
          focusId.current = gruppen[0] ? feldId(gruppen[0].id, "name") : ADD_BUTTON_ID;
          save({});
        }}
        onNew={() => {
          const leer = emptyState(profilTyp);
          focusId.current = feldId(leer.gruppen[0].id, "name");
          setProblem(null);
          setNotice(null);
          set(leer);
        }}
      />
    );
  }

  const typHinweis = loaded && typWechselHinweis(state, profilTyp);

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={busy || !loaded}
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
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="ag" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="ag" fields={["firma"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          {verein ? "Name des Vereins" : "Firma"} und Art speichern wir in deinem Firmenprofil, in deinem Browser. Die Vorlage der Gruppen richtet sich nach der Art.
        </p>
      </fieldset>

      <fieldset className="grid gap-4" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Anspruchsgruppen</legend>
        <p id="ag-hilfe" className="text-sm text-muted-foreground">
          Interesse: Wie stark beschäftigt sich die Gruppe mit dir? Einfluss: Wie stark kann sie deinen Erfolg beeinflussen? Beides von 1 (gering) bis 5 (hoch).
          Beziehung, Erwartung und Bedarf sind freiwillig, Erwartung und Bedarf haben höchstens {LIMITS.text} Zeichen. Gruppen ohne Bewertung bleiben aus der
          Analyse draussen.
        </p>

        {typHinweis && (
          <div role="status" className="grid gap-3 rounded-xl bg-surface p-4 text-sm" data-testid="ag-typhinweis">
            <p>
              Du hast schon Angaben eingetragen, darum bleiben deine Gruppen stehen. Die Vorlage für {verein ? "Vereine" : "Betriebe"} ersetzt sie.
            </p>
            <div>
              <Button type="button" variant="outline" onClick={loadTemplate} disabled={busy}>
                Vorlage laden
              </Button>
            </div>
          </div>
        )}

        {loaded && gruppen.length === 0 && (
          <div role="status" className="grid gap-3 rounded-xl bg-surface p-4 text-sm" data-testid="ag-leer">
            <p>Du hast alle Gruppen entfernt. Füge eine hinzu oder lade die Vorlage.</p>
            <div>
              <Button type="button" variant="outline" onClick={loadTemplate} disabled={busy}>
                Vorlage laden
              </Button>
            </div>
          </div>
        )}

        <ol aria-label="Anspruchsgruppen" className="grid gap-4">
          {loaded &&
            gruppen.map((g, i) => (
              <GruppenKarte
                key={g.id}
                gruppe={g}
                index={i}
                disabled={busy}
                invalidId={problem?.fieldId}
                onChange={(patch) => patchGruppe(g.id, patch)}
                onRemove={() => remove(g.id)}
              />
            ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <Button id={ADD_BUTTON_ID} type="button" variant="outline" onClick={add} disabled={!loaded || busy || gruppen.length >= MAX_GRUPPEN}>
            Gruppe hinzufügen
          </Button>
          <p role="status" className="text-sm text-muted-foreground" data-testid="ag-status">
            {notice ? `${notice} ` : ""}
            {loaded ? `${gruppen.length} von ${MAX_GRUPPEN} Gruppen.` : ""}
          </p>
        </div>
      </fieldset>

      <p id="ag-error" role="alert" className="min-h-6 text-destructive">
        {problem?.message}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!loaded || busy}>
          Analyse erstellen
        </Button>
        <span className="text-sm text-muted-foreground">Dein Ergebnis erscheint nach der Angabe deiner E-Mail-Adresse.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <AnspruchsgruppenFlow />
    </ToolShell>
  );
}
