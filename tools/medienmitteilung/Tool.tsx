"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dateCH } from "@/lib/ch";
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { ANLASS_KEYS, ANLASS_LABELS, LIMITS, medienGenerator, type MedienInput } from "./generator";
import {
  EMPTY_FORM,
  EMPTY_STATE,
  KI_HINWEIS,
  RICHTWERT_HINWEIS,
  SLUG,
  charCount,
  checkDraft,
  eingabeText,
  empfaengerHinweise,
  inputProblem,
  isAnlass,
  parseEmpfaenger,
  parseState,
  reportMarkdown,
  toDocument,
  toForm,
  toInput,
  toKontakt,
  toPlainText,
  versandCheckliste,
  viewBlocks,
  type FormValues,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type TextField = "was" | "wer" | "warum" | "zitat" | "bild";

const TEXT_FIELDS: { key: TextField; label: string; help: string; min: number; max: number; rows: number; required: boolean }[] = [
  {
    key: "was",
    label: "Was ist passiert oder passiert?",
    help: "Die Neuigkeit in ein paar Sätzen. Zum Beispiel: Die Malerei Keller feiert ihr 40-jähriges Bestehen mit einem Tag der offenen Tür in der Werkstatt.",
    min: LIMITS.wasMin,
    max: LIMITS.was,
    rows: 4,
    required: true,
  },
  {
    key: "wer",
    label: "Wer ist beteiligt?",
    help: "Personen, Vereine, Partner, mit Funktion. Zum Beispiel: Anna Keller, Inhaberin, und das Team von zwölf Malerinnen und Malern.",
    min: 0,
    max: LIMITS.wer,
    rows: 3,
    required: false,
  },
  {
    key: "warum",
    label: "Warum ist das für die Region von Bedeutung?",
    help: "Was die Gemeinde, die Kundschaft oder die Leserschaft davon hat. Zum Beispiel: Der Betrieb bildet seit Jahren Lernende aus Gossau und Umgebung aus.",
    min: LIMITS.warumMin,
    max: LIMITS.warum,
    rows: 3,
    required: true,
  },
  {
    key: "zitat",
    label: "Zitat einer Person (freiwillig)",
    help: "Ein Satz, den die Person wirklich sagen würde. Er erscheint wörtlich in der Mitteilung; die KI erfindet kein Zitat.",
    min: 0,
    max: LIMITS.zitat,
    rows: 3,
    required: false,
  },
  {
    key: "bild",
    label: "Bildangebot (freiwillig)",
    help: "Was es zu sehen gibt und wer fotografiert hat. Zum Beispiel: Fotos vom Umbau, aufgenommen von Lea Meier, auf Anfrage in Druckqualität.",
    min: 0,
    max: LIMITS.bild,
    rows: 2,
    required: false,
  },
];

const field = (key: TextField) => TEXT_FIELDS.find((x) => x.key === key)!;

function TextArea({ f, value, onChange }: { f: (typeof TEXT_FIELDS)[number]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`mm-${f.key}`}>{f.label}</Label>
      <Textarea
        id={`mm-${f.key}`}
        rows={f.rows}
        maxLength={f.max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`mm-${f.key}-help mm-${f.key}-count`}
        aria-required={f.required ? "true" : undefined}
        lang="de-CH"
        spellCheck
      />
      <p id={`mm-${f.key}-help`} className="text-sm text-muted-foreground">
        {f.help}
      </p>
      <p id={`mm-${f.key}-count`} className="mono text-sm text-muted-foreground">
        {charCount(value)} von {f.max} Zeichen{f.min > 0 ? `, mindestens ${f.min}` : ""}
      </p>
    </div>
  );
}

function Intro() {
  return (
    <>
      <p>
        Wähle den Anlass und beantworte die W-Fragen: was, wann, wo, wer und warum für die Region. Eine KI schreibt daraus eine Medienmitteilung im Nachrichtenstil
        mit Titel, Lead, Haupttext, Zitat und Boilerplate.
      </p>
      <p>
        Danach prüft das Werkzeug den Entwurf auf Lead, Länge und Superlative und zeigt dir eine Checkliste für den Versand. Eine Adressliste der Redaktionen gibt
        es nicht; du bekommst Suchbegriffe, mit denen du sie findest.
      </p>
    </>
  );
}

