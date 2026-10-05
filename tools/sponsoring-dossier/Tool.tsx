"use client";

import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { chf, numberCH, pctCH } from "@/lib/ch";
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { DossierExport } from "./DossierExport";
import { sponsoringGenerator } from "./generator";
import {
  AMPEL_HINWEISE,
  AMPEL_NOTE,
  DEFAULT_NAMEN,
  EMPTY_STATE,
  KI_HINWEIS,
  MAX,
  SLUG,
  SOCIAL_MAX,
  TICKETS_MAX,
  ZAHLEN,
  ZEILEN,
  ampelRegel,
  bewertePakete,
  eingabeText,
  farbKontrast,
  farbProblem,
  inputProblem,
  isHakenKey,
  kiAusgabeText,
  kiBereit,
  kiEingabeText,
  kiSignatur,
  normFarbe,
  parseState,
  reportMarkdown,
  toDocument,
  toKiInput,
  viewBlocks,
  type Form,
  type HakenKey,
  type PaketForm,
  type SdState,
  type Stufe,
  type ZahlKey,
} from "./logic";
import config from "./tool.config";

const STUFE_FARBE: Record<Stufe, string> = { gruen: "#2E7D32", gelb: "#E0A800", rot: "#B3261E" };
const STUFE_NAME: Record<Stufe, string> = { gruen: "grün", gelb: "gelb", rot: "rot" };

const charCount = (s: string): number => Array.from(s).length;

function Intro() {
  return (
    <>
      <p>
        Trag die Zahlen deines Vereins ein, beschreib, welche Betriebe zu euch passen, und leg bis zu drei Pakete mit Gegenleistungen und Preis fest. Daraus
        entsteht ein Sponsoring-Dossier mit Deckblatt, Verein in Zahlen, Zielgruppe, Pakete im Vergleich, Referenzen und nächsten Schritten. Es entsteht in deinem
        Browser, ohne KI. Dazu bekommst du eine Ampel, ob die Gegenleistung zum Preis passt.
      </p>
      <p>
        Die KI ist freiwillig: Im Ergebnis kann sie auf Wunsch drei Absätze aus deinen Stichworten schreiben. Dein Ergebnis geht zusammen mit deinen Angaben und
        deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können; Kontaktdaten und Namen der Referenzen bleiben in deinem Browser.
      </p>
    </>
  );
}

