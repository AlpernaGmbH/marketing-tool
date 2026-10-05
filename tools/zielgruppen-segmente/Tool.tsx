"use client";

import { cn } from "cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { numberCH } from "@/lib/ch";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  ADD_BUTTON_ID,
  EMPTY_STATE,
  FELDER,
  GROESSE_MAX,
  HINWEISE,
  HINWEIS_EINSCHAETZUNG,
  KANAELE,
  LIMITS,
  MAX_KANAELE,
  MAX_SEGMENTE,
  MIN_SEGMENTE,
  RECHNUNG,
  RICHTWERT_NOTE,
  SKALEN,
  SLUG,
  WERTE,
  ausgabeText,
  auswerten,
  eingabeText,
  feldId,
  istLeer,
  kurzergebnis,
  matrixEingabe,
  matrixSvg,
  neuesSegment,
  parseState,
  profilePatch,
  segmenteTitel,
  toDocument,
  typOf,
  validate,
  vorlage,
  type Auswertung,
  type Bewertet,
  type Kontext,
  type Problem,
  type Segment,
  type SegmentFeld,
  type Skala,
  type Typ,
} from "./logic";
import config from "./tool.config";

const LAGE_ID = "zs-lage";

function Intro({ verein }: { verein: boolean }) {
  return (
    <>
      <p>
        Beschreib bis zu vier Zielgruppen-Segmente{verein ? ", zum Beispiel Mitglieder, Eltern und Sponsoren," : ""} und bewerte jedes auf drei Skalen. Daraus
        entstehen eine Vier-Felder-Matrix aus Attraktivität und Erreichbarkeit, eine Empfehlung für ein Primär- und ein Sekundärsegment und ein Botschaftssatz
        je Segment.
      </p>
      <p>
        Alles rechnet in deinem Browser, ohne KI. Die Skalen und die Grösse sind deine Einschätzungen, keine Statistik. Die gleichen Gewichte der Rechnung und
        die Grenze von 50 für «hoch» sind ein {RICHTWERT_NOTE}. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir
        dir bei Fragen weiterhelfen können.
      </p>
    </>
  );
}

// ---- Formular ----------------------------------------------------------------------------------

const optionClass =
  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-input px-3 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";

