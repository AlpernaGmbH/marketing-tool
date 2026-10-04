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
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { LIMITS, nutzenGenerator, type NutzenInput } from "./generator";
import {
  BAUSTEINE,
  EMPTY_FORM,
  EMPTY_STATE,
  KI_HINWEIS,
  SLUG,
  charCount,
  eingabeText,
  inputProblem,
  parseState,
  reportMarkdown,
  toDocument,
  toForm,
  toInput,
  viewBlocks,
  zeichenLabel,
  zielgruppeVorschlag,
  type FormValues,
} from "./logic";
import config from "./tool.config";

type TextField = Exclude<keyof FormValues, "zielgruppe">;

const TEXT_FIELDS: { key: TextField; label: string; help: string; min: number; max: number; rows: number; required: boolean }[] = [
  {
    key: "angebot",
    label: "Was bietest du an?",
    help: "Leistungen oder Produkte, so konkret wie auf einer Offerte. Zum Beispiel: Fassaden streichen, Innenräume renovieren, Farbberatung vor Ort.",
    min: LIMITS.angebotMin,
    max: LIMITS.angebot,
    rows: 3,
    required: true,
  },
  {
    key: "problem",
    label: "Welches Problem löst du für diese Kundschaft?",
    help: "Was die Leute vorher ärgert oder fehlt. Zum Beispiel: Die Fassade blättert, Offerten kommen spät, niemand erklärt die Farbwahl.",
    min: LIMITS.problemMin,
    max: LIMITS.problem,
    rows: 3,
    required: true,
  },
  {
    key: "ergebnis",
    label: "Was hat die Kundschaft danach?",
    help: "Das Ergebnis, nicht die Arbeit. Zum Beispiel: eine Fassade, die zwanzig Jahre hält, und eine Rechnung ohne Überraschung.",
    min: LIMITS.ergebnisMin,
    max: LIMITS.ergebnis,
    rows: 2,
    required: true,
  },
  {
    key: "beweise",
    label: "Beweise (freiwillig)",
    help: "Jahre im Geschäft, Referenzen, Garantie, Zahl der Projekte. Nur, was stimmt; was fehlt, bleibt ein Platzhalter.",
    min: 0,
    max: LIMITS.beweise,
    rows: 3,
    required: false,
  },
];

function Intro() {
  return (
    <p>
      Beantworte vier Fragen zu deinem Angebot. Eine KI macht daraus dein Nutzenversprechen in drei Längen, eine Liste, was deine Kundschaft von dir hat, deine
      Beweise und fertige Textbausteine für Website, Google-Unternehmensprofil, Instagram-Bio und Telefon.
    </p>
  );
}

