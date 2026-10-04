"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { KANAL_KEYS, LIMITS, saeulenGenerator, type KanalKey, type SaeulenInput } from "./generator";
import {
  BEITRAEGE,
  EMPTY_FORM,
  EMPTY_STATE,
  KANAELE,
  KI_HINWEIS,
  SLUG,
  effectiveKanaele,
  eingabeText,
  formFromInput,
  inputProblem,
  isBeitraegeKey,
  kanaeleAusProfil,
  parseState,
  personaNamen,
  profilePatch,
  reportMarkdown,
  screenBlocks,
  toDocument,
  toInput,
  type SaeulenForm,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro() {
  return (
    <p>
      Sag, was du anbietest, was deine Kundschaft fragt und was du gern aus dem Alltag zeigst. Eine KI macht daraus vier bis fünf Content-Säulen: feste
      Themenfelder mit Beispielen für Beiträge, einem Anteil je Säule und einem Wochenplan, der zu der Zahl Beiträge passt, die du schaffst.
    </p>
  );
}

function SaeulenFlow() {
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<SaeulenInput | null>(null);
  const gen = useGenerator(saeulenGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => reportMarkdown(o, inputRef.current),
  });

  const [form, setForm] = useState<SaeulenForm>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const angebotRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocus = useRef(false);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || gen.busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved.output, gen.busy]);

  const busy = gen.busy;
  const shownError = error ?? gen.error;
  const output = ready && !busy ? saved.output : null;
  const savedInput = ready ? saved.input : null;
  const showForm = !output || editing;

  // Kanäle: die gewählten, sonst der Vorschlag aus dem Profil (Harte Regel 10).
  const kanaele = effectiveKanaele(form, profile);
  const kanaeleVomProfil = form.kanaele === null && kanaeleAusProfil(profile).length > 0;
  const positionierung = profile.positionierung?.trim().slice(0, LIMITS.positionierung) ?? "";
  const primaersegment = profile.primaersegment?.trim().slice(0, LIMITS.primaersegment) ?? "";
  const personas = personaNamen(profile);
  const hintergrund = [positionierung ? "die Positionierung" : "", primaersegment ? "die Zielgruppe" : "", personas.length > 0 ? "die Namen der Personas" : ""].filter(Boolean);
  const hinweisTeile = [
    positionierung ? `die Positionierung «${positionierung}»` : "",
    primaersegment ? `die Zielgruppe «${primaersegment}»` : "",
    personas.length > 0 ? `die Personas ${personas.join(", ")}` : "",
  ].filter(Boolean);

  const patch = (p: Partial<SaeulenForm>) => {
    setError(null);
    setForm((f) => ({ ...f, ...p }));
  };

  const toggleKanal = (key: KanalKey, on: boolean) => patch({ kanaele: KANAL_KEYS.filter((k) => (k === key ? on : kanaele.includes(k))) });

  async function start() {
    const problem = inputProblem({ firma: profile.firma }, form, kanaele);
    if (problem) return setError(problem);
    const input = toInput(profile, form, kanaele);
    if (!input) return setError("Bitte prüfe deine Angaben und versuch es noch einmal.");
    setError(null);
    gen.clearError();
    inputRef.current = input;
    // generate() macht Fenster, Anfrage, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const result = await gen.generate(input);
    if (!result) return;
    shouldFocus.current = true;
    setEditing(false);
    set({ v: 1, input, output: result });
    // Ins Profil nur nach einem frisch erzeugten Entwurf und nur, wenn dort noch keine Säulen stehen (TOOL-BAUEN.md, Abschnitt 2).
    const profilPatch = profilePatch(profile, result);
    if (profilPatch.contentSaeulen) update(profilPatch);
  }

  const edit = () => {
    if (!savedInput) return;
    setError(null);
    gen.clearError();
    setForm(formFromInput(savedInput));
    setEditing(true);
    // Das Formular erscheint erst mit dem nächsten Rendern; der Fokus folgt danach.
    setTimeout(() => angebotRef.current?.focus(), 0);
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    setForm(EMPTY_FORM);
    setEditing(false);
    set(EMPTY_STATE);
  };

  const doc = output ? toDocument(output, savedInput) : null;
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
            <ProfileFieldsForm idPrefix="cs" fields={["firma", "branche", "ort"]} />
            <p className="text-sm text-muted-foreground md:col-span-3">Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.</p>
            {hinweisTeile.length > 0 && (
              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm md:col-span-3" data-testid="profil-hinweis">
                Aus deinem Profil geht als Hintergrund mit an die KI: {hinweisTeile.join(", ")}.{" "}
                <Link href="/profil" className="underline underline-offset-4">
                  Bearbeiten
                </Link>
              </p>
            )}
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Deine Themen</legend>

            <div className="grid gap-1.5">
              <Label htmlFor="cs-angebot">Was bietest du an, und was fragt dich die Kundschaft am häufigsten?</Label>
              <Textarea
                id="cs-angebot"
                ref={angebotRef}
                rows={4}
                maxLength={LIMITS.angebot}
                value={form.angebot}
                onChange={(e) => patch({ angebot: e.target.value })}
                aria-describedby="cs-angebot-help cs-angebot-count"
                aria-required="true"
                lang="de-CH"
                spellCheck
              />
              <p id="cs-angebot-help" className="text-sm text-muted-foreground">
                Leistungen wie auf einer Offerte, dazu die Fragen, die du am Telefon oder vor Ort immer wieder hörst. Zum Beispiel: Fassaden und Innenräume;
                «Was kostet eine Fassade?», «Wie lange hält die Farbe?».
              </p>
              <p id="cs-angebot-count" className="mono text-sm text-muted-foreground">
                {form.angebot.length} von {LIMITS.angebot} Zeichen, mindestens {LIMITS.angebotMin}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="cs-alltag">Was zeigst du gern aus dem Alltag? (freiwillig)</Label>
              <Textarea
                id="cs-alltag"
                rows={3}
                maxLength={LIMITS.alltag}
                value={form.alltag}
                onChange={(e) => patch({ alltag: e.target.value })}
                aria-describedby="cs-alltag-help cs-alltag-count"
                lang="de-CH"
                spellCheck
              />
              <p id="cs-alltag-help" className="text-sm text-muted-foreground">
                Baustelle, Werkstatt, Team, Region: was du ohne Aufwand fotografieren oder filmen kannst.
              </p>
              <p id="cs-alltag-count" className="mono text-sm text-muted-foreground">
                {form.alltag.length} von {LIMITS.alltag} Zeichen
              </p>
            </div>

            <fieldset className="grid gap-3">
              <legend className="mb-1 font-medium">Kanäle</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {KANAELE.map((k) => (
                  <div key={k.key} className="flex min-h-11 items-center gap-3">
                    <Checkbox id={`cs-kanal-${k.key}`} checked={kanaele.includes(k.key)} onCheckedChange={(v) => toggleKanal(k.key, v === true)} disabled={!ready || busy} />
                    <label htmlFor={`cs-kanal-${k.key}`} className="cursor-pointer">
                      {k.label}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {kanaeleVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : ""}
                Der Wochenplan verteilt die Beiträge auf die gewählten Kanäle.
              </p>
            </fieldset>

            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="cs-beitraege">Wie viele Beiträge pro Woche sind realistisch?</Label>
              <select
                id="cs-beitraege"
                className={selectClass}
                value={form.beitraegeProWoche}
                onChange={(e) => patch({ beitraegeProWoche: isBeitraegeKey(e.target.value) ? e.target.value : "" })}
                aria-describedby="cs-beitraege-help"
                aria-required="true"
              >
                <option value="">Bitte wählen</option>
                {BEITRAEGE.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
              <p id="cs-beitraege-help" className="text-sm text-muted-foreground">
                Lieber tief ansetzen und halten. Der Wochenplan hat genau so viele Einträge.
              </p>
            </div>
          </fieldset>

          <p className="text-sm text-muted-foreground">
            Dafür gehen Betrieb, Branche, Ort, dein Angebot, der Alltag, die Kanäle und die Zahl der Beiträge
            {hintergrund.length > 0 ? `, dazu ${hintergrund.join(", ")} aus deinem Profil,` : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht
            deine E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und die Säulen gehen mit deiner E-Mail-Adresse an Alperna, damit wir
            dir bei Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
          </p>

          <p id="cs-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              {busy ? "Die KI schreibt …" : "Säulen erstellen"}
            </Button>
            {editing && output && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {busy ? "Die KI schreibt deine Content-Säulen." : ""}
          </p>
        </>
      )}

      {output && doc && (
        <ResultCard
          title="Deine Content-Säulen"
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
          <div data-testid="saeulen">
            <DocView blocks={screenBlocks(doc)} />
          </div>
          <p className="text-sm text-muted-foreground">
            Die Säulen stehen in deinem Firmenprofil unter «Content-Säulen», sofern dort noch keine standen. Andere Werkzeuge lesen sie dort.
          </p>
        </ResultCard>
      )}
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <SaeulenFlow />
    </ToolShell>
  );
}
