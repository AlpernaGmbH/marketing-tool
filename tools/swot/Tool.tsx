"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { MAX_FELD_CHARS, MAX_ZIEL_CHARS, swotGenerator, type SwotInput } from "./generator";
import {
  CHECK_SLUG,
  EMPTY_STATE,
  FELDER,
  KI_HINWEIS,
  REIFEGRAD_SLUG,
  SLUG,
  charCount,
  eingabeText,
  faktenAus,
  folgerungenTabelle,
  inputProblem,
  parseState,
  reportMarkdown,
  toDocument,
  toInput,
  type FormValues,
} from "./logic";
import config from "./tool.config";

/** Die Stände der beiden Checks kommen roh aus dem Browser; faktenAus() prüft sie selbst. */
const keepRaw = (raw: unknown) => raw;

function Intro() {
  return (
    <p>
      Schreib in vier Felder, was in deinem Marketing gut läuft, was fehlt, was sich um dich herum verändert und was dir schaden könnte. Liegen in deinem
      Browser Ergebnisse des Digitaler-Auftritt-Checks oder des Reifegrad-Checks, kommen gemessene Stärken und Schwächen als Fakten dazu. Eine KI ordnet
      alles zu einer SWOT-Analyse und leitet drei bis fünf Massnahmen ab.
    </p>
  );
}