function NutzenFlow() {
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<NutzenInput | null>(null);
  const gen = useGenerator(nutzenGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => (inputRef.current ? reportMarkdown(o, inputRef.current) : ""),
  });

  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  // null: noch nicht angefasst, dann gilt der Vorschlag aus dem Profil (Harte Regel 10).
  const [ziel, setZiel] = useState<string | null>(null);
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

  const vorschlag = zielgruppeVorschlag(profile);
  const zielgruppe = ziel ?? vorschlag;
  const positionierung = profile.positionierung?.trim() ?? "";
  const busy = gen.busy;
  const shownError = error ?? gen.error;
  const output = ready && !busy ? saved.output : null;
  const savedInput = ready ? saved.input : null;
  const showForm = !output || editing;

  const setField = (key: TextField, value: string) => {
    setError(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function start() {
    const values: FormValues = { ...form, zielgruppe };
    const problem = inputProblem({ firma: profile.firma }, values);
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
    set({ v: 1, input, output: result });
  }

  const edit = () => {
    if (!savedInput) return;
    setError(null);
    gen.clearError();
    setForm(toForm(savedInput));
    setZiel(savedInput.zielgruppe);
    setEditing(true);
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    setForm(EMPTY_FORM);
    setZiel(null);
    setEditing(false);
    set(EMPTY_STATE);
  };

  const doc = output && savedInput ? toDocument(output, savedInput) : null;
  const placeholders = output ? placeholdersIn(output) : [];

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
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-3" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
            <ProfileFieldsForm idPrefix="nv" fields={["firma", "branche", "ort"]} />
            <p className="text-sm text-muted-foreground md:col-span-3">Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.</p>
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Dein Angebot</legend>

            <div className="grid gap-1.5">
              <Label htmlFor="nv-zielgruppe">Für wen?</Label>
              <Input
                id="nv-zielgruppe"
                value={zielgruppe}
                maxLength={LIMITS.zielgruppe}
                onChange={(e) => {
                  setError(null);
                  setZiel(e.target.value);
                }}
                aria-describedby="nv-zielgruppe-help"
                aria-required="true"
              />
              <p id="nv-zielgruppe-help" className="text-sm text-muted-foreground">
                {vorschlag && ziel === null ? "Vorschlag aus deinem Firmenprofil. " : ""}
                Zum Beispiel «Hausbesitzer in der Region Gossau» oder «Treuhandbüros mit wenigen Angestellten».
              </p>
            </div>

            {TEXT_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`nv-${f.key}`}>{f.label}</Label>
                <Textarea
                  id={`nv-${f.key}`}
                  rows={f.rows}
                  maxLength={f.max}
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  aria-describedby={`nv-${f.key}-help nv-${f.key}-count`}
                  aria-required={f.required ? "true" : undefined}
                  lang="de-CH"
                  spellCheck
                />
                <p id={`nv-${f.key}-help`} className="text-sm text-muted-foreground">
                  {f.help}
                </p>
                <p id={`nv-${f.key}-count`} className="mono text-sm text-muted-foreground">
                  {charCount(form[f.key])} von {f.max} Zeichen{f.min > 0 ? `, mindestens ${f.min}` : ""}
                </p>
              </div>
            ))}

            {positionierung && (
              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="positionierung-hinweis">
                Deine Positionierung aus dem Profil: «{positionierung.slice(0, LIMITS.positionierung)}». Sie geht als Hintergrund mit an die KI.{" "}
                <Link href="/profil" className="underline underline-offset-4">
                  Bearbeiten
                </Link>
              </p>
            )}
          </fieldset>

          <p className="text-sm text-muted-foreground">
            Dafür gehen Betrieb, Branche, Ort und deine Angaben zu Kundschaft, Angebot, Problem, Ergebnis und Beweisen
            {positionierung ? ", dazu die Positionierung aus deinem Profil," : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse.
            Unser Server speichert die Angaben nicht. Deine Angaben und der Entwurf gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
            weiterhelfen können. Gib nichts Vertrauliches ein.
          </p>

          <p id="nv-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              {busy ? "Die KI schreibt …" : "Nutzenversprechen erstellen"}
            </Button>
            {editing && output && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {busy ? "Die KI schreibt dein Nutzenversprechen." : ""}
          </p>
        </>
      )}

      {output && doc && (
        <ResultCard
          title="Dein Nutzenversprechen"
          headingRef={headingRef}
          actions={
            <>
              <DocumentExport model={doc} />
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
          <DocView blocks={viewBlocks(doc)} />
          <div className="rounded-xl border border-line bg-surface p-4">
            <h4 className="font-heading font-medium">Bausteine kopieren</h4>
            <ul className="mt-3 grid gap-3" aria-label="Textbausteine je Kanal">
              {BAUSTEINE.map((b) => (
                <li key={b.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <CopyButton text={output.bausteine[b.key]} label={b.copyLabel} />
                  <span className="mono text-sm text-muted-foreground">
                    {zeichenLabel(output.bausteine[b.key], b.max)}
                    {b.hint ? `, ${b.hint}` : ""}
                  </span>
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
      <NutzenFlow />
    </ToolShell>
  );
}
