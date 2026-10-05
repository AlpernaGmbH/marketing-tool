"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { LIMITS, strategieGenerator, type KanalKey, type StrategieInput } from "./generator";
import {
  BEITRAEGE,
  EMPTY_FORM,
  EMPTY_STATE,
  FIELD_IDS,
  KANAELE,
  KI_HINWEIS,
  SLUG,
  charCount,
  effectiveKanaele,
  effectiveSaeulen,
  effectiveZielgruppe,
  eingabeText,
  formFromInput,
  hinweisNamen,
  inputProblem,
  isBeitraegeKey,
  kanaeleAusProfil,
  kanalFieldId,
  normalizeKanaele,
  organisationstypVon,
  parseState,
  profilePatch,
  reportMarkdown,
  resultState,
  saeuleFieldId,
  saeulenAusProfil,
  screenBlocks,
  setSaeule,
  toDocument,
  toInput,
  zielFieldId,
  zielListe,
  type StrategieForm,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro() {
  return (
    <p>
      Sag, wofür dein Inhalt da sein soll, was du anbietest und welche Kanäle du nutzt. Eine KI schreibt daraus eine Content-Strategie von zwei bis drei
      Seiten: Kernbotschaft, Ziele, Zielgruppen, Themen, die Rolle jedes Kanals, den Rhythmus und einen Plan für die ersten 90 Tage.
    </p>
  );
}

function StrategieFlow() {
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<StrategieInput | null>(null);
  const gen = useGenerator(strategieGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => (inputRef.current ? reportMarkdown(o, inputRef.current) : ""),
  });

  // null: die Person hat noch nichts getippt. Dann gelten die gespeicherten Angaben (auch ohne Ergebnis), sonst das leere Formular.
  const [typed, setTyped] = useState<StrategieForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  // Fokus nur nach einer Aktion der Person, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
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
  const form = typed ?? (savedInput ? formFromInput(savedInput) : EMPTY_FORM);

  const typ = organisationstypVon(profile);
  const verein = typ === "verein";
  const ziele = zielListe(typ);

  // Felder, die im Profil stehen, sind vorbelegt, solange die Person sie nicht anfasst (Harte Regel 10).
  const zielgruppe = effectiveZielgruppe(form, profile);
  const zielgruppeVomProfil = form.zielgruppe === null && zielgruppe !== "";
  const saeulen = effectiveSaeulen(form, profile);
  const saeulenVomProfil = form.saeulen === null && saeulenAusProfil(profile).length > 0;
  const kanaele = effectiveKanaele(form, profile);
  const kanaeleVomProfil = form.kanaele === null && kanaeleAusProfil(profile).length > 0;
  const hintergrund = hinweisNamen(profile);

  const patch = (p: Partial<StrategieForm>) => {
    setError(null);
    setTyped({ ...form, ...p });
  };

  const toggleKanal = (key: KanalKey, on: boolean) => patch({ kanaele: normalizeKanaele(on ? [...kanaele, key] : kanaele.filter((k) => k !== key)) });

  async function start() {
    const problem = inputProblem(profile, form);
    if (problem) {
      setError(problem.message);
      document.getElementById(problem.fieldId)?.focus();
      return;
    }
    const input = toInput(profile, form);
    if (!input) return setError("Bitte prüfe deine Angaben und versuch es noch einmal.");
    setError(null);
    gen.clearError();
    inputRef.current = input;
    // generate() macht Fenster, Anfrage, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const result = await gen.generate(input);
    if (!result) return;
    shouldFocus.current = true;
    setEditing(false);
    setTyped(null);
    set(resultState(input, result));
    // Ins Profil nur nach einem frisch erzeugten Entwurf und nur, wenn dort noch keine Säulen stehen (TOOL-BAUEN.md, Abschnitt 2).
    const toProfile = profilePatch(profile, result);
    if (toProfile.contentSaeulen) update(toProfile);
  }

  const edit = () => {
    if (!savedInput) return;
    setError(null);
    gen.clearError();
    setTyped(formFromInput(savedInput));
    setEditing(true);
    // Das Formular erscheint erst mit dem nächsten Rendern; der Fokus folgt danach.
    setTimeout(() => document.getElementById(FIELD_IDS.angebot)?.focus(), 0);
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    setTyped(EMPTY_FORM);
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
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">{verein ? "Dein Verein" : "Dein Betrieb"}</legend>
            <ProfileFieldsForm idPrefix="cs" fields={["organisationstyp", "firma", "branche", "ort"]} />
            <p className="text-sm text-muted-foreground md:col-span-2">
              {verein ? "Name, Tätigkeit und Ort" : "Firma, Branche und Ort"} speichern wir in deinem Firmenprofil, in deinem Browser.
            </p>
            {hintergrund.length > 0 && (
              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm md:col-span-2" data-testid="profil-hinweis">
                Aus deinem Profil geht als Hintergrund mit an die KI: {hintergrund.join(" und ")}.{" "}
                <Link href="/profil" className="underline underline-offset-4">
                  Bearbeiten
                </Link>
              </p>
            )}
          </fieldset>

          <fieldset role="radiogroup" className="grid gap-3" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Wofür soll dein Inhalt da sein?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ziele.map((z) => (
                <label
                  key={z.key}
                  htmlFor={zielFieldId(z.key)}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface"
                >
                  <input
                    type="radio"
                    id={zielFieldId(z.key)}
                    name="cs-ziel"
                    value={z.key}
                    checked={form.ziel === z.key}
                    onChange={() => patch({ ziel: z.key })}
                    className="size-5 accent-ink"
                  />
                  {z.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">{verein ? "Dein Verein im Alltag" : "Dein Angebot"}</legend>

            <div className="grid gap-1.5">
              <Label htmlFor={FIELD_IDS.angebot}>
                {verein
                  ? "Was bietet dein Verein an, und was fragen Mitglieder und Interessierte am häufigsten?"
                  : "Was bietest du an, und was fragt dich die Kundschaft am häufigsten?"}
              </Label>
              <Textarea
                id={FIELD_IDS.angebot}
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
                {verein
                  ? "Trainings, Anlässe und Projekte, dazu die Fragen, die Interessierte immer wieder stellen. Zum Beispiel: Training für Juniorinnen und Junioren; «Ab welchem Alter kann man mitmachen?»."
                  : "Leistungen wie auf einer Offerte, dazu die Fragen, die du am Telefon oder vor Ort immer wieder hörst. Zum Beispiel: Fassaden und Innenräume; «Was kostet eine Fassade?», «Wie lange hält die Farbe?»."}
              </p>
              <p id="cs-angebot-count" className="mono text-sm text-muted-foreground">
                {charCount(form.angebot)} von {LIMITS.angebot} Zeichen, mindestens {LIMITS.angebotMin}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={FIELD_IDS.besonders}>Was macht euch besonders? (freiwillig)</Label>
              <Textarea
                id={FIELD_IDS.besonders}
                rows={3}
                maxLength={LIMITS.besonders}
                value={form.besonders}
                onChange={(e) => patch({ besonders: e.target.value })}
                aria-describedby="cs-besonders-help cs-besonders-count"
                lang="de-CH"
                spellCheck
              />
              <p id="cs-besonders-help" className="text-sm text-muted-foreground">
                Was euch von anderen im Ort unterscheidet: eine Haltung, eine Geschichte, ein Versprechen, das ihr haltet.
              </p>
              <p id="cs-besonders-count" className="mono text-sm text-muted-foreground">
                {charCount(form.besonders)} von {LIMITS.besonders} Zeichen
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={FIELD_IDS.zielgruppe}>Hauptzielgruppe (freiwillig)</Label>
              <Input
                id={FIELD_IDS.zielgruppe}
                maxLength={LIMITS.zielgruppe}
                value={zielgruppe}
                onChange={(e) => patch({ zielgruppe: e.target.value })}
                aria-describedby="cs-zielgruppe-help"
                lang="de-CH"
              />
              <p id="cs-zielgruppe-help" className="text-sm text-muted-foreground">
                {zielgruppeVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : ""}
                Wer zuerst angesprochen werden soll, zum Beispiel «Hausbesitzer in Gossau».
              </p>
            </div>
          </fieldset>

          <fieldset className="grid gap-4" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Content-Säulen (freiwillig)</legend>
            <p className="text-sm text-muted-foreground">
              Drei bis fünf feste Themen, aus denen die Beiträge kommen. Lass alle Felder leer, dann schlägt die KI Säulen vor. {saeulenVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : ""}
              Säulen erarbeiten kannst du im Werkzeug{" "}
              <Link href="/tools/content-saeulen" className="underline underline-offset-4">
                Content-Säulen
              </Link>
              .
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {saeulen.map((name, i) => (
                <div key={i} className="grid gap-1.5">
                  <Label htmlFor={saeuleFieldId(i + 1)}>Säule {i + 1}</Label>
                  <Input
                    id={saeuleFieldId(i + 1)}
                    maxLength={LIMITS.saeule}
                    value={name}
                    onChange={(e) => patch({ saeulen: setSaeule(saeulen, i, e.target.value) })}
                    autoComplete="off"
                    lang="de-CH"
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Kanäle und Rhythmus</legend>

            <fieldset className="grid gap-3">
              <legend className="mb-1 font-medium">Kanäle</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {KANAELE.map((k) => (
                  <div key={k.key} className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      id={kanalFieldId(k.key)}
                      aria-label={k.label}
                      checked={kanaele.includes(k.key)}
                      onCheckedChange={(v) => toggleKanal(k.key, v === true)}
                      disabled={!ready || busy}
                    />
                    <label htmlFor={kanalFieldId(k.key)} className="cursor-pointer">
                      {k.label}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {kanaeleVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : ""}
                Die Strategie gibt jedem gewählten Kanal eine Rolle.
              </p>
            </fieldset>

            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor={FIELD_IDS.beitraege}>Wie viele Beiträge pro Woche sind realistisch?</Label>
              <select
                id={FIELD_IDS.beitraege}
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
                Lieber tief ansetzen und halten. Der Rhythmus der Strategie baut darauf auf.
              </p>
            </div>
          </fieldset>

          <p className="text-sm text-muted-foreground" data-testid="ki-weg">
            Dafür gehen {verein ? "Verein" : "Betrieb"}, Branche, Ort, das Ziel, dein Angebot, das Besondere, die Hauptzielgruppe, die Säulen, die Kanäle
            und die Zahl der Beiträge
            {hintergrund.length > 0 ? `, dazu ${hintergrund.join(" und ")} aus deinem Profil,` : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht deine
            E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und die Strategie gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei
            Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
          </p>

          <p id="cs-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              {busy ? "Die KI schreibt …" : "Strategie erstellen"}
            </Button>
            {editing && output && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
          </div>
        </>
      )}

      <p role="status" aria-live="polite" className={busy ? "rounded-xl border border-line p-4 font-medium" : "sr-only"}>
        {busy ? "Die KI schreibt deine Content-Strategie." : ""}
      </p>

      {output && doc && (
        <ResultCard
          title="Deine Content-Strategie"
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
          {placeholders.length > 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {placeholders.join(", ")}
            </p>
          )}
          <div data-testid="strategie">
            <DocView blocks={screenBlocks(doc)} />
          </div>
          <nav aria-label="Weiter mit deiner Strategie" className="grid gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="weiter">
            <p className="font-medium">Weiter mit deiner Strategie</p>
            <ul className="grid gap-4 sm:grid-cols-2">
              <li className="grid justify-items-start gap-2">
                <Link href="/tools/content-saeulen" className={buttonVariants({ variant: "outline" })}>
                  Säulen vertiefen
                </Link>
                <span className="text-muted-foreground">Beispiele und ein Wochenplan für jede Säule.</span>
              </li>
              <li className="grid justify-items-start gap-2">
                <Link href="/tools/posting-plan" className={buttonVariants({ variant: "outline" })}>
                  Plan nach Zeitbudget
                </Link>
                <span className="text-muted-foreground">Aus deinen Wochenstunden wird ein Plan für vier Wochen.</span>
              </li>
            </ul>
          </nav>
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
      <StrategieFlow />
    </ToolShell>
  );
}
