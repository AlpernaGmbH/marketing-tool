"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isKiDown } from "@/lib/generate-client";
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { LIMITS, bewertungsantwortGenerator, type BewertungInput, type LaengeKey } from "./generator";
import {
  ANREDEN,
  EMPTY_STATE,
  KI_HINWEIS,
  LAENGEN,
  SLUG,
  STERNE,
  VORLAGE_AUSGABE,
  VORLAGE_HINWEIS,
  VORLAGE_ZUSATZ,
  anredeFromProfile,
  charCount,
  eingabeText,
  hinweisNamen,
  hinweisText,
  inputProblem,
  isAnrede,
  parseState,
  profilHinweise,
  profilRegeln,
  profilePatch,
  regelnVorschlag,
  reportMarkdown,
  shownVarianten,
  sterneLabel,
  toInput,
  kopierLabel,
  varianteTitel,
  type Anrede,
  type FormValues,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const chipClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";

/** Schritte der Ladeansicht: Das Werkzeug liest die Bewertung, schreibt zwei Antworten und prüft sie (Anrede, Zahlen, Versprechen). */
const LOADING_STEPS = ["Bewertung lesen", "Antworten schreiben", "Antworten kontrollieren"];

const sameInput = (a: BewertungInput | null, b: BewertungInput | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Was die Person getippt hat. `null` heisst: noch nicht angefasst, dann gilt der Vorschlag (letzte Angaben dieses Werkzeugs,
 * sonst das Firmenprofil; Harte Regel 10).
 */
type Draft = {
  bewertung: string;
  sterne: number | null;
  anrede: Anrede | "" | null;
  laenge: LaengeKey | null;
  unterschrift: string | null;
  regeln: string[] | null;
};

const EMPTY_DRAFT: Draft = { bewertung: "", sterne: null, anrede: null, laenge: null, unterschrift: null, regeln: null };

/** Ein Versuch, den Entwurf zu holen. `keep`: Es gibt schon einen Entwurf, den ein Ausfall der KI nicht ersetzen soll. */
type Attempt = { input: BewertungInput; keep: boolean };

function Intro() {
  return (
    <p>
      Füge den Text einer Google-Bewertung ein und wähle die Sterne. Eine KI schreibt zwei Antworten als Inhaberin oder Inhaber: ein Dank, der sich auf die
      Bewertung bezieht, und bei Kritik ein ruhiges Bedauern mit einem Angebot zum Gespräch. Deine eigenen Regeln und der Ton aus deinem Firmenprofil gelten
      dabei.
    </p>
  );
}

function AntwortFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<BewertungInput | null>(null);
  const gen = useGenerator(bewertungsantwortGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => (inputRef.current ? reportMarkdown(o, inputRef.current) : ""),
    loadingSteps: LOADING_STEPS,
  });

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const handled = useRef<Attempt | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bewertungRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocus = useRef(false);
  const savedRef = useRef(saved);

  useEffect(() => {
    savedRef.current = saved;
  });

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || gen.busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved, gen.busy]);

  const busy = gen.busy;
  const savedInput = ready ? saved.input : null;
  const shown = ready ? shownVarianten(saved) : null;
  const showForm = !shown || editing;

  // Ist die KI nicht erreichbar, erscheint die feste Vorlage: gespeichert wird nur das Kennzeichen (die Vorlage folgt aus
  // der Eingabe), und ein CRM-Eintrag «Vorlage (ohne KI)» geht einmal hinaus. Ein vorhandener Entwurf bleibt (`keep`).
  // Wenn die KI nicht antwortet, erscheint statt des Entwurfs die feste Vorlage. Bei «invalid» und «gate» nicht.
  const kiDown = isKiDown(gen.error);
  useEffect(() => {
    if (busy || !attempt || attempt.keep || !kiDown || handled.current === attempt) return;
    handled.current = attempt;
    const schonVorlage = savedRef.current.vorlage && sameInput(savedRef.current.input, attempt.input);
    shouldFocus.current = true;
    setEditing(false);
    set({ v: 1, input: attempt.input, output: null, vorlage: true });
    if (!schonVorlage) void ctx.sendResult({ eingabe: eingabeText(attempt.input), ausgabe: VORLAGE_AUSGABE });
  }, [busy, attempt, kiDown, set, ctx]);

  // Wirksame Werte: was getippt wurde, sonst die letzten Angaben (Anrede, Länge, Unterschrift), sonst der Vorschlag aus dem Profil
  // (Anrede, Regeln). Die Regeln stehen im Profil, weil das Werkzeug sie dort beim Erstellen ablegt.
  const anrede: Anrede | "" = draft.anrede ?? savedInput?.anrede ?? (profileReady ? anredeFromProfile(profile) : "");
  const laenge: LaengeKey = draft.laenge ?? savedInput?.laenge ?? "kurz";
  const unterschrift = draft.unterschrift ?? savedInput?.unterschrift ?? "";
  const regeln = draft.regeln ?? regelnVorschlag(profile);
  const anredeVomProfil = draft.anrede === null && !savedInput && anrede !== "";
  const regelnVomProfil = draft.regeln === null && regeln.length > 0;
  const regelnImProfil = profilRegeln(profile).length;

  const hinweise = profilHinweise(profile);
  const hinweis = hinweisText(hinweise);
  const profilTeile = hinweisNamen(hinweise);

  const patch = (p: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...p }));
  };

  const setRegel = (index: number, value: string) => patch({ regeln: [0, 1, 2].map((i) => (i === index ? value : (regeln[i] ?? ""))) });

  async function run(input: BewertungInput, keep: boolean) {
    setError(null);
    gen.clearError();
    inputRef.current = input;
    const next: Attempt = { input, keep };
    handled.current = null;
    setAttempt(next);
    // generate() macht Fenster, Anfrage, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const result = await gen.generate(input);
    if (!result) return;
    shouldFocus.current = true;
    setEditing(false);
    set({ v: 1, input, output: result, vorlage: false });
  }

  async function start() {
    const values: FormValues = { bewertung: draft.bewertung, sterne: draft.sterne, anrede, laenge, unterschrift, regeln };
    const problem = inputProblem({ firma: profile.firma }, values);
    if (problem) return setError(problem);
    const input = toInput(profile, values);
    if (!input) return setError("Bitte prüfe deine Angaben und versuch es noch einmal.");
    // Die Regeln der Person gehören ins Firmenprofil und stehen beim nächsten Mal wieder da (writesProfile: marke).
    const profilPatch = profilePatch(profile, regeln);
    if (profilPatch.marke) update(profilPatch);
    await run(input, false);
  }

  const regenerate = () => {
    if (savedInput) void run(savedInput, Boolean(saved.output));
  };

  const edit = () => {
    if (!savedInput) return;
    setError(null);
    gen.clearError();
    setDraft({
      bewertung: savedInput.bewertung,
      sterne: savedInput.sterne,
      anrede: savedInput.anrede,
      laenge: savedInput.laenge,
      unterschrift: savedInput.unterschrift,
      regeln: [...savedInput.regeln],
    });
    setEditing(true);
    // Das Formular erscheint erst mit dem nächsten Rendern; der Fokus folgt danach.
    setTimeout(() => bewertungRef.current?.focus(), 0);
  };

  // «Neu beginnen» leert die Bewertung und das Ergebnis; Anrede, Länge und Unterschrift der letzten Angaben bleiben als Vorschlag, die Regeln stehen im Profil.
  const restart = () => {
    setError(null);
    gen.clearError();
    setDraft(EMPTY_DRAFT);
    setEditing(false);
    set(savedInput ? { v: 1, input: savedInput, output: null, vorlage: false } : EMPTY_STATE);
    setTimeout(() => bewertungRef.current?.focus(), 0);
  };

  const shownError = error ?? gen.error;
  const cardError = shown?.vorlage && kiDown ? null : shownError;
  const placeholders = shown ? placeholdersIn(shown.varianten) : [];
  const disabledForm = busy || !ready || !profileReady;

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
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:max-w-md" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
            <ProfileFieldsForm idPrefix="bw" fields={["firma"]} />
            <p className="text-sm text-muted-foreground">Die Firma speichern wir in deinem Firmenprofil, in deinem Browser.</p>
          </fieldset>

          {hinweis && (
            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="profil-hinweis">
              <p>
                {hinweis}{" "}
                <Link href="/profil" className="underline underline-offset-4">
                  Bearbeiten
                </Link>
              </p>
            </div>
          )}

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Deine Antwort</legend>

            <div className="grid gap-1.5 md:max-w-sm">
              <Label htmlFor="bw-anrede">Anrede</Label>
              <select
                id="bw-anrede"
                className={selectClass}
                value={anrede}
                onChange={(e) => patch({ anrede: isAnrede(e.target.value) ? e.target.value : "" })}
                aria-describedby="bw-anrede-help"
                aria-required="true"
              >
                <option value="">Bitte wählen</option>
                {ANREDEN.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <p id="bw-anrede-help" className="text-sm text-muted-foreground">
                {anredeVomProfil ? "Vorschlag aus deinem Firmenprofil. " : ""}
                Wie du die Person ansprichst, die bewertet hat.
              </p>
            </div>

            <fieldset className="grid gap-2" role="radiogroup" aria-required="true">
              <legend className="mb-1 font-medium">Länge</legend>
              <div className="flex flex-wrap gap-3">
                {LAENGEN.map((l) => (
                  <label key={l.key} htmlFor={`bw-laenge-${l.key}`} className={chipClass}>
                    <input
                      id={`bw-laenge-${l.key}`}
                      type="radio"
                      name="bw-laenge"
                      value={l.key}
                      checked={laenge === l.key}
                      onChange={() => patch({ laenge: l.key })}
                      className="size-5 accent-ink"
                    />
                    {l.label}: {l.hint}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-1.5 md:max-w-sm">
              <Label htmlFor="bw-unterschrift">Unterschrift</Label>
              <Input
                id="bw-unterschrift"
                value={unterschrift}
                maxLength={LIMITS.unterschrift}
                onChange={(e) => patch({ unterschrift: e.target.value })}
                aria-describedby="bw-unterschrift-help"
                aria-required="true"
                autoComplete="off"
              />
              <p id="bw-unterschrift-help" className="text-sm text-muted-foreground">
                Steht am Ende jeder Antwort. Zum Beispiel «Vorname Nachname, {profile.firma?.trim() || "Firma"}».
              </p>
            </div>
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Die Bewertung</legend>

            <div className="grid gap-1.5">
              <Label htmlFor="bw-bewertung">Text der Bewertung</Label>
              <Textarea
                id="bw-bewertung"
                ref={bewertungRef}
                rows={5}
                maxLength={LIMITS.bewertung}
                value={draft.bewertung}
                onChange={(e) => patch({ bewertung: e.target.value })}
                aria-describedby="bw-bewertung-help bw-bewertung-count"
                aria-required="true"
                lang="de-CH"
              />
              <p id="bw-bewertung-help" className="text-sm text-muted-foreground">
                Nur den Text, keinen Namen der Person.
              </p>
              <p id="bw-bewertung-count" className="mono text-sm text-muted-foreground">
                {charCount(draft.bewertung)} von {LIMITS.bewertung} Zeichen
              </p>
            </div>

            <fieldset className="grid gap-2" role="radiogroup" aria-required="true">
              <legend className="mb-1 font-medium">Sterne</legend>
              <div className="flex flex-wrap gap-3">
                {STERNE.map((n) => (
                  <label key={n} htmlFor={`bw-sterne-${n}`} className={chipClass}>
                    <input
                      id={`bw-sterne-${n}`}
                      type="radio"
                      name="bw-sterne"
                      value={n}
                      checked={draft.sterne === n}
                      onChange={() => patch({ sterne: n })}
                      className="size-5 accent-ink"
                    />
                    {sterneLabel(n)}
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>

          <fieldset className="grid gap-4 md:max-w-xl" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Eigene Regeln (freiwillig)</legend>
            <p id="bw-regeln-help" className="text-sm text-muted-foreground">
              Bis zu drei Regeln für den Ton und den Inhalt, zum Beispiel «immer zum Besuch im Laden einladen», «bei Kritik Gesprächsangebot machen» oder «nie
              Rabatte versprechen». Wir speichern sie in deinem Firmenprofil, in deinem Browser, und füllen sie beim nächsten Mal wieder ein.
              {regelnVomProfil ? " Vorschlag aus deinem Firmenprofil." : ""}
              {regelnImProfil > LIMITS.regeln
                ? ` In deinem Profil stehen ${regelnImProfil} Regeln; hier erscheinen die ersten drei, und beim Erstellen ersetzen die Regeln hier jene im Profil.`
                : ""}
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid gap-1.5">
                <Label htmlFor={`bw-regel-${i + 1}`}>Regel {i + 1}</Label>
                <Input
                  id={`bw-regel-${i + 1}`}
                  value={regeln[i] ?? ""}
                  maxLength={LIMITS.regel}
                  onChange={(e) => setRegel(i, e.target.value)}
                  aria-describedby="bw-regeln-help"
                  autoComplete="off"
                />
              </div>
            ))}
          </fieldset>

          <p className="text-sm text-muted-foreground">
            Dafür gehen der Text der Bewertung, die Sterne, der Name deines Betriebs, Anrede, Länge, Unterschrift und deine Regeln
            {profilTeile.length > 0 ? `, dazu ${profilTeile.join(" und ")} aus deinem Profil,` : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht
            deine E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und die Antwort gehen mit deiner E-Mail-Adresse an Alperna, damit wir
            dir bei Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
          </p>

          <p id="bw-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={disabledForm}>
              {busy ? "Die KI schreibt …" : "Antwort schreiben"}
            </Button>
            {editing && shown && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
          </div>
        </>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {busy ? "Die KI schreibt deine Antwort." : ""}
      </p>

      {!showForm && shown && savedInput && (
        <ResultCard
          title="Deine Antwort"
          headingRef={headingRef}
          actions={
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={regenerate}>
                {busy ? "Die KI schreibt …" : "Neu formulieren"}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={edit}>
                Angaben ändern
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={restart}>
                Neu beginnen
              </Button>
            </>
          }
        >
          {shown.vorlage ? (
            <div role="status" className="grid gap-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="vorlage-hinweis">
              <p>{VORLAGE_HINWEIS}</p>
              <p className="text-muted-foreground">{VORLAGE_ZUSATZ}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
              {KI_HINWEIS}
            </p>
          )}
          {placeholders.length > 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {placeholders.join(", ")}. Setze die Nummer oder Adresse ein, unter der du erreichbar sein willst.
            </p>
          )}
          <ul className="grid gap-4" aria-label="Varianten">
            {shown.varianten.map((v, i) => (
              <li key={i} className="rounded-xl border border-line p-4" data-testid={`variante-${i + 1}`}>
                <h4 className="font-heading font-medium">{varianteTitel(v, i)}</h4>
                <p className="mt-2 whitespace-pre-line" data-testid={`variante-${i + 1}-text`}>
                  {v.text}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <CopyButton text={v.text} label={kopierLabel(i)} />
                </div>
              </li>
            ))}
          </ul>
          <p id="bw-ergebnis-error" role="alert" className="min-h-6 text-destructive">
            {cardError}
          </p>
        </ResultCard>
      )}
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <AntwortFlow />
    </ToolShell>
  );
}