function MedienFlow() {
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<MedienInput | null>(null);
  const gen = useGenerator(medienGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => (inputRef.current ? reportMarkdown(o, inputRef.current, dateCH(new Date())) : ""),
  });

  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  // null: noch nicht angefasst, dann gilt der Ort aus dem Profil (Harte Regel 10).
  const [woText, setWoText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || gen.busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved.output, gen.busy]);

  const ortProfil = profile.ort?.trim() ?? "";
  const wo = woText ?? ortProfil;
  const positionierung = profile.positionierung?.trim() ?? "";
  const busy = gen.busy;
  const shownError = error ?? gen.error;
  const output = ready && !busy ? saved.output : null;
  const savedInput = ready ? saved.input : null;
  const showForm = !output || editing;

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setError(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function start() {
    const values: FormValues = { ...form, wo };
    const problem = inputProblem({ firma: profile.firma, ort: profile.ort }, values);
    if (problem) return setError(problem);
    setError(null);
    gen.clearError();
    const input = toInput(profile, values);
    inputRef.current = input;
    // generate() macht Fenster, Anfrage, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const result = await gen.generate(input);
    if (!result) return;
    shouldFocus.current = true;
    setEditing(false);
    // Kontakt und Empfänger bleiben im Browser; sie gehen weder an die KI noch ins CRM.
    set({ v: 1, input, output: result, kontakt: toKontakt(values), empfaenger: parseEmpfaenger(values.empfaenger) });
  }

  const edit = () => {
    if (!savedInput) return;
    setError(null);
    gen.clearError();
    setForm(toForm(savedInput, saved.kontakt, saved.empfaenger));
    setWoText(savedInput.wo);
    setEditing(true);
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    setForm(EMPTY_FORM);
    setWoText(null);
    setEditing(false);
    set(EMPTY_STATE);
  };

  const datum = dateCH(new Date());
  const doc = output && savedInput ? toDocument(output, savedInput, saved.kontakt, datum) : null;
  const placeholders = output ? placeholdersIn(output) : [];
  const pruefung = output && savedInput ? checkDraft(output, savedInput) : [];
  const checkliste = output && savedInput ? versandCheckliste(saved.empfaenger, { titel: output.titel, bild: savedInput.bild !== "" }) : [];
  const hinweise = savedInput ? empfaengerHinweise(savedInput.ort, savedInput.kanton) : [];

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

      {showForm && (
        <>
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
            <ProfileFieldsForm idPrefix="mm" fields={["firma", "ort", "kanton", "website"]} />
            <p className="text-sm text-muted-foreground md:col-span-2">Firma, Ort, Kanton und Website speichern wir in deinem Firmenprofil, in deinem Browser.</p>
            {positionierung && (
              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm md:col-span-2" data-testid="positionierung-hinweis">
                Deine Positionierung aus dem Profil: «{positionierung.slice(0, LIMITS.positionierung)}». Sie geht als Grundlage für die Boilerplate mit an die KI.{" "}
                <Link href="/profil" className="underline underline-offset-4">
                  Bearbeiten
                </Link>
              </p>
            )}
            {!positionierung && (
              <p className="text-sm text-muted-foreground md:col-span-2" data-testid="positionierung-leer">
                Im Profil steht noch keine Positionierung. Die KI schreibt die Boilerplate dann aus Betrieb, Ort und deinen Angaben.
              </p>
            )}
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Die Meldung</legend>

            <div className="grid gap-1.5">
              <Label htmlFor="mm-anlass">Anlass</Label>
              <select
                id="mm-anlass"
                className={selectClass}
                value={form.anlass}
                onChange={(e) => setField("anlass", isAnlass(e.target.value) ? e.target.value : "")}
                aria-required="true"
              >
                <option value="">Bitte wählen</option>
                {ANLASS_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {ANLASS_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            <TextArea f={field("was")} value={form.was} onChange={(v) => setField("was", v)} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="mm-wann">Wann?</Label>
                <Input
                  id="mm-wann"
                  value={form.wann}
                  maxLength={LIMITS.wann}
                  onChange={(e) => setField("wann", e.target.value)}
                  aria-describedby="mm-wann-help"
                  aria-required="true"
                />
                <p id="mm-wann-help" className="text-sm text-muted-foreground">
                  Datum und Uhrzeit, so wie sie im Lead stehen sollen. Zum Beispiel «Samstag, 14. November 2026, 10 bis 16 Uhr».
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mm-wo">Wo?</Label>
                <Input id="mm-wo" value={wo} maxLength={LIMITS.wo} onChange={(e) => setWoText(e.target.value)} aria-describedby="mm-wo-help" />
                <p id="mm-wo-help" className="text-sm text-muted-foreground">
                  {ortProfil && woText === null ? "Vorschlag aus deinem Firmenprofil. " : ""}
                  Ort oder Lokal, zum Beispiel «Werkstatt der Malerei Keller, Gossau».
                </p>
              </div>
            </div>

            <TextArea f={field("wer")} value={form.wer} onChange={(v) => setField("wer", v)} />
            <TextArea f={field("warum")} value={form.warum} onChange={(v) => setField("warum", v)} />
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Zitat und Bild (freiwillig)</legend>
            <TextArea f={field("zitat")} value={form.zitat} onChange={(v) => setField("zitat", v)} />
            <div className="grid gap-1.5">
              <Label htmlFor="mm-zitat-von">Name und Funktion</Label>
              <Input
                id="mm-zitat-von"
                value={form.zitatVon}
                maxLength={LIMITS.zitatVon}
                onChange={(e) => setField("zitatVon", e.target.value)}
                aria-describedby="mm-zitat-von-help"
              />
              <p id="mm-zitat-von-help" className="text-sm text-muted-foreground">
                Wer das Zitat sagt, zum Beispiel «Anna Keller, Inhaberin». Pflicht, sobald du ein Zitat angibst.
              </p>
            </div>
            <TextArea f={field("bild")} value={form.bild} onChange={(v) => setField("bild", v)} />
          </fieldset>

          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-3" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">Kontakt für Rückfragen</legend>
            <div className="grid gap-1.5">
              <Label htmlFor="mm-kontakt-name">Name der Kontaktperson</Label>
              <Input
                id="mm-kontakt-name"
                autoComplete="off"
                value={form.kontaktName}
                maxLength={LIMITS.kontaktName}
                onChange={(e) => setField("kontaktName", e.target.value)}
                aria-required="true"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mm-kontakt-telefon">Telefon der Kontaktperson (freiwillig)</Label>
              <Input
                id="mm-kontakt-telefon"
                type="tel"
                autoComplete="off"
                value={form.kontaktTelefon}
                maxLength={LIMITS.kontaktTelefon}
                onChange={(e) => setField("kontaktTelefon", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mm-kontakt-email">E-Mail der Kontaktperson (freiwillig)</Label>
              <Input
                id="mm-kontakt-email"
                type="email"
                autoComplete="off"
                value={form.kontaktEmail}
                maxLength={LIMITS.kontaktEmail}
                onChange={(e) => setField("kontaktEmail", e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground md:col-span-3" data-testid="kontakt-hinweis">
              Die Kontaktdaten gehen nicht an die KI und nicht an Alperna. Dein Browser hängt sie unten an die Mitteilung an.
            </p>
          </fieldset>

          <fieldset className="grid gap-1.5" disabled={busy}>
            <legend className="sr-only">Empfänger</legend>
            <Label htmlFor="mm-empfaenger">Deine Empfänger (freiwillig)</Label>
            <Textarea
              id="mm-empfaenger"
              rows={3}
              value={form.empfaenger}
              onChange={(e) => setField("empfaenger", e.target.value)}
              aria-describedby="mm-empfaenger-help"
              spellCheck={false}
            />
            <p id="mm-empfaenger-help" className="text-sm text-muted-foreground">
              Je Zeile ein Medium, zum Beispiel «Appenzeller Zeitung, Redaktion Gossau». Die Liste kommt in die Versand-Checkliste und bleibt in deinem Browser.
            </p>
          </fieldset>

          <p className="text-sm text-muted-foreground">
            Dafür gehen Betrieb, Ort, Kanton, Website, Anlass, deine Angaben zur Meldung, das Zitat mit Name und Funktion und das Bildangebot
            {positionierung ? ", dazu die Positionierung aus deinem Profil," : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse
            und nicht die Kontaktdaten. Unser Server speichert die Angaben nicht. Deine Angaben und der Entwurf gehen mit deiner E-Mail-Adresse an Alperna, damit
            wir dir bei Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
          </p>

          <p id="mm-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              {busy ? "Die KI schreibt …" : "Medienmitteilung erstellen"}
            </Button>
            {editing && output && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {busy ? "Die KI schreibt deine Medienmitteilung." : ""}
          </p>
        </>
      )}

      {output && doc && savedInput && (
        <ResultCard
          title="Deine Medienmitteilung"
          headingRef={headingRef}
          actions={
            <>
              <DocumentExport model={doc} />
              <CopyButton text={() => toPlainText(doc)} label="Als E-Mail-Text kopieren" />
              <Button type="button" variant="outline" onClick={edit}>
                Angaben ändern
              </Button>
              <Button type="button" variant="ghost" onClick={restart}>
                Neu beginnen
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
            {KI_HINWEIS}
          </p>
          {placeholders.length > 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {placeholders.join(", ")}
            </p>
          )}

          <div>
            <h4 className="font-heading text-lg font-medium">Prüfung</h4>
            <ul className="mt-2 grid gap-2" aria-label="Prüfung">
              {pruefung.map((p) => (
                <li key={p.id} data-testid={`pruefung-${p.id}`} data-ok={p.ok ? "true" : "false"} className="grid gap-x-3 sm:grid-cols-[5rem_1fr]">
                  <span className="mono text-sm text-muted-foreground">{p.ok ? "ok" : "Hinweis"}</span>
                  <span>
                    <span className="font-medium">{p.label}.</span> {p.hinweis}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">{RICHTWERT_HINWEIS}</p>
          </div>

          <div className="rounded-xl border border-line p-4 md:p-5" data-testid="mitteilung">
            <DocView blocks={viewBlocks(doc)} baseLevel={5} />
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h4 className="font-heading text-lg font-medium">Versand-Checkliste</h4>
            <ol className="mt-3 grid list-decimal gap-2 pl-5" aria-label="Versand-Checkliste">
              {checkliste.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </div>

          <div>
            <h4 className="font-heading text-lg font-medium">Empfänger finden</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Wir liefern keine Adressliste, weil sich Adressen ändern und wir sie nicht belegen können. So findest du die Redaktionen deiner Region:
            </p>
            <ul className="mt-3 grid list-disc gap-2 pl-5" aria-label="Empfänger finden">
              {hinweise.map((h) => (
                <li key={h.titel}>
                  <span className="font-medium">{h.titel}.</span> {h.text}
                </li>
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
      <MedienFlow />
    </ToolShell>
  );
}