function Counter({ id, value, max, min }: { id: string; value: string; max: number; min?: number }) {
  return (
    <p id={id} className="mono text-sm text-muted-foreground">
      {charCount(value)} von {max} Zeichen{min ? `, mindestens ${min}` : ""}
    </p>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  help,
  required,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  help?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required ? "true" : undefined}
        aria-describedby={help ? `${id}-help` : undefined}
        disabled={disabled}
      />
      {help && (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}

function PaketFields({ index, paket, disabled, onChange }: { index: number; paket: PaketForm; disabled: boolean; onChange: (next: PaketForm) => void }) {
  const n = index + 1;
  const id = (f: string) => `sd-p${n}-${f}`;
  const toggle = (key: HakenKey, on: boolean) => onChange({ ...paket, haken: on ? [...paket.haken.filter((k) => k !== key), key] : paket.haken.filter((k) => k !== key) });
  return (
    <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={disabled} data-testid={`paket-${n}`}>
      <legend className="px-2 font-heading font-semibold">Paket {n}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("name")}>Paket {n}: Name</Label>
          <Input id={id("name")} value={paket.name} maxLength={MAX.paketName} onChange={(e) => onChange({ ...paket, name: e.target.value })} aria-describedby={id("name-help")} />
          <p id={id("name-help")} className="text-sm text-muted-foreground">
            Vorschlag: {DEFAULT_NAMEN[index]}. Jedes Paket braucht einen eigenen Namen.
          </p>
        </div>
        <NumberField
          id={id("preis")}
          label={`Paket ${n}: Preis in CHF`}
          value={paket.preis}
          onChange={(preis) => onChange({ ...paket, preis })}
          min={MAX.preisMin}
          max={MAX.preisMax}
          help={`${chf(MAX.preisMin)} bis ${chf(MAX.preisMax)}, pro Saison oder Jahr, wie ihr das Paket anbietet. Leer lassen, wenn es das Paket nicht gibt.`}
        />
      </div>
      <ul aria-label={`Gegenleistungen von Paket ${n}`} className="grid gap-2 sm:grid-cols-2">
        {ZEILEN.map((z) => {
          if (z.art === "haken" && isHakenKey(z.key)) {
            const key = z.key;
            return (
              <li key={z.key}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-6 shrink-0 accent-ink"
                    aria-label={`Paket ${n}: ${z.label}`}
                    checked={paket.haken.includes(key)}
                    onChange={(e) => toggle(key, e.target.checked)}
                  />
                  <span>{z.label}</span>
                </label>
              </li>
            );
          }
          if (z.art === "zahl") {
            const feld = z.key === "social" ? "social" : "tickets";
            return (
              <li key={z.key} className="sm:col-span-2">
                <NumberField
                  id={id(feld)}
                  label={`Paket ${n}: ${z.label}`}
                  value={paket[feld]}
                  onChange={(v) => onChange({ ...paket, [feld]: v })}
                  min={0}
                  max={feld === "social" ? SOCIAL_MAX : TICKETS_MAX}
                  help={feld === "social" ? `0 bis ${SOCIAL_MAX}. Leer oder 0: nicht im Paket.` : "Leer oder 0: nicht im Paket."}
                />
              </li>
            );
          }
          return (
            <li key={z.key} className="sm:col-span-2">
              <div className="grid gap-1.5">
                <Label htmlFor={id("weitere")}>Paket {n}: {z.label}</Label>
                <Input id={id("weitere")} value={paket.weitere} maxLength={MAX.weitere} onChange={(e) => onChange({ ...paket, weitere: e.target.value })} aria-describedby={id("weitere-help")} />
                <p id={id("weitere-help")} className="text-sm text-muted-foreground">
                  Bis {MAX.weitere} Zeichen, zum Beispiel «Stand am Dorffest».
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function AmpelListe({ form }: { form: Form }) {
  const bewertung = bewertePakete(form);
  if (bewertung.length === 0) return null;
  return (
    <section aria-labelledby="sd-ampel-h" className="grid gap-3 rounded-xl border border-line p-4" data-testid="ampel">
      <h4 id="sd-ampel-h" className="font-heading text-lg font-medium">
        Passt die Gegenleistung zum Preis?
      </h4>
      <p className="text-sm text-muted-foreground" data-testid="ampel-hinweis">
        {AMPEL_NOTE}. Die Ampel steht nicht im Dossier, und die Pakete bleiben, wie du sie eingegeben hast.
      </p>
      <ul aria-label="Einschätzung je Paket" className="grid gap-3">
        {bewertung.map((b) => (
          <li key={b.index} className="flex items-start gap-3" data-testid={`ampel-${b.index + 1}`} data-stufe={b.ampel.stufe}>
            <span aria-hidden="true" className="mt-1.5 size-3.5 shrink-0 rounded-full border border-ink" style={{ backgroundColor: STUFE_FARBE[b.ampel.stufe] }} />
            <div className="grid gap-0.5">
              <p className="font-medium">
                {b.name}: {b.ampel.text} <span className="font-normal text-muted-foreground">({STUFE_NAME[b.ampel.stufe]})</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Preis {chf(b.preis)}, Rahmen {chf(Math.round(b.rahmen))} ({numberCH(b.punkte, 2)} Punkte, Faktor {numberCH(b.faktor)}): {pctCH(b.ampel.prozent, 0)} des Rahmens.
              </p>
              <p className="text-sm">{AMPEL_HINWEISE[b.ampel.text]}</p>
            </div>
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer underline underline-offset-4">So rechnet die Ampel</summary>
        <p className="mt-2" data-testid="ampel-regel">
          {ampelRegel()}
        </p>
        <p className="mt-2 text-muted-foreground">Punkte, Faktor und die 100 Franken je Punkt sind Richtwerte von Alperna, keine Statistik.</p>
      </details>
    </section>
  );
}

function KiPanel({
  bereit,
  busy,
  error,
  hat,
  platzhalter,
  notice,
  onWrite,
}: {
  bereit: boolean;
  busy: boolean;
  error: string | null;
  hat: boolean;
  platzhalter: string[];
  notice: string;
  onWrite: () => void;
}) {
  return (
    <section aria-labelledby="sd-ki-h" className="grid gap-3 rounded-xl border border-line bg-surface p-4" data-testid="ki-panel">
      <h4 id="sd-ki-h" className="font-heading text-lg font-medium">
        Texte von der KI (freiwillig)
      </h4>
      <p className="text-sm">
        Das Dossier ist auch ohne KI vollständig. Auf Wunsch schreibt die KI aus deinen Stichworten drei Absätze dazu: Porträt des Vereins, Warum Sponsoring hier
        wirkt, Dank und nächste Schritte.
      </p>
      <p className="text-sm text-muted-foreground" data-testid="ki-daten">
        Dafür gehen der Name des Vereins, der Ort, deine Stichworte, die Zielgruppe, die Zahlen und die Pakete mit Namen, Preis und Gegenleistungen an unseren
        Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse, nicht die Kontaktdaten und nicht die Referenzen. Unser Server speichert die
        Angaben nicht. Deine Angaben und die Absätze gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können. Gib nichts
        Vertrauliches ein.
      </p>
      {!bereit && (
        <p id="sd-ki-leer" className="text-sm" data-testid="ki-leer">
          Für die KI-Texte brauchst du Stichworte zum Verein (mindestens {MAX.stichworteMin} Zeichen). Trag sie über «Angaben ändern» ein.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onWrite} disabled={!bereit || busy} aria-describedby={!bereit ? "sd-ki-leer" : undefined}>
          {busy ? "Die KI schreibt …" : "Texte von der KI schreiben lassen"}
        </Button>
        <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
      </div>
      <p id="sd-ki-error" role="alert" className="min-h-0 text-destructive">
        {error}
      </p>
      <p role="status" aria-live="polite" className={notice || busy ? "text-sm" : "sr-only"}>
        {busy ? "Die KI schreibt die drei Absätze." : notice}
      </p>
      {hat && (
        <>
          <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
            {KI_HINWEIS}
          </p>
          {platzhalter.length > 0 && (
            <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {platzhalter.join(", ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SponsoringFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  const savedRef = useRef<SdState>(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  const gen = useGenerator(sponsoringGenerator, { eingabe: kiEingabeText, ausgabe: kiAusgabeText });

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const shouldFocus = useRef<"heading" | "form" | null>(null);

  const form = saved.form;
  const result = ready && saved.phase === "result";
  const dis = busy || !ready;

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "form") formRef.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const patch = (fn: (f: Form) => Form) => {
    setError(null);
    // Der Ref folgt sofort, damit zwei schnelle Eingaben hintereinander sich nicht überschreiben.
    const next: SdState = { ...savedRef.current, phase: "edit", form: fn(savedRef.current.form) };
    savedRef.current = next;
    set(next);
  };
  const setZahl = (key: ZahlKey, value: string) => patch((f) => ({ ...f, zahlen: { ...f.zahlen, [key]: value } }));
  const setPaket = (i: number, next: PaketForm) => patch((f) => ({ ...f, pakete: f.pakete.map((p, j) => (j === i ? next : p)) }));

  async function start() {
    // Verein, Ort, Kanton und Website kommen aus dem Firmenprofil (Harte Regel 10); der Rest steht im Stand.
    const base: Form = {
      ...savedRef.current.form,
      verein: (profile.firma ?? "").trim(),
      ort: (profile.ort ?? "").trim(),
      kanton: profile.kanton ?? "",
      website: (profile.website ?? "").trim(),
    };
    const problem = inputProblem(base);
    if (problem) return setError(problem);
    setError(null);
    setNotice("");
    gen.clearError();
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      // Die KI-Texte gelten nur für die Eingabe, für die sie geschrieben wurden.
      const old = savedRef.current;
      const keep = old.ki !== null && old.kiSig !== "" && old.kiSig === kiSignatur(base);
      const ki = keep ? old.ki : null;
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", form: base, ki, kiSig: keep ? old.kiSig : "" });
      void ctx.sendResult({ eingabe: eingabeText(base), ausgabe: reportMarkdown(base, ki) });
    } finally {
      setBusy(false);
    }
  }

  async function schreiben() {
    const input = toKiInput(savedRef.current.form);
    if (!input) return;
    setNotice("");
    // generate() macht Fenster (falls die Adresse fehlt), Anfrage, Wiederholung bei 403 und CRM selbst.
    const out = await gen.generate(input);
    if (!out) return;
    const now = savedRef.current;
    set({ ...now, ki: out, kiSig: kiSignatur(now.form) });
    setNotice("Die KI hat drei Absätze geschrieben. Sie stehen im Dossier.");
  }

  const edit = () => {
    shouldFocus.current = "form";
    setError(null);
    setNotice("");
    gen.clearError();
    set({ ...saved, phase: "edit" });
  };

  const restart = () => {
    shouldFocus.current = "form";
    setError(null);
    setNotice("");
    gen.clearError();
    set(EMPTY_STATE);
  };

  if (result) {
    const doc = toDocument(form, saved.ki);
    const farbe = normFarbe(form.farbe);
    return (
      <ResultCard
        title="Dein Sponsoring-Dossier"
        headingRef={headingRef}
        actions={
          <>
            <DossierExport model={doc} farbe={farbe} />
            <Button type="button" variant="outline" onClick={edit}>
              Angaben ändern
            </Button>
            <Button type="button" variant="ghost" onClick={restart}>
              Neu beginnen
            </Button>
          </>
        }
      >
        <AmpelListe form={form} />
        <KiPanel
          bereit={kiBereit(form) && toKiInput(form) !== null}
          busy={gen.busy}
          error={gen.error}
          hat={saved.ki !== null}
          platzhalter={saved.ki ? placeholdersIn(saved.ki) : []}
          notice={notice}
          onWrite={() => void schreiben()}
        />
        <div className="rounded-xl border border-line p-4 md:p-5" data-testid="dossier">
          <DocView blocks={viewBlocks(doc)} />
        </div>
      </ResultCard>
    );
  }

  const farbHinweis = farbProblem(form.farbe);
  const kontrast = farbKontrast(form.farbe);

  return (
    <form
      ref={formRef}
      className="grid gap-6"
      noValidate
      aria-busy={busy || !ready || !profileReady}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={dis}>
        <legend className="px-2 font-heading font-semibold">Dein Verein</legend>
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="sd" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="sd" fields={["firma", "ort", "kanton", "website"]} />
        <div className="grid gap-1.5">
          <Label htmlFor="sd-anlass">Anlass oder Saison (freiwillig)</Label>
          <Input id="sd-anlass" value={form.anlass} maxLength={MAX.anlass} onChange={(e) => patch((f) => ({ ...f, anlass: e.target.value }))} aria-describedby="sd-anlass-help" />
          <p id="sd-anlass-help" className="text-sm text-muted-foreground">
            Steht auf dem Deckblatt, zum Beispiel «Saison 2026/27» oder «Dorffest 2027».
          </p>
        </div>
        <p className="text-sm text-muted-foreground md:col-span-2">Name, Ort, Kanton und Website speichern wir in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={dis}>
        <legend className="px-2 font-heading font-semibold">Der Verein in Zahlen</legend>
        <p className="text-sm text-muted-foreground md:col-span-2">
          Nur Zahlen, die der Verein selbst angibt. Sie erscheinen im Dossier als Angaben des Vereins. Nur die Mitglieder sind Pflicht; leer oder 0 lässt die
          Zeile im Dossier weg.
        </p>
        {ZAHLEN.map((z) => (
          <NumberField
            key={z.key}
            id={`sd-z-${z.key}`}
            label={z.label}
            value={form.zahlen[z.key]}
            onChange={(v) => setZahl(z.key, v)}
            min={z.min}
            max={z.max}
            required={z.pflicht}
            help={z.pflicht ? "Ganze Zahl, mindestens 1. Sie bestimmt den Faktor der Ampel." : undefined}
          />
        ))}
      </fieldset>

      <fieldset className="grid gap-1.5" disabled={dis}>
        <legend className="mb-1 font-heading font-semibold">Zielgruppe der Sponsoren</legend>
        <Label htmlFor="sd-zielgruppe">Welche Betriebe passen zu euch, und warum?</Label>
        <Textarea
          id="sd-zielgruppe"
          rows={3}
          maxLength={MAX.zielgruppe}
          value={form.zielgruppe}
          onChange={(e) => patch((f) => ({ ...f, zielgruppe: e.target.value }))}
          aria-required="true"
          aria-describedby="sd-zielgruppe-help sd-zielgruppe-count"
          lang="de-CH"
          spellCheck
        />
        <p id="sd-zielgruppe-help" className="text-sm text-muted-foreground">
          Zum Beispiel: Betriebe aus Trogen, Speicher und Teufen, die bei Familien und jungen Erwachsenen sichtbar sein wollen: Handwerk, Gastronomie, Garagen.
        </p>
        <Counter id="sd-zielgruppe-count" value={form.zielgruppe} max={MAX.zielgruppe} min={MAX.zielgruppeMin} />
      </fieldset>

      <fieldset className="grid gap-4" disabled={dis}>
        <legend className="mb-1 font-heading font-semibold">Pakete</legend>
        <p className="text-sm text-muted-foreground">
          Bis zu drei Pakete. Ein Paket zählt, sobald es einen Preis oder eine Gegenleistung hat; mindestens eines braucht beides. Die Ampel im Ergebnis ist eine
          Einschätzung von Alperna, keine Marktdaten.
        </p>
        {form.pakete.map((p, i) => (
          <PaketFields key={i} index={i} paket={p} disabled={dis} onChange={(next) => setPaket(i, next)} />
        ))}
      </fieldset>

      <fieldset className="grid gap-1.5" disabled={dis}>
        <legend className="mb-1 font-heading font-semibold">Referenzen (freiwillig)</legend>
        <Label htmlFor="sd-referenzen">Bisherige Sponsoren und Partner (nenne nur Betriebe, die einverstanden sind)</Label>
        <Textarea
          id="sd-referenzen"
          rows={3}
          maxLength={MAX.referenzen}
          value={form.referenzen}
          onChange={(e) => patch((f) => ({ ...f, referenzen: e.target.value }))}
          aria-describedby="sd-referenzen-help sd-referenzen-count"
          lang="de-CH"
          spellCheck={false}
        />
        <p id="sd-referenzen-help" className="text-sm text-muted-foreground">
          Je Zeile ein Betrieb. Die Namen erscheinen im Dossier, gehen aber nicht an die KI und nicht an Alperna.
        </p>
        <Counter id="sd-referenzen-count" value={form.referenzen} max={MAX.referenzen} />
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={dis}>
        <legend className="px-2 font-heading font-semibold">Ansprechperson</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="sd-k-name">Name der Ansprechperson</Label>
          <Input id="sd-k-name" autoComplete="off" value={form.kontakt.name} maxLength={MAX.kontaktName} onChange={(e) => patch((f) => ({ ...f, kontakt: { ...f.kontakt, name: e.target.value } }))} aria-required="true" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sd-k-funktion">Funktion (freiwillig)</Label>
          <Input id="sd-k-funktion" autoComplete="off" value={form.kontakt.funktion} maxLength={MAX.kontaktFunktion} onChange={(e) => patch((f) => ({ ...f, kontakt: { ...f.kontakt, funktion: e.target.value } }))} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sd-k-telefon">Telefon (freiwillig)</Label>
          <Input id="sd-k-telefon" type="tel" autoComplete="off" value={form.kontakt.telefon} maxLength={MAX.kontaktTelefon} onChange={(e) => patch((f) => ({ ...f, kontakt: { ...f.kontakt, telefon: e.target.value } }))} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sd-k-email">E-Mail der Ansprechperson (freiwillig)</Label>
          <Input id="sd-k-email" type="email" autoComplete="off" value={form.kontakt.email} maxLength={MAX.kontaktEmail} onChange={(e) => patch((f) => ({ ...f, kontakt: { ...f.kontakt, email: e.target.value } }))} />
        </div>
        <p className="text-sm text-muted-foreground md:col-span-2" data-testid="kontakt-hinweis">
          Die Kontaktdaten stehen im Dossier, gehen aber nicht an die KI und nicht an Alperna.
        </p>
      </fieldset>

      <fieldset className="grid gap-1.5" disabled={dis}>
        <legend className="mb-1 font-heading font-semibold">Aussehen</legend>
        <Label htmlFor="sd-farbe">Vereinsfarbe</Label>
        <div className="flex items-center gap-3">
          <input
            id="sd-farbe"
            type="color"
            value={normFarbe(form.farbe).toLowerCase()}
            onChange={(e) => patch((f) => ({ ...f, farbe: e.target.value }))}
            className="h-11 w-16 cursor-pointer rounded-lg border border-input bg-paper p-1"
            aria-describedby="sd-farbe-help"
            aria-invalid={farbHinweis ? "true" : undefined}
          />
          <span className="mono text-sm" data-testid="farbe-wert">
            {normFarbe(form.farbe)}
          </span>
        </div>
        <p id="sd-farbe-help" className="text-sm text-muted-foreground">
          Für das Deckblatt, die Linie im Kopf und den Tabellenkopf im PDF. Die Schrift darauf ist Weiss oder Schwarz, je nach Farbe. Die Farbe braucht auf Papier
          einen Kontrast von mindestens 3 zu 1{kontrast !== null ? `; deine hat ${numberCH(kontrast)} zu 1` : ""}.
        </p>
        {farbHinweis && (
          <p className="text-sm text-destructive" data-testid="farbe-hinweis">
            {farbHinweis}
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-1.5" disabled={dis}>
        <legend className="mb-1 font-heading font-semibold">Stichworte für die KI-Texte (freiwillig)</legend>
        <Label htmlFor="sd-stichworte">Stichworte zum Verein</Label>
        <Textarea
          id="sd-stichworte"
          rows={3}
          maxLength={MAX.stichworte}
          value={form.stichworte}
          onChange={(e) => patch((f) => ({ ...f, stichworte: e.target.value }))}
          aria-describedby="sd-stichworte-help sd-stichworte-count"
          lang="de-CH"
          spellCheck
        />
        <p id="sd-stichworte-help" className="text-sm text-muted-foreground">
          Gründung, Teams, Anlagen, Anlässe, was den Verein ausmacht. Mit mindestens {MAX.stichworteMin} Zeichen kannst du im Ergebnis die KI drei Absätze schreiben
          lassen. Die KI bekommt nur, was du hier und oben für sie freigibst; ohne Stichworte bleibt der Knopf aus.
        </p>
        <Counter id="sd-stichworte-count" value={form.stichworte} max={MAX.stichworte} />
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Beim Erstellen gehen der Name des Vereins, der Ort, die Zahlen, die Zielgruppe und die Pakete mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können, nicht die Kontaktdaten und nicht die Namen der Referenzen. Die KI bekommt erst etwas, wenn du im Ergebnis den Knopf drückst.
      </p>

      <p id="sd-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
          Dossier erstellen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert rund acht Minuten.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <SponsoringFlow />
    </ToolShell>
  );
}