function SkalaGruppe({
  segment,
  nr,
  skala,
  disabled,
  invalid,
  onChange,
}: {
  segment: Segment;
  nr: number;
  skala: Skala;
  disabled: boolean;
  invalid: boolean;
  onChange: (wert: number) => void;
}) {
  const base = `zs-${segment.id}-${skala.key}`;
  return (
    <fieldset
      id={feldId(segment.id, skala.key)}
      tabIndex={-1}
      aria-describedby={`${base}-hilfe`}
      className={cn("grid gap-2 rounded-lg outline-none", invalid && "ring-2 ring-destructive/40")}
    >
      <legend className="mb-1 font-medium">
        Segment {nr}: {skala.label}
      </legend>
      <p id={`${base}-hilfe`} className="text-sm text-muted-foreground">
        {skala.frage}
      </p>
      <div className="flex flex-wrap gap-2">
        {WERTE.map((n) => (
          <label key={n} className={optionClass}>
            <input
              type="radio"
              name={base}
              value={n}
              checked={segment[skala.key] === n}
              disabled={disabled}
              onChange={() => onChange(n)}
              className="size-5 accent-ink"
            />
            {n} {skala.stufen[n - 1]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SegmentKarte({
  segment,
  nr,
  typ,
  canRemove,
  disabled,
  invalidId,
  onChange,
  onRemove,
}: {
  segment: Segment;
  nr: number;
  typ: Typ;
  canRemove: boolean;
  disabled: boolean;
  invalidId: string | undefined;
  onChange: (patch: Partial<Segment>) => void;
  onRemove: () => void;
}) {
  const id = (f: SegmentFeld) => feldId(segment.id, f);
  const invalid = (f: SegmentFeld) => invalidId === id(f);
  const kanaeleVoll = segment.kanaele.length >= MAX_KANAELE;

  const text = (f: "name" | "beduerfnis" | "kaufmotiv" | "nutzen" | "einwand", label: string, max: number, placeholder?: string, hilfe?: string) => (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id(f)}>
        Segment {nr}: {label}
      </Label>
      <Input
        id={id(f)}
        value={segment[f]}
        maxLength={max}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid(f)}
        aria-describedby={hilfe ? `${id(f)}-hilfe` : undefined}
        onChange={(e) => onChange({ [f]: e.target.value })}
      />
      {hilfe && (
        <p id={`${id(f)}-hilfe`} className="text-sm text-muted-foreground">
          {hilfe}
        </p>
      )}
    </div>
  );

  const toggleKanal = (kanal: (typeof KANAELE)[number], on: boolean) =>
    onChange({ kanaele: KANAELE.filter((k) => (k === kanal ? on : segment.kanaele.includes(k))) });

  return (
    <li className="grid gap-5 rounded-xl border border-line p-4" data-testid={`segment-${nr}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-heading font-semibold">Segment {nr}</span>
        <Button type="button" variant="ghost" aria-label={`Entfernen: Segment ${nr}`} disabled={disabled || !canRemove} onClick={onRemove}>
          Entfernen
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          {text("name", "Name", LIMITS.name.max, typ === "verein" ? "Eltern von Junioren in Trogen" : "Hauseigentümer in Gossau", `${LIMITS.name.min} bis ${LIMITS.name.max} Zeichen. Wer genau gehört dazu?`)}
        </div>
        {text("beduerfnis", "Hauptbedürfnis", LIMITS.text.max, "Fassade erneuern, ohne Stress")}
        {text("kaufmotiv", "Kaufmotiv", LIMITS.text.max, "Werterhalt", "Warum entscheidet sich das Segment für dich?")}
        {text("nutzen", "Dein Nutzen", LIMITS.text.max, "saubere Arbeit zum Fixpreis", "Was bietest du diesem Segment?")}
        <div className="grid content-start gap-1.5">
          <Label htmlFor={id("groesse")}>
            Segment {nr}: Wie viele mögliche Kundinnen und Kunden? (deine Schätzung)
          </Label>
          <Input
            id={id("groesse")}
            type="number"
            inputMode="numeric"
            min={1}
            max={GROESSE_MAX}
            step={1}
            value={segment.groesse}
            disabled={disabled}
            aria-invalid={invalid("groesse")}
            aria-describedby={`${id("groesse")}-hilfe`}
            onChange={(e) => onChange({ groesse: e.target.value })}
            onWheel={(e) => e.currentTarget.blur()}
          />
          <p id={`${id("groesse")}-hilfe`} className="text-sm text-muted-foreground">
            Eine ganze Zahl von 1 bis 10&apos;000&apos;000. Es zählt das Verhältnis der Segmente zueinander.
          </p>
        </div>
      </div>

      <fieldset
        id={id("kanaele")}
        tabIndex={-1}
        aria-describedby={`${id("kanaele")}-hilfe`}
        className={cn("grid gap-2 rounded-lg outline-none", invalid("kanaele") && "ring-2 ring-destructive/40")}
      >
        <legend className="mb-1 font-medium">Segment {nr}: Kanäle</legend>
        <p id={`${id("kanaele")}-hilfe`} className="text-sm text-muted-foreground">
          Wo erreichst du das Segment am besten? Wähle höchstens {MAX_KANAELE}.{" "}
          <span aria-live="polite">
            {segment.kanaele.length} von {MAX_KANAELE} gewählt.
          </span>
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {KANAELE.map((k) => {
            const checked = segment.kanaele.includes(k);
            return (
              <label key={k} className={optionClass}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || (!checked && kanaeleVoll)}
                  onChange={(e) => toggleKanal(k, e.target.checked)}
                  className="size-5 accent-ink"
                />
                {k}
              </label>
            );
          })}
        </div>
      </fieldset>

      {text("einwand", "Typischer Einwand", LIMITS.einwand.max, "zu teuer", "Freiwillig. Was hörst du am häufigsten?")}

      <div className="grid gap-5">
        {SKALEN.map((sk) => (
          <SkalaGruppe
            key={sk.key}
            segment={segment}
            nr={nr}
            skala={sk}
            disabled={disabled}
            invalid={invalid(sk.key)}
            onChange={(wert) => onChange({ [sk.key]: wert })}
          />
        ))}
      </div>
    </li>
  );
}

// ---- Ergebnis ----------------------------------------------------------------------------------

function Matrix({ a }: { a: Auswertung }) {
  const svg = useMemo(() => matrixSvg(matrixEingabe(a), LAGE_ID), [a]);
  return (
    <figure className="grid gap-3" aria-labelledby="zs-matrix-titel" data-testid="zs-matrix-figur">
      <h4 id="zs-matrix-titel" className="font-heading text-lg font-medium">
        Die Matrix
      </h4>
      <div className="mx-auto w-full max-w-md" data-testid="zs-matrix" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="text-sm text-muted-foreground">
        Waagrecht die Erreichbarkeit, senkrecht die Attraktivität, jeweils von 0 bis 100. Ab 50 gilt ein Wert als hoch ({RICHTWERT_NOTE}). Punkte mit
        ähnlichen Werten sind etwas auseinandergerückt; die genauen Zahlen stehen in der Tabelle.
      </figcaption>
      {/* Textalternative zur Grafik: dieselben Daten als Liste, nur für Screenreader; sichtbar ist die Tabelle darunter. */}
      <ol id={LAGE_ID} aria-label="Lage der Segmente" data-testid="zs-lage" className="sr-only">
        {a.segmente.map((s) => (
          <li key={s.id}>
            Segment {s.nr}, {s.name}: Attraktivität {s.attraktivitaet}, Erreichbarkeit {s.erreichbarkeit}, Feld {FELDER[s.feld].titel}
            {a.empfehlung.primaer?.nr === s.nr ? ", Primärsegment" : ""}
          </li>
        ))}
      </ol>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" data-testid="zs-tabelle">
          <caption className="sr-only">Segmente mit Attraktivität, Erreichbarkeit und Feld</caption>
          <thead>
            <tr>
              {["Segment", "Attraktivität", "Erreichbarkeit", "Feld"].map((h) => (
                <th key={h} scope="col" className="border-b border-ink py-2 pr-4 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.segmente.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="border-b border-line py-2 pr-4 text-left align-top font-medium break-words">
                  <span className="mono">{s.nr}</span> {s.name}
                </th>
                <td className="mono border-b border-line py-2 pr-4 align-top">{s.attraktivitaet}</td>
                <td className="mono border-b border-line py-2 pr-4 align-top">{s.erreichbarkeit}</td>
                <td className="border-b border-line py-2 pr-4 align-top whitespace-nowrap">{FELDER[s.feld].titel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function rolleOf(a: Auswertung, s: Bewertet): string | null {
  if (a.empfehlung.primaer?.nr === s.nr) return "Primärsegment";
  if (a.empfehlung.sekundaer?.nr === s.nr) return "Sekundärsegment";
  return a.segmente.length > 1 ? "Vorerst nicht im Fokus" : null;
}

function SegmentErgebnis({ a, s }: { a: Auswertung; s: Bewertet }) {
  const rolle = rolleOf(a, s);
  const primaer = a.empfehlung.primaer?.nr === s.nr;
  return (
    <li className={cn("grid gap-3 break-words rounded-xl border p-4", primaer ? "border-ink" : "border-line")} data-testid={`ergebnis-segment-${s.nr}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <h4 className="font-heading text-base font-semibold">
          <span className="mono">{s.nr}</span> {s.name}
        </h4>
        <p className="flex flex-wrap gap-2 text-sm font-medium">
          {rolle && <span className="rounded-full border border-ink px-3 py-0.5">{rolle}</span>}
          <span className="rounded-full bg-surface px-3 py-0.5">{FELDER[s.feld].titel}</span>
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Attraktivität</dt>
          <dd className="mono text-xl font-medium">{s.attraktivitaet}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Erreichbarkeit</dt>
          <dd className="mono text-xl font-medium">{s.erreichbarkeit}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Grösse (Schätzung)</dt>
          <dd className="mono break-words text-xl font-medium">{numberCH(s.groesse, 0)}</dd>
        </div>
      </dl>
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">Botschaft</p>
        <p data-testid={`botschaft-${s.nr}`}>{s.botschaft}</p>
        <div>
          <CopyButton text={s.botschaft} label={`Botschaft ${s.nr} kopieren`} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Kanäle: {s.kanaele.length > 0 ? s.kanaele.join(", ") : "keine Angabe"}
        {s.einwand ? `. Typischer Einwand: ${s.einwand}` : ""}
      </p>
    </li>
  );
}

function Ergebnis({
  a,
  kontext,
  onEdit,
  onNew,
  onZweites,
  headingRef,
}: {
  a: Auswertung;
  kontext: Kontext;
  onEdit: () => void;
  onNew: () => void;
  onZweites: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const doc = useMemo(() => toDocument(a, kontext), [a, kontext]);
  const e = a.empfehlung;
  const einzeln = a.segmente.length === 1;

  return (
    <ResultCard
      title="Deine Zielgruppen-Segmente"
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
      <section aria-labelledby="zs-empfehlung-titel" className="grid gap-2 break-words rounded-xl border border-ink bg-surface p-4" data-testid="zs-empfehlung">
        <h4 id="zs-empfehlung-titel" className="font-heading text-lg font-medium">
          Empfehlung
        </h4>
        <p className="font-medium" data-testid="zs-fokus">
          {e.satz}
        </p>
        {e.danach && <p data-testid="zs-danach">{e.danach}</p>}
        {e.zurueckSatz && <p data-testid="zs-zurueck">{e.zurueckSatz}</p>}
      </section>

      {einzeln ? (
        <div className="grid gap-3 rounded-xl border border-line p-4" data-testid="zs-einzeln">
          <p className="font-medium">Das ist eine Beschreibung, noch kein Vergleich.</p>
          <p>
            Eine Matrix braucht mindestens zwei Segmente. Beschreib ein zweites Segment, dann setzt das Werkzeug beide in die Vier-Felder-Matrix und empfiehlt,
            womit du beginnst.
          </p>
          <div>
            <Button type="button" variant="outline" onClick={onZweites}>
              Zweites Segment beschreiben
            </Button>
          </div>
        </div>
      ) : (
        <Matrix a={a} />
      )}

      <section aria-labelledby="zs-segmente-titel" className="grid gap-3">
        <h4 id="zs-segmente-titel" className="font-heading text-lg font-medium">
          {kontext.typ === "verein" ? "Die Zielgruppen im Einzelnen" : "Die Segmente im Einzelnen"}
        </h4>
        <ul aria-label="Segmente nach Rangfolge" className="grid gap-3" data-testid="zs-segmente">
          {a.rangfolge.map((s) => (
            <SegmentErgebnis key={s.id} a={a} s={s} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="zs-rechnung-titel" className="grid gap-2 rounded-xl bg-surface p-4" data-testid="zs-richtwert">
        <h4 id="zs-rechnung-titel" className="font-heading text-base font-semibold">
          So ist gerechnet
        </h4>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm">
          {RECHNUNG.map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{HINWEIS_EINSCHAETZUNG}</p>
      </section>

      <section aria-labelledby="zs-hinweise-titel" className="grid gap-2">
        <h4 id="zs-hinweise-titel" className="font-heading text-base font-semibold">
          Drei Hinweise
        </h4>
        <ol aria-label="Hinweise" className="grid list-decimal gap-1.5 pl-5">
          {HINWEISE.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </section>

      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer py-2.5 font-medium">Dokument ansehen (so erscheint es in PDF und Word)</summary>
        <div className="mt-4" data-testid="zs-dokument">
          <DocView blocks={doc.blocks} />
        </div>
      </details>
    </ResultCard>
  );
}

// ---- Ablauf ------------------------------------------------------------------------------------

function ZielgruppenFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusId = useRef<string | null>(null);
  const focusHeading = useRef(false);

  const loaded = ready && profileReady;
  const typ = typOf(profile.organisationstyp);
  const verein = typ === "verein";
  const firma = (profile.firma ?? "").trim();
  const branche = (profile.branche ?? "").trim();
  // Solange nichts gespeichert ist, kommt die Startliste aus dem Profil (Namen der Zielgruppen); die erste Änderung speichert sie.
  const segmente = saved.segmente.length > 0 ? saved.segmente : vorlage(profile);
  const kontext = useMemo<Kontext>(() => ({ firma, branche, typ }), [firma, branche, typ]);
  const auswertung = useMemo(() => (saved.phase === "result" ? auswerten(saved.segmente) : null), [saved.phase, saved.segmente]);

  // Fokus nach einer Aktion des Besuchers (neues Segment, Meldung, Ergebnis), nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (focusId.current) {
      document.getElementById(focusId.current)?.focus();
      focusId.current = null;
    }
    if (focusHeading.current && auswertung) {
      headingRef.current?.focus();
      focusHeading.current = false;
    }
  });

  const save = (next: Segment[]) => {
    setProblem(null);
    setNotice(null);
    set({ v: 1, phase: "edit", segmente: next });
  };

  const patchSegment = (id: string, patch: Partial<Segment>) => save(segmente.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function add(from: Segment[] = segmente) {
    if (from.length >= MAX_SEGMENTE) return;
    const neu = neuesSegment(from);
    focusId.current = feldId(neu.id, "name");
    save([...from, neu]);
  }

  function remove(id: string) {
    if (segmente.length <= MIN_SEGMENTE) return;
    const nr = segmente.findIndex((s) => s.id === id) + 1;
    focusId.current = ADD_BUTTON_ID;
    save(segmente.filter((s) => s.id !== id));
    setNotice(`Segment ${nr} entfernt.`);
  }

  async function start() {
    const p = validate(firma, typ, segmente);
    if (p) {
      focusId.current = p.fieldId ?? null;
      return setProblem(p);
    }
    const a = auswerten(segmente);
    if (!a) return;
    setProblem(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      focusHeading.current = true;
      set({ v: 1, phase: "result", segmente, output: kurzergebnis(a) });
      const patch = profilePatch(profile, a);
      if (Object.keys(patch).length > 0) update(patch);
      void ctx.sendResult({ eingabe: eingabeText(kontext, a), ausgabe: ausgabeText(a, kontext) });
    } finally {
      setBusy(false);
    }
  }

  if (loaded && saved.phase === "result" && auswertung) {
    return (
      <Ergebnis
        a={auswertung}
        kontext={kontext}
        headingRef={headingRef}
        onEdit={() => {
          focusId.current = saved.segmente[0] ? feldId(saved.segmente[0].id, "name") : ADD_BUTTON_ID;
          save(saved.segmente);
        }}
        onNew={() => {
          focusId.current = feldId("s1", "name");
          setProblem(null);
          setNotice(null);
          set(EMPTY_STATE);
        }}
        onZweites={() => {
          // Ein noch leeres Segment aus dem Formular dient als zweites; sonst kommt ein neues dazu.
          const leer = saved.segmente.find(istLeer);
          if (!leer) return add(saved.segmente);
          focusId.current = feldId(leer.id, "name");
          save(saved.segmente);
        }}
      />
    );
  }

  const gesamt = segmente.length;

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
        <Intro verein={verein} />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">{verein ? "Dein Verein" : "Dein Betrieb"}</legend>
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="zs" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="zs" fields={["firma", "branche"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          {verein ? "Name und Tätigkeit des Vereins" : "Firma und Branche"} speichern wir in deinem Firmenprofil, in deinem Browser. Die Namen deiner Segmente
          übernehmen wir aus dem Profil, wenn dort Zielgruppen stehen.
        </p>
      </fieldset>

      <fieldset className="grid gap-4" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">{segmenteTitel(typ)}</legend>
        <p id="zs-hilfe" className="text-sm text-muted-foreground">
          Beschreibe ein bis vier {verein ? "Zielgruppen" : "Segmente"}. Für die Matrix brauchst du mindestens zwei. Ein Segment ohne jede Angabe zählt nicht.
          Name, Hauptbedürfnis, Kaufmotiv, Nutzen, Grösse und die drei Skalen sind Pflicht, Kanäle und Einwand freiwillig.
        </p>

        <ol aria-label={segmenteTitel(typ)} className="grid gap-4">
          {loaded &&
            segmente.map((s, i) => (
              <SegmentKarte
                key={s.id}
                segment={s}
                nr={i + 1}
                typ={typ}
                canRemove={gesamt > MIN_SEGMENTE}
                disabled={busy}
                invalidId={problem?.fieldId}
                onChange={(patch) => patchSegment(s.id, patch)}
                onRemove={() => remove(s.id)}
              />
            ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <Button id={ADD_BUTTON_ID} type="button" variant="outline" onClick={() => add()} disabled={!loaded || busy || gesamt >= MAX_SEGMENTE}>
            Segment hinzufügen
          </Button>
          <p role="status" className="text-sm text-muted-foreground" data-testid="zs-status">
            {notice ? `${notice} ` : ""}
            {loaded ? `${gesamt} von ${MAX_SEGMENTE} Segmenten.` : ""}
          </p>
        </div>
      </fieldset>

      <p id="zs-error" role="alert" className="min-h-6 text-destructive">
        {problem?.message}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!loaded || busy}>
          Segmente auswerten
        </Button>
        <span className="text-sm text-muted-foreground">Dein Ergebnis erscheint nach der Angabe deiner E-Mail-Adresse.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <ZielgruppenFlow />
    </ToolShell>
  );
}
