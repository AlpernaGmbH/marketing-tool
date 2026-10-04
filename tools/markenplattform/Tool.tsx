"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { placeholdersIn } from "@/lib/generator";
import { readWebsite } from "@/lib/read-client";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { LIMITS, markenGenerator, type MarkenInput } from "./generator";
import {
  ANREDEN,
  EMPTY_FORM,
  EMPTY_STATE,
  KI_HINWEIS,
  SLUG,
  charCount,
  eingabeText,
  hostOf,
  inputProblem,
  looksLikeWebsite,
  normalizeOutput,
  parseState,
  profilHinweise,
  profilePatch,
  reportMarkdown,
  storedInput,
  toDocument,
  toForm,
  toInput,
  viewBlocks,
  withVorschlag,
  type FormValues,
  type PageLike,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Step = "lesen" | "schreiben";

function Intro() {
  return (
    <p>
      Sag in drei Antworten, wofür dein Betrieb steht, wie ihn die Kundschaft beschreiben soll und was er nie tun würde. Eine KI macht daraus deine
      Markenplattform auf einer Seite: Versprechen, Werte als Verhalten, Persönlichkeit, Tonalität mit Beispielsatz, Wörter zum Verwenden und Vermeiden,
      eine kurze Geschichte und Regeln für Antworten auf Bewertungen. Auf Wunsch liest das Werkzeug deine Startseite und sagt, wie sie heute klingt.
    </p>
  );
}

function MarkenFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<MarkenInput | null>(null);
  const gen = useGenerator(markenGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => reportMarkdown(normalizeOutput(o, (inputRef.current?.websiteText ?? "") !== ""), inputRef.current),
  });

  // Änderungen am Formular leben im Entwurf, bis die Plattform entsteht; vorher gilt die gespeicherte Eingabe.
  const [draft, setDraft] = useState<FormValues | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Meldung, wenn die Website nicht gelesen werden konnte; der Entwurf entstand dann ohne sie. */
  const [readNote, setReadNote] = useState<string | null>(null);
  /** true nach einem frischen Entwurf, der Werte, Ton und Wörter ins Profil geschrieben hat. */
  const [profilGeschrieben, setProfilGeschrieben] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wofuerRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocus = useRef(false);

  const base = draft ?? toForm(saved.input, saved.website);
  // Die Checkbox folgt dem Profil, bis die Person sie anklickt (websiteLesen null = Vorschlag).
  const form = withVorschlag(base, profile);
  const hinweise = profilHinweise(profile);
  const website = profile.website ?? "";
  const shownError = error ?? gen.error;
  const output = ready && !busy ? saved.output : null;
  const showForm = !output || editing;

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved.output, busy]);

  const setField = (patch: Partial<FormValues>) => {
    setError(null);
    setDraft({ ...base, ...patch });
  };

  async function start() {
    const problem = inputProblem({ firma: profile.firma, website: profile.website }, form);
    if (problem) return setError(problem);
    setError(null);
    gen.clearError();
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;

      let page: PageLike | null = null;
      let note: string | null = null;
      if (form.websiteLesen) {
        setStep("lesen");
        let read = await readWebsite(website);
        // Der Server kennt keine Adresse (Cookie fehlt): erst das Fenster, dann einmal wiederholen.
        if (!read.ok && read.reason === "gate") {
          if (!(await ctx.renewEmail())) return;
          read = await readWebsite(website);
        }
        // Jeder andere Fehler bricht nicht ab: Der Entwurf entsteht ohne Website, mit Hinweis über dem Ergebnis.
        if (read.ok) page = read.page;
        else note = read.message;
      }

      setStep("schreiben");
      const input = toInput(profile, form, page);
      if (!input) return setError("Bitte prüfe deine Angaben und versuch es noch einmal.");
      inputRef.current = input;
      // generate() macht Fenster, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
      const result = await gen.generate(input);
      if (!result) return;
      const next = normalizeOutput(result, input.websiteText !== "");
      shouldFocus.current = true;
      set({ v: 1, input: storedInput(input), output: next, website: page ? page.host : "" });
      setReadNote(note);
      setDraft(null);
      setEditing(false);
      // Ins Profil nur nach einem frisch erzeugten Entwurf und nur in eine leere Marke (TOOL-BAUEN.md, Abschnitt 2).
      const patch = profilePatch(profile, next, input);
      if (Object.keys(patch).length > 0) update(patch);
      setProfilGeschrieben(Object.keys(patch).length > 0);
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  const edit = () => {
    setError(null);
    gen.clearError();
    setDraft(toForm(saved.input, saved.website));
    setEditing(true);
    setTimeout(() => wofuerRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setError(null);
    setDraft(null);
    setEditing(false);
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    setDraft({ ...EMPTY_FORM });
    setEditing(false);
    setReadNote(null);
    setProfilGeschrieben(false);
    set(EMPTY_STATE);
  };

  const doc = output ? toDocument(output, saved.input) : null;
  const placeholders = output ? placeholdersIn(output) : [];
  const websiteOk = looksLikeWebsite(website);

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
            <ProfileFieldsForm idPrefix="mp" fields={["firma", "branche", "ort", "website"]} />
            <p className="text-sm text-muted-foreground md:col-span-2">Firma, Branche, Ort und Website speichern wir in deinem Firmenprofil, in deinem Browser.</p>
          </fieldset>

          {(hinweise.positionierung || hinweise.zielgruppe) && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="profil-hinweis">
              Aus deinem Profil geht mit:{hinweise.zielgruppe ? ` Primärsegment «${hinweise.zielgruppe}».` : ""}
              {hinweise.positionierung ? ` Positionierung «${hinweise.positionierung}».` : ""}{" "}
              <Link href="/profil" className="underline underline-offset-4">
                Bearbeiten
              </Link>
            </p>
          )}

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Deine Marke</legend>

            <div className="grid gap-1.5">
              <Label htmlFor="mp-wofuer">Wofür steht dein Betrieb?</Label>
              <Textarea
                id="mp-wofuer"
                ref={wofuerRef}
                rows={4}
                value={form.wofuer}
                maxLength={LIMITS.wofuer}
                onChange={(e) => setField({ wofuer: e.target.value })}
                aria-describedby="mp-wofuer-help mp-wofuer-count"
                aria-required="true"
                lang="de-CH"
                spellCheck
              />
              <p id="mp-wofuer-help" className="text-sm text-muted-foreground">
                Zwei bis vier Sätze: Was dir bei der Arbeit wichtig ist, was deine Kundschaft an dir schätzt, was dich von anderen in der Region unterscheidet.
              </p>
              <p id="mp-wofuer-count" className="mono text-sm text-muted-foreground">
                {charCount(form.wofuer)} von {LIMITS.wofuer} Zeichen, mindestens {LIMITS.wofuerMin}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mp-woerter">Drei Wörter, mit denen Kundschaft dich beschreiben soll</Label>
              <Input
                id="mp-woerter"
                value={form.woerterKundschaft}
                maxLength={LIMITS.woerterKundschaft}
                onChange={(e) => setField({ woerterKundschaft: e.target.value })}
                aria-describedby="mp-woerter-help"
                aria-required="true"
                lang="de-CH"
              />
              <p id="mp-woerter-help" className="text-sm text-muted-foreground">
                Zum Beispiel: zuverlässig, bodenständig, genau.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mp-nie">Was würdest du nie sagen oder tun? (freiwillig)</Label>
              <Textarea
                id="mp-nie"
                rows={3}
                value={form.nie}
                maxLength={LIMITS.nie}
                onChange={(e) => setField({ nie: e.target.value })}
                aria-describedby="mp-nie-help mp-nie-count"
                lang="de-CH"
                spellCheck
              />
              <p id="mp-nie-help" className="text-sm text-muted-foreground">
                Zum Beispiel: Rabatte anpreisen, Fachwörter ohne Erklärung, Versprechen über Termine, die wir nicht halten können.
              </p>
              <p id="mp-nie-count" className="mono text-sm text-muted-foreground">
                {charCount(form.nie)} von {LIMITS.nie} Zeichen
              </p>
            </div>

            <div className="grid gap-1.5 md:max-w-xs">
              <Label htmlFor="mp-anrede">Anrede deiner Kundschaft</Label>
              <select
                id="mp-anrede"
                className={selectClass}
                value={form.anrede}
                onChange={(e) => setField({ anrede: e.target.value as FormValues["anrede"] })}
                aria-describedby="mp-anrede-help"
                aria-required="true"
              >
                <option value="">Bitte wählen</option>
                {ANREDEN.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <p id="mp-anrede-help" className="text-sm text-muted-foreground">
                So spricht dein Betrieb seine Kundschaft an, auf der Website, in Offerten und in Antworten auf Bewertungen.
              </p>
            </div>

            <div className="grid gap-1.5">
              <div className="flex min-h-11 items-center gap-3">
                <Checkbox
                  id="mp-website-lesen"
                  checked={ready && profileReady && form.websiteLesen}
                  onCheckedChange={(v) => setField({ websiteLesen: v === true })}
                  disabled={!ready || !profileReady || busy}
                  aria-describedby="mp-website-lesen-help"
                />
                <label htmlFor="mp-website-lesen" className="cursor-pointer">
                  Website für den heutigen Ton lesen
                </label>
              </div>
              <p id="mp-website-lesen-help" className="text-sm text-muted-foreground">
                Freiwillig. Wir lesen den Text deiner Startseite (bis {"4'000"} Zeichen), und die KI sagt, wie sie heute klingt und was sich ändert.
                {websiteOk ? ` Gelesen wird ${hostOf(website)}.` : " Trag dafür oben deine Website ein."}
              </p>
            </div>
          </fieldset>

          <p className="text-sm text-muted-foreground">
            Dafür gehen Betrieb, Branche, Ort, deine drei Antworten und die Anrede
            {hinweise.positionierung || hinweise.zielgruppe ? ", dazu Positionierung und Primärsegment aus deinem Profil" : ""}
            {form.websiteLesen ? " und der Text deiner Startseite" : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse.
            Unser Server speichert die Angaben nicht. Deine Angaben und der Entwurf gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
            weiterhelfen können. Gib nichts Vertrauliches ein.
          </p>

          <p id="mp-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              {busy ? "Bitte warten …" : "Markenplattform erstellen"}
            </Button>
            {editing && saved.output && (
              <Button type="button" variant="ghost" disabled={busy} onClick={cancelEdit}>
                Abbrechen
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
          </div>

          {busy && (
            <p role="status" aria-live="polite" className="rounded-xl border border-line p-4 font-medium">
              {step === "lesen" ? `Wir lesen die Startseite von ${hostOf(website)}.` : step === "schreiben" ? "Die KI schreibt deine Markenplattform." : "Einen Moment."}
            </p>
          )}
        </>
      )}

      {output && doc && (
        <ResultCard
          title="Deine Markenplattform"
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
          {saved.website && (
            <p data-testid="website-gelesen">
              Mit dem Text der Startseite von <span className="font-medium">{saved.website}</span>.
            </p>
          )}
          {readNote && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="website-hinweis">
              Die Website konnte nicht gelesen werden: {readNote} Der Entwurf entstand ohne sie.
            </p>
          )}
          {placeholders.length > 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {placeholders.join(", ")}
            </p>
          )}
          <DocView blocks={viewBlocks(doc)} />
          <p className="text-sm text-muted-foreground">
            {profilGeschrieben
              ? "Werte, Persönlichkeit, Tonalität, Wörter und Bewertungsregeln stehen in deinem Firmenprofil unter «Marke». "
              : ""}
            Der Text-Umschreiber bringt bestehende Texte in diesen Ton. Für eine andere Fassung änderst du oben die Angaben und klickst erneut auf
            «Markenplattform erstellen».
          </p>
        </ResultCard>
      )}
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <MarkenFlow />
    </ToolShell>
  );
}
