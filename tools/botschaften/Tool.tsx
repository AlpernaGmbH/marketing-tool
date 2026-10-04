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
import { LIMITS, botschaftenGenerator, type BotschaftenInput } from "./generator";
import {
  ANREDEN,
  EMPTY_FORM,
  EMPTY_STATE,
  KANAELE,
  KI_HINWEIS,
  SLUG,
  TELEFON,
  charCount,
  eingabeText,
  hinweisNamen,
  inputProblem,
  isAnrede,
  joinNamen,
  parseState,
  profilHinweise,
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

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type TextField = "angebot" | "wirkung" | "beweise";

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
    key: "wirkung",
    label: "Was soll die Kundschaft nach dem Kontakt mit dir denken?",
    help: "Ein Satz, so wie ihn eine Kundin zu ihrer Nachbarin sagt. Zum Beispiel: «Die halten den Termin und erklären, was sie tun.»",
    min: LIMITS.wirkungMin,
    max: LIMITS.wirkung,
    rows: 2,
    required: true,
  },
  {
    key: "beweise",
    label: "Beweise, die du hast (freiwillig)",
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
      Sag, was du anbietest, was deine Kundschaft nach dem Kontakt denken soll, für wen das gilt und welche Beweise du hast. Eine KI macht daraus deine
      Kernbotschaften: eine Hauptbotschaft, drei bis fünf Botschaften je Zielgruppe oder Anlass mit Beleg, die Fassung für Website, Google-Unternehmensprofil,
      Instagram und Offerte, einen Satz fürs Telefon und eine Liste, was du nicht mehr sagst.
    </p>
  );
}

function BotschaftenFlow() {
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<BotschaftenInput | null>(null);
  const gen = useGenerator(botschaftenGenerator, {
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
  const hinweise = profilHinweise(profile);
  const profilTeile = hinweisNamen(hinweise, zielgruppe);
  const busy = gen.busy;
  const shownError = error ?? gen.error;
  const output = ready && !busy ? saved.output : null;
  const savedInput = ready ? saved.input : null;
  const showForm = !output || editing;

  const setField = (key: keyof FormValues, value: string) => {
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
            <ProfileFieldsForm idPrefix="bo" fields={["firma", "branche", "ort"]} />
            <p className="text-sm text-muted-foreground md:col-span-3">Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.</p>
          </fieldset>

          {profilTeile.length > 0 && (
            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="profil-hinweise">
              <p>Aus deinem Firmenprofil geht als Hintergrund mit an die KI:</p>
              <ul className="mt-2 grid gap-1" aria-label="Angaben aus dem Firmenprofil">
                {hinweise.positionierung && <li>Positionierung: «{hinweise.positionierung}»</li>}
                {profilTeile.includes("Primärsegment") && <li>Primärsegment: «{hinweise.primaersegment}»</li>}
                {hinweise.personas.length > 0 && <li>Personas: {hinweise.personas.join(", ")}</li>}
              </ul>
              <p className="mt-2">
                <Link href="/profil" className="underline underline-offset-4">
                  Bearbeiten
                </Link>
              </p>
            </div>
          )}

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Deine Botschaft</legend>

            <div className="grid gap-1.5">
              <Label htmlFor="bo-zielgruppe">Für wen?</Label>
              <Input
                id="bo-zielgruppe"
                value={zielgruppe}
                maxLength={LIMITS.zielgruppe}
                onChange={(e) => {
                  setError(null);
                  setZiel(e.target.value);
                }}
                aria-describedby="bo-zielgruppe-help"
                aria-required="true"
              />
              <p id="bo-zielgruppe-help" className="text-sm text-muted-foreground">
                {vorschlag && ziel === null ? "Vorschlag aus deinem Firmenprofil. " : ""}
                Zum Beispiel «Hausbesitzer in der Region Gossau» oder «Liegenschaftsverwaltungen in St. Gallen».
              </p>
            </div>

            {TEXT_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`bo-${f.key}`}>{f.label}</Label>
                <Textarea
                  id={`bo-${f.key}`}
                  rows={f.rows}
                  maxLength={f.max}
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  aria-describedby={`bo-${f.key}-help bo-${f.key}-count`}
                  aria-required={f.required ? "true" : undefined}
                  lang="de-CH"
                  spellCheck
                />
                <p id={`bo-${f.key}-help`} className="text-sm text-muted-foreground">
                  {f.help}
                </p>
                <p id={`bo-${f.key}-count`} className="mono text-sm text-muted-foreground">
                  {charCount(form[f.key])} von {f.max} Zeichen{f.min > 0 ? `, mindestens ${f.min}` : ""}
                </p>
              </div>
            ))}

            <div className="grid gap-1.5 md:max-w-sm">
              <Label htmlFor="bo-anrede">Anrede</Label>
              <select
                id="bo-anrede"
                className={selectClass}
                value={form.anrede}
                onChange={(e) => setField("anrede", isAnrede(e.target.value) ? e.target.value : "")}
                aria-describedby="bo-anrede-help"
                aria-required="true"
              >
                <option value="">Bitte wählen</option>
                {ANREDEN.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <p id="bo-anrede-help" className="text-sm text-muted-foreground">
                Wie du deine Kundschaft ansprichst. Gilt für die Texte je Kanal und den Telefonsatz.
              </p>
            </div>
          </fieldset>

          <p className="text-sm text-muted-foreground">
            Dafür gehen Betrieb, Branche, Ort und deine Angaben zu Kundschaft, Angebot, Wirkung, Beweisen und Anrede
            {profilTeile.length > 0 ? `, dazu ${joinNamen(profilTeile)} aus deinem Profil,` : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht
            deine E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und der Entwurf gehen mit deiner E-Mail-Adresse an Alperna, damit wir
            dir bei Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
          </p>

          <p id="bo-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              {busy ? "Die KI schreibt …" : "Botschaften erstellen"}
            </Button>
            {editing && output && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {busy ? "Die KI schreibt deine Botschaften." : ""}
          </p>
        </>
      )}

      {output && doc && (
        <ResultCard
          title="Deine Botschaften"
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
            <h4 className="font-heading font-medium">Kanäle kopieren</h4>
            <ul className="mt-3 grid gap-3" aria-label="Texte je Kanal">
              {KANAELE.map((k) => (
                <li key={k.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <CopyButton text={output.kanaele[k.key]} label={k.copyLabel} />
                  <span className="mono text-sm text-muted-foreground">{zeichenLabel(output.kanaele[k.key], k.max)}</span>
                </li>
              ))}
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CopyButton text={output.telefonsatz} label={TELEFON.copyLabel} />
                <span className="mono text-sm text-muted-foreground">{zeichenLabel(output.telefonsatz, TELEFON.max)}</span>
              </li>
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
      <BotschaftenFlow />
    </ToolShell>
  );
}