function SwotFlow() {
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const { value: checkRaw } = useLocalJson(`mt:${CHECK_SLUG}`, keepRaw);
  const { value: reifegradRaw } = useLocalJson(`mt:${REIFEGRAD_SLUG}`, keepRaw);
  const { fakten, hatCheck, hatReifegrad } = useMemo(() => faktenAus(checkRaw, reifegradRaw), [checkRaw, reifegradRaw]);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<SwotInput | null>(null);
  const gen = useGenerator(swotGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => (inputRef.current ? reportMarkdown(o, inputRef.current) : ""),
  });

  // Änderungen am Formular leben im Entwurf, bis die Analyse entsteht; vorher gilt der gespeicherte Stand.
  const [draft, setDraft] = useState<FormValues | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocus = useRef(false);
  const shouldFocusForm = useRef(false);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  const form = draft ?? saved.form;
  const busy = gen.busy;
  const shownError = error ?? gen.error;
  const output = ready && !busy ? saved.output : null;
  const savedInput = ready ? saved.input : null;
  const showForm = !output || editing;
  const positionierung = profile.positionierung?.trim() ?? "";

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [output, busy]);

  // «Angaben ändern» zeigt das Formular wieder; der Fokus geht auf das erste Feld, sobald es da ist.
  useEffect(() => {
    if (!shouldFocusForm.current || !showForm) return;
    firstFieldRef.current?.focus();
    shouldFocusForm.current = false;
  }, [showForm]);

  const patch = (p: Partial<FormValues>) => {
    setError(null);
    setDraft({ ...form, ...p });
  };

  async function start() {
    const fields = { firma: profile.firma, branche: profile.branche, ort: profile.ort, groesse: profile.groesse, positionierung: profile.positionierung };
    const problem = inputProblem(fields, form);
    if (problem) return setError(problem);
    setError(null);
    gen.clearError();
    const input = toInput(fields, form, fakten);
    inputRef.current = input;
    // Das Formular bleibt nach dem Neuladen gefüllt, auch wenn die Anfrage scheitert.
    set({ ...savedRef.current, v: 1, form });
    // generate() macht Fenster, Anfrage, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const result = await gen.generate(input);
    if (!result) return;
    shouldFocus.current = true;
    set({ v: 1, form, input, output: result });
    setDraft(null);
    setEditing(false);
  }

  const edit = () => {
    setError(null);
    gen.clearError();
    setDraft(null);
    shouldFocusForm.current = true;
    setEditing(true);
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    setDraft(null);
    setEditing(false);
    shouldFocusForm.current = true;
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
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
            <ProfileFieldsForm idPrefix="sw" fields={["firma", "branche", "ort", "groesse"]} />
            <p className="text-sm text-muted-foreground md:col-span-2">Firma, Branche, Ort und Grösse speichern wir in deinem Firmenprofil, in deinem Browser.</p>
          </fieldset>

          <div className="grid gap-2 rounded-xl border border-line bg-surface p-4" data-testid="fakten">
            <p className="font-heading font-medium">Fakten aus deinen Checks</p>
            {fakten.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Diese Punkte stammen aus Ergebnissen in deinem Browser und gehen als Fakten mit an die KI. Was nicht mehr stimmt, änderst du im jeweiligen
                  Werkzeug.
                </p>
                <ul className="grid gap-1.5 text-sm" aria-label="Fakten aus deinen Checks">
                  {fakten.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium">{f.feld === "staerken" ? "Stärke" : "Schwäche"}:</span> {f.text}{" "}
                      <span className="text-muted-foreground">({f.quelle})</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : hatCheck || hatReifegrad ? (
              <p className="text-sm text-muted-foreground">
                Aus deinen Checks ergibt sich kein klarer Fakt: Kein Bereich ist deutlich stark oder deutlich schwach. Es zählt, was du unten schreibst.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Noch keine Fakten. Mach zuerst den{" "}
                <Link href={`/tools/${CHECK_SLUG}`} className="underline underline-offset-4">
                  Digitaler-Auftritt-Check
                </Link>{" "}
                oder den{" "}
                <Link href={`/tools/${REIFEGRAD_SLUG}`} className="underline underline-offset-4">
                  Reifegrad-Check
                </Link>
                , dann stehen hier gemessene Stärken und Schwächen. Ohne Fakten geht es auch, dann zählt, was du unten schreibst.
              </p>
            )}
          </div>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Deine vier Felder</legend>
            <p className="text-sm text-muted-foreground">Mindestens eines der vier Felder braucht Inhalt. Stichworte reichen, eine Aussage je Zeile.</p>

            {FELDER.map((f, i) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`sw-${f.key}`}>
                  {f.label}: {f.frage}
                </Label>
                <Textarea
                  id={`sw-${f.key}`}
                  ref={i === 0 ? firstFieldRef : undefined}
                  rows={3}
                  maxLength={MAX_FELD_CHARS}
                  value={form[f.key]}
                  onChange={(e) => patch({ [f.key]: e.target.value })}
                  aria-describedby={`sw-${f.key}-help sw-${f.key}-count`}
                  lang="de-CH"
                  spellCheck
                />
                <p id={`sw-${f.key}-help`} className="text-sm text-muted-foreground">
                  {f.help}
                </p>
                <p id={`sw-${f.key}-count`} className="mono text-sm text-muted-foreground">
                  {charCount(form[f.key])} von {MAX_FELD_CHARS} Zeichen
                </p>
              </div>
            ))}

            <div className="grid gap-1.5">
              <Label htmlFor="sw-ziel">Ziel für die nächsten zwölf Monate (freiwillig)</Label>
              <Input id="sw-ziel" value={form.ziel} maxLength={MAX_ZIEL_CHARS} onChange={(e) => patch({ ziel: e.target.value })} aria-describedby="sw-ziel-help" />
              <p id="sw-ziel-help" className="text-sm text-muted-foreground">
                Zum Beispiel «mehr Anfragen von Privaten aus Gossau und Umgebung». Die Massnahmen führen dorthin.
              </p>
            </div>

            {positionierung && (
              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="positionierung-hinweis">
                Deine Positionierung aus dem Profil: «{positionierung.slice(0, MAX_FELD_CHARS)}». Sie geht als Hintergrund mit an die KI.{" "}
                <Link href="/profil" className="underline underline-offset-4">
                  Bearbeiten
                </Link>
              </p>
            )}
          </fieldset>

          <p className="text-sm text-muted-foreground">
            Dafür gehen Betrieb, Branche, Ort, Grösse, deine vier Felder und das Ziel{positionierung ? ", dazu die Positionierung aus deinem Profil" : ""}
            {fakten.length > 0 ? " und die Fakten aus deinen Checks" : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse.
            Unser Server speichert die Angaben nicht. Deine Angaben und die SWOT-Analyse gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
            weiterhelfen können. Gib nichts Vertrauliches ein, zum Beispiel keine Zahlen aus der Buchhaltung.
          </p>

          <p id="sw-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              {busy ? "Die KI schreibt …" : "SWOT erstellen"}
            </Button>
            {editing && output && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
          </div>

          {busy && (
            <p role="status" aria-live="polite" className="rounded-xl border border-line p-4 font-medium">
              Die KI schreibt deine SWOT-Analyse.
            </p>
          )}
        </>
      )}

      {output && doc && (
        <ResultCard
          title="Deine SWOT-Analyse"
          headingRef={headingRef}
          actions={
            <>
              <DocumentExport model={doc} />
              <Button type="button" variant="outline" onClick={edit} disabled={editing}>
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
          <p className="font-heading text-lg font-medium" data-testid="ein-satz">
            {output.einSatz}
          </p>
          {placeholders.length > 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {placeholders.join(", ")}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2" data-testid="swot-raster">
            {FELDER.map((f) => (
              <section key={f.key} aria-labelledby={`sw-ergebnis-${f.key}`} className="rounded-xl border border-line p-4">
                <h4 id={`sw-ergebnis-${f.key}`} className="font-heading font-medium">
                  {f.label}
                </h4>
                <ul className="mt-3 grid gap-2" aria-label={f.label}>
                  {output[f.key].map((p, i) => (
                    <li key={i}>
                      <span className="font-medium">{p.punkt}</span> <span className="text-muted-foreground">{p.warum}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="grid gap-3" data-testid="folgerungen">
            <h4 className="font-heading text-lg font-medium">Daraus folgt</h4>
            <DocView blocks={[folgerungenTabelle(output)]} />
          </div>

          {savedInput && savedInput.fakten.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="fakten-hinweis">
              Mit {savedInput.fakten.length === 1 ? "einem Fakt" : `${savedInput.fakten.length} Fakten`} aus deinen Checks erstellt; sie stehen auch im PDF und
              in der Word-Datei.
            </p>
          )}
        </ResultCard>
      )}
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <SwotFlow />
    </ToolShell>
  );
}
