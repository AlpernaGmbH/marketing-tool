"use client";

import { cn } from "cn";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ScoreBadge } from "@/components/tool/ScoreBadge";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateCH } from "@/lib/ch";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  BEGRUENDUNG,
  BERUEHRUNGSPUNKTE,
  EMPTY_STATE,
  GRUND,
  HINWEISE,
  HINWEIS_VERANTWORTLICH,
  INHALT_STUFEN,
  KEINE_LUECKE_TEXT,
  KEIN_INHALT_HINWEIS,
  LIMITS,
  PHASEN,
  PUNKT_KEYS,
  SLUG,
  STUFE_TEXT,
  VORSCHLAEGE_NOTE,
  auswerten,
  beschriebenePhasen,
  eingabeText,
  mitVorschlag,
  parseState,
  phaseLabel,
  phasePlatzhalter,
  reportMarkdown,
  toDocument,
  validate,
  wegName,
  type Ergebnis,
  type KundenwegState,
  type Phase,
  type PhaseInput,
  type PunktKey,
  type Stufe,
  type Typ,
  type WegInput,
} from "./logic";
import config from "./tool.config";

function Intro({ verein }: { verein: boolean }) {
  return (
    <>
      <p>
        {verein
          ? "Beschreib für sechs Phasen, was Interessierte fragen, wo sie dem Verein begegnen und ob es dafür Inhalt gibt."
          : "Beschreib für sechs Phasen, was deine Kundschaft fragt, wo sie dir begegnet und ob du dafür Inhalt hast."}{" "}
        Du bekommst den Weg als Tabelle und eine Lückenliste: pro Lücke, welcher Inhalt in der Phase fehlt und welches Werkzeug dir dabei hilft.
      </p>
      <p>
        Die Auswertung läuft in deinem Browser, ohne KI. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei
        Fragen weiterhelfen können.
      </p>
    </>
  );
}

// ---- Formular ----------------------------------------------------------------------------------

const chipClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-3 py-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";

type PhaseFieldsProps = {
  n: number;
  phase: Phase;
  typ: Typ;
  value: PhaseInput;
  disabled: boolean;
  onChange: (patch: Partial<PhaseInput>) => void;
};

function PhaseFields({ n, phase, typ, value, disabled, onChange }: PhaseFieldsProps) {
  const id = (f: string) => `kw-p${n}-${f}`;
  const setPunkt = (key: PunktKey, on: boolean) => onChange({ punkte: PUNKT_KEYS.filter((k) => (k === key ? on : value.punkte.includes(k))) });

  return (
    <fieldset className="grid min-w-0 gap-5 rounded-xl border border-line p-4" disabled={disabled} data-testid={`phase-${n}`}>
      <legend className="px-2 font-heading font-semibold">{phaseLabel(phase, typ)}</legend>

      <div className="grid gap-1.5">
        <Label htmlFor={id("frage")} className="leading-snug">
          Phase {n}: Was fragt sich die Kundschaft?
        </Label>
        <Input
          id={id("frage")}
          value={value.frage}
          maxLength={LIMITS.frage}
          placeholder={phasePlatzhalter(phase, typ)}
          onChange={(e) => onChange({ frage: e.target.value })}
          aria-describedby={id("frage-hilfe")}
          lang="de-CH"
        />
        <p id={id("frage-hilfe")} className="mono text-sm text-muted-foreground">
          {value.frage.length} von {LIMITS.frage} Zeichen
        </p>
      </div>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-1 text-sm font-medium leading-snug">Phase {n}: Wo begegnet die Kundschaft dir?</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {BERUEHRUNGSPUNKTE.map((b) => (
            <label key={b.key} htmlFor={id(`punkt-${b.key}`)} className={chipClass}>
              <input
                id={id(`punkt-${b.key}`)}
                type="checkbox"
                className="size-5 shrink-0 accent-ink"
                checked={value.punkte.includes(b.key)}
                onChange={(e) => setPunkt(b.key, e.target.checked)}
              />
              <span className="min-w-0 break-words">{b.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-1 text-sm font-medium leading-snug">Phase {n}: Gibt es dafür Inhalt?</legend>
        <div className="flex flex-wrap gap-3">
          {INHALT_STUFEN.map((s) => (
            <label key={s.key} htmlFor={id(`inhalt-${s.key}`)} className={chipClass}>
              <input
                id={id(`inhalt-${s.key}`)}
                type="radio"
                name={id("inhalt")}
                value={s.key}
                className="size-5 shrink-0 accent-ink"
                checked={value.inhalt === s.key}
                onChange={() => onChange({ inhalt: s.key })}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5 md:max-w-sm">
        <Label htmlFor={id("verantwortlich")} className="leading-snug">
          Phase {n}: Verantwortlich
        </Label>
        <Input
          id={id("verantwortlich")}
          value={value.verantwortlich}
          maxLength={LIMITS.verantwortlich}
          onChange={(e) => onChange({ verantwortlich: e.target.value })}
          aria-describedby={id("verantwortlich-hilfe")}
          autoComplete="off"
        />
        <p id={id("verantwortlich-hilfe")} className="text-sm text-muted-foreground">
          Freiwillig. Ein Name genügt.
        </p>
      </div>
    </fieldset>
  );
}

// ---- Ergebnis ----------------------------------------------------------------------------------

const badgeBase = "inline-flex w-fit items-center rounded-full border px-3 py-0.5 text-sm font-medium";
const badgeClass: Record<Stufe, string> = {
  rot: `${badgeBase} border-ink bg-ink text-page`,
  gelb: `${badgeBase} border-ink`,
  ok: `${badgeBase} border-line text-muted-foreground`,
};

function Karte({ z }: { z: Ergebnis["zeilen"][number] }) {
  const frage = z.frage || GRUND.frage;
  return (
    <li
      className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-paper p-3 text-sm", z.luecke.stufe === "rot" ? "border-ink" : "border-line")}
      data-testid="phase-karte"
      data-stufe={z.luecke.stufe}
    >
      <p className="eyebrow">Phase {z.nr}</p>
      <h4 className="font-heading text-base font-medium leading-snug">{z.label}</h4>
      <p className={badgeClass[z.luecke.stufe]} data-testid="stufe">
        {z.stufeText}
      </p>
      <dl className="grid gap-2">
        <div>
          <dt className="text-xs text-muted-foreground">Frage</dt>
          <dd className="break-words hyphens-auto" lang="de-CH">
            {frage}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Berührungspunkte</dt>
          <dd className="break-words hyphens-auto" lang="de-CH">
            {z.punkte.length > 0 ? z.punkte.join(", ") : "keine"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Inhalt</dt>
          <dd>{z.inhalt === "" ? "Nicht beantwortet, zählt wie «Nein»" : z.inhaltText}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Verantwortlich</dt>
          <dd className="break-words">{z.verantwortlich || HINWEIS_VERANTWORTLICH}</dd>
        </div>
      </dl>
    </li>
  );
}

function ResultView({
  e,
  headingRef,
  onEdit,
  onNew,
}: {
  e: Ergebnis;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  const doc = useMemo(() => toDocument(e), [e]);
  const s = e.summary;
  const verein = e.typ === "verein";

  return (
    <ResultCard
      title={verein ? "Dein Weg zur Mitgliedschaft" : "Dein Kundenweg"}
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
      <ScoreBadge score={s.abgedeckt} max={s.total} label="Phasen abgedeckt" />
      <p className="font-medium" data-testid="gesamtaussage">
        {s.satz} {s.wichtigsteSatz}
      </p>

      <ol aria-label={`${wegName(e.typ)} in sechs Phasen`} className="grid gap-3 lg:grid-cols-6" data-testid="phasen-karten">
        {e.zeilen.map((z) => (
          <Karte key={z.key} z={z} />
        ))}
      </ol>

      <section aria-labelledby="kw-luecken" className="grid gap-3">
        <h4 id="kw-luecken">Lückenliste</h4>
        {s.luecken.length === 0 ? (
          <p>{KEINE_LUECKE_TEXT}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{BEGRUENDUNG}</p>
            <ol aria-label="Lücken nach Dringlichkeit" className="grid gap-3" data-testid="lueckenliste">
              {s.luecken.map((l, i) => (
                <li key={l.key} className="grid gap-3 rounded-xl border border-line bg-paper p-4" data-testid="luecke" data-stufe={l.stufe}>
                  <p className="eyebrow">{i + 1}. Lücke</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">
                      Phase {l.nr}: {l.label}
                    </span>
                    <span className={badgeClass[l.stufe]}>{STUFE_TEXT[l.stufe]}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Was fehlt: </span>
                    {l.gruende.join("; ")}
                  </p>
                  <div className="grid gap-1">
                    <p className="text-sm text-muted-foreground">Das kannst du ergänzen</p>
                    <ul className="grid list-disc gap-1 pl-5">
                      {l.vorschlaege.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </div>
                  {l.werkzeuge.length > 0 && (
                    <p>
                      <span className="text-muted-foreground">Nächstes Werkzeug: </span>
                      {l.werkzeuge.map((w, j) => (
                        <span key={w.slug}>
                          {j > 0 && " oder "}
                          <Link href={`/tools/${w.slug}`} className="underline underline-offset-4">
                            {w.name}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted-foreground">{VORSCHLAEGE_NOTE}</p>
          </>
        )}
      </section>

      <section aria-labelledby="kw-hinweise" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 id="kw-hinweise" className="font-heading text-base font-semibold">
          Drei Hinweise
        </h4>
        <ol className="grid list-decimal gap-2 pl-5 text-sm">
          {HINWEISE.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </section>
    </ResultCard>
  );
}

// ---- Ablauf ------------------------------------------------------------------------------------

function KundenwegFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const typ: Typ = profile.organisationstyp === "verein" ? "verein" : "kmu";
  const { value: saved, ready, set } = useLocalJson<KundenwegState>(`mt:${SLUG}`, parseState);

  // Der Entwurf lebt im Formular; der Speicher folgt mit etwas Verzögerung, nicht bei jedem Tastendruck.
  // Solange das Formular ganz leer ist, stehen die Berührungspunkte aus dem Profil als Vorschlag in Phase 1 und 2.
  const [draft, setDraft] = useState<PhaseInput[] | null>(null);
  const phasen = useMemo(() => draft ?? mitVorschlag(saved.phasen, profile.kanaele), [draft, saved.phasen, profile.kanaele]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<"heading" | "form" | null>(null);

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => set({ v: 1, phase: "edit", typ, phasen: draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set, typ]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "form") document.getElementById("kw-p1-frage")?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const ergebnis = useMemo(
    () => (saved.phase === "result" && saved.output ? auswerten({ typ: saved.typ, phasen: saved.phasen }, saved.output) : null),
    [saved],
  );

  const change = (i: number, patch: Partial<PhaseInput>) => {
    setError(null);
    setDraft(phasen.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  };

  async function start() {
    const input: WegInput = { typ, phasen };
    const problem = validate(input);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const output = { firma: profile.firma?.trim() ?? "", branche: profile.branche?.trim() ?? "", datum: dateCH(new Date()) };
      const e = auswerten(input, output);
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", typ, phasen, output });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(input), ausgabe: reportMarkdown(e) });
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
          set({ v: 1, phase: "edit", typ: saved.typ, phasen: saved.phasen });
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
  const beschrieben = beschriebenePhasen(phasen);

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

      <fieldset className="grid min-w-0 gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={off}>
        <legend className="px-2 font-heading font-semibold">{verein ? "Dein Verein" : "Dein Betrieb"}</legend>
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="kw" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="kw" fields={["firma", "branche"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          {verein ? "Verein und Tätigkeit" : "Firma und Branche"} speichern wir in deinem Firmenprofil, in deinem Browser.
        </p>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Alle Angaben der Phasen sind freiwillig, mindestens eine Phase brauchst du. {KEIN_INHALT_HINWEIS}
      </p>

      {PHASEN.map((p, i) => (
        <PhaseFields key={p.key} n={i + 1} phase={p} typ={typ} value={phasen[i]} disabled={off} onChange={(patch) => change(i, patch)} />
      ))}

      <p role="status" aria-live="polite" className="mono text-sm text-muted-foreground" data-testid="fortschritt">
        {beschrieben} von {PHASEN.length} Phasen beschrieben
      </p>

      <p id="kw-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={off}>
          {verein ? "Weg zur Mitgliedschaft erstellen" : "Kundenweg erstellen"}
        </Button>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <KundenwegFlow />
    </ToolShell>
  );
}
