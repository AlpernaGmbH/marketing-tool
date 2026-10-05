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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { LIMITS, vereinGenerator, type KanalKey, type VereinInput, type ZielKey } from "./generator";
import {
  ANSPRUCHSGRUPPEN_SLUG,
  EMPTY_FORM,
  EMPTY_STATE,
  ENTWICKLUNGEN,
  FIELD_IDS,
  KANAELE,
  KI_HINWEIS,
  MONAT_OPTIONEN,
  SLUG,
  ZIELE,
  addAnlass,
  anlassFieldId,
  charCount,
  effectiveKanaele,
  eingabeText,
  formFromInput,
  gruppenAus,
  gruppenHinweis,
  inputProblem,
  isEntwicklung,
  kanaeleAusProfil,
  kanalFieldId,
  normalizeKanaele,
  normalizeZiele,
  parseState,
  profilePatch,
  removeAnlass,
  reportMarkdown,
  screenBlocks,
  setAnlass,
  toDocument,
  toInput,
  zielFieldId,
  type VereinForm,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro() {
  return (
    <p>
      Sag, wofür dein Verein da ist, wie viele Mitglieder er hat, was er erreichen will und wann die Anlässe sind. Eine KI schreibt daraus ein
      Kommunikationskonzept: Ausgangslage, Ziele, Zielgruppen, Kernbotschaft, Kanalplan, Jahreskalender, Rollen und Erfolgsmessung. Du kannst es dem Vorstand
      vorlegen und als Vorlage für die Generalversammlung nutzen.
    </p>
  );
}

function KonzeptFlow() {
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  // Die Gruppen aus der Anspruchsgruppen-Analyse liegen im Browser; gruppenAus() prüft den Stand selbst.
  const { value: gruppen } = useLocalJson(`mt:${ANSPRUCHSGRUPPEN_SLUG}`, gruppenAus);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<VereinInput | null>(null);
  const gen = useGenerator(vereinGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => (inputRef.current ? reportMarkdown(o, inputRef.current) : ""),
  });

  // null: die Person hat noch nichts getippt. Dann gelten die gespeicherten Angaben (auch ohne Ergebnis), sonst das leere Formular.
  const [typed, setTyped] = useState<VereinForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);
  const typChecked = useRef(false);

  // Dieses Werkzeug ist für Vereine: Ist im Profil noch kein Typ gewählt, steht dort ab dem ersten Laden «Verein».
  useEffect(() => {
    if (!profileReady || typChecked.current) return;
    typChecked.current = true;
    const patch = profilePatch(profile, []);
    if (patch.organisationstyp) update(patch);
  }, [profileReady, profile, update]);

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

  // Kanäle: die gewählten, sonst der Vorschlag aus dem Profil (Harte Regel 10).
  const kanaele = effectiveKanaele(form, profile);
  const kanaeleVomProfil = form.kanaele === null && kanaeleAusProfil(profile).length > 0;
  const hinweis = gruppenHinweis(gruppen);

  const patch = (p: Partial<VereinForm>) => {
    setError(null);
    setTyped({ ...form, ...p });
  };

  const toggleZiel = (key: ZielKey, on: boolean) => patch({ ziele: normalizeZiele(on ? [...form.ziele, key] : form.ziele.filter((z) => z !== key)) });
  const toggleKanal = (key: KanalKey, on: boolean) => patch({ kanaele: normalizeKanaele(on ? [...kanaele, key] : kanaele.filter((k) => k !== key)) });

  async function start() {
    const problem = inputProblem({ firma: profile.firma }, form);
    if (problem) {
      setError(problem.message);
      document.getElementById(problem.fieldId)?.focus();
      return;
    }
    const input = toInput(profile, form, gruppen, kanaele);
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
    set({ v: 1, input, output: result });
    // Ins Profil nur nach einem frisch erzeugten Entwurf und nur, was dort noch fehlt (TOOL-BAUEN.md, Abschnitt 2).
    const toProfile = profilePatch(profile, input.kanaele);
    if (toProfile.organisationstyp || toProfile.kanaele) update(toProfile);
  }

  const edit = () => {
    if (!savedInput) return;
    setError(null);
    gen.clearError();
    setTyped(formFromInput(savedInput));
    setEditing(true);
    // Das Formular erscheint erst mit dem nächsten Rendern; der Fokus folgt danach.
    setTimeout(() => document.getElementById(FIELD_IDS.zweck)?.focus(), 0);
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
            <legend className="px-2 font-heading font-semibold">Dein Verein</legend>
            <ProfileFieldsForm idPrefix="vk" fields={["organisationstyp", "firma", "ort", "kanton"]} />
            <p className="text-sm text-muted-foreground md:col-span-2">Name, Ort und Kanton speichern wir in deinem Firmenprofil, in deinem Browser.</p>
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Zweck und Mitglieder</legend>

            <div className="grid gap-1.5">
              <Label htmlFor={FIELD_IDS.zweck}>Vereinszweck</Label>
              <Textarea
                id={FIELD_IDS.zweck}
                rows={3}
                maxLength={LIMITS.zweck}
                value={form.zweck}
                onChange={(e) => patch({ zweck: e.target.value })}
                aria-describedby="vk-zweck-help vk-zweck-count"
                aria-required="true"
                lang="de-CH"
                spellCheck
              />
              <p id="vk-zweck-help" className="text-sm text-muted-foreground">
                Ein bis drei Sätze: Was tut der Verein, für wen, und was verbindet die Mitglieder? Zum Beispiel: «Fussballclub mit Aktiven, Senioren und Juniorinnen und
                Junioren, Heimspiele auf dem Sportplatz».
              </p>
              <p id="vk-zweck-count" className="mono text-sm text-muted-foreground">
                {charCount(form.zweck)} von {LIMITS.zweck} Zeichen, mindestens {LIMITS.zweckMin}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={FIELD_IDS.mitglieder}>Mitgliederzahl</Label>
                <Input
                  id={FIELD_IDS.mitglieder}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={LIMITS.mitgliederMax}
                  step={1}
                  value={form.mitglieder}
                  onChange={(e) => patch({ mitglieder: e.target.value })}
                  aria-describedby="vk-mitglieder-help"
                  aria-required="true"
                />
                <p id="vk-mitglieder-help" className="text-sm text-muted-foreground">
                  Aktive und Passive zusammen, ganze Zahl.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={FIELD_IDS.entwicklung}>Entwicklung der Mitgliederzahl</Label>
                <select
                  id={FIELD_IDS.entwicklung}
                  className={selectClass}
                  value={form.entwicklung}
                  onChange={(e) => patch({ entwicklung: isEntwicklung(e.target.value) ? e.target.value : "" })}
                  aria-required="true"
                >
                  <option value="">Bitte wählen</option>
                  {ENTWICKLUNGEN.map((en) => (
                    <option key={en.key} value={en.key}>
                      {en.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="grid gap-3">
              <legend className="mb-1 font-medium">Ziele (mindestens eines)</legend>
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Ziele">
                {ZIELE.map((z) => (
                  <li key={z.key} className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      id={zielFieldId(z.key)}
                      aria-label={z.label}
                      className="size-6"
                      checked={ready && form.ziele.includes(z.key)}
                      onCheckedChange={(v) => toggleZiel(z.key, v === true)}
                      disabled={!ready || busy}
                    />
                    <label htmlFor={zielFieldId(z.key)} className="cursor-pointer">
                      {z.label}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </fieldset>

          <fieldset className="grid gap-3" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Anlässe im Jahr (freiwillig)</legend>
            <p className="text-sm text-muted-foreground">
              Bis zu {LIMITS.anlaesse} Anlässe mit Monat, zum Beispiel Generalversammlung, Dorffest, Turnier oder Vereinsreise. Sie bilden den Jahreskalender.
            </p>
            <ul className="grid gap-3" aria-label="Anlässe im Jahr">
              {form.anlaesse.map((a, i) => (
                <li key={a.id} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto] sm:items-end">
                  <div className="grid gap-1.5">
                    <Label htmlFor={anlassFieldId(a.id, "name")}>Name des Anlasses {i + 1}</Label>
                    <Input
                      id={anlassFieldId(a.id, "name")}
                      value={a.name}
                      maxLength={LIMITS.anlass}
                      onChange={(e) => patch({ anlaesse: setAnlass(form.anlaesse, a.id, { name: e.target.value }) })}
                      lang="de-CH"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={anlassFieldId(a.id, "monat")}>Monat von Anlass {i + 1}</Label>
                    <select
                      id={anlassFieldId(a.id, "monat")}
                      className={selectClass}
                      value={a.monat}
                      onChange={(e) => patch({ anlaesse: setAnlass(form.anlaesse, a.id, { monat: e.target.value }) })}
                    >
                      <option value="">Bitte wählen</option>
                      {MONAT_OPTIONEN.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="button" variant="ghost" aria-label={`Anlass ${i + 1} entfernen`} onClick={() => patch({ anlaesse: removeAnlass(form.anlaesse, a.id) })}>
                    Entfernen
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                id={FIELD_IDS.anlassAdd}
                variant="outline"
                disabled={form.anlaesse.length >= LIMITS.anlaesse}
                onClick={() => patch({ anlaesse: addAnlass(form.anlaesse) })}
              >
                Anlass hinzufügen
              </Button>
              <span className="mono text-sm text-muted-foreground">
                {form.anlaesse.length} von {LIMITS.anlaesse} Zeilen
              </span>
            </div>
          </fieldset>

          <fieldset className="grid gap-3" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Kanäle heute</legend>
            <p className="text-sm text-muted-foreground">
              {kanaeleVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : ""}Wähle die Kanäle, auf denen dein Verein heute Neuigkeiten verbreitet. Der Kanalplan nutzt sie und
              schlägt höchstens zwei neue vor.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kanäle heute">
              {KANAELE.map((k) => (
                <li key={k.key} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={kanalFieldId(k.key)}
                    aria-label={k.label}
                    className="size-6"
                    checked={ready && kanaele.includes(k.key)}
                    onCheckedChange={(v) => toggleKanal(k.key, v === true)}
                    disabled={!ready || busy}
                  />
                  <label htmlFor={kanalFieldId(k.key)} className="cursor-pointer">
                    {k.label}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-3" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Zeit und Budget</legend>
            <div className="grid gap-1.5">
              <Label htmlFor={FIELD_IDS.wer}>Wer macht die Kommunikation? (freiwillig)</Label>
              <Input
                id={FIELD_IDS.wer}
                value={form.wer}
                maxLength={LIMITS.wer}
                onChange={(e) => patch({ wer: e.target.value })}
                aria-describedby="vk-wer-help"
                lang="de-CH"
              />
              <p id="vk-wer-help" className="text-sm text-muted-foreground">
                Zum Beispiel: zwei Vorstandsmitglieder.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={FIELD_IDS.stunden}>Stunden pro Monat für die Kommunikation</Label>
              <Input
                id={FIELD_IDS.stunden}
                type="number"
                inputMode="numeric"
                min={0}
                max={LIMITS.stundenMax}
                step={1}
                value={form.stunden}
                onChange={(e) => patch({ stunden: e.target.value })}
                aria-describedby="vk-stunden-help"
                aria-required="true"
              />
              <p id="vk-stunden-help" className="text-sm text-muted-foreground">
                Alle zusammen, von 0 bis {LIMITS.stundenMax}. Die Rollen im Konzept bleiben darunter.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={FIELD_IDS.budget}>Budget pro Jahr in CHF (freiwillig)</Label>
              <Input
                id={FIELD_IDS.budget}
                type="number"
                inputMode="numeric"
                min={0}
                max={LIMITS.budgetMax}
                step={1}
                value={form.budget}
                onChange={(e) => patch({ budget: e.target.value })}
                aria-describedby="vk-budget-help"
              />
              <p id="vk-budget-help" className="text-sm text-muted-foreground">
                Leer heisst: kein Budget.
              </p>
            </div>
          </fieldset>

          <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="gruppen-hinweis">
            {hinweis ? (
              <p>
                {hinweis} Sie bilden die Zielgruppen im Konzept.{" "}
                <Link href={`/tools/${ANSPRUCHSGRUPPEN_SLUG}`} className="underline underline-offset-4">
                  Anspruchsgruppen ändern
                </Link>
              </p>
            ) : (
              <p>
                Noch keine Anspruchsgruppen gespeichert. Mach zuerst die{" "}
                <Link href={`/tools/${ANSPRUCHSGRUPPEN_SLUG}`} className="underline underline-offset-4">
                  Anspruchsgruppen-Analyse
                </Link>
                , dann übernimmt das Konzept sie als Zielgruppen. Ohne sie leitet die KI die Zielgruppen aus deinen Angaben ab.
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Dafür gehen Name, Ort und Kanton des Vereins, Zweck, Mitgliederzahl und Entwicklung, Ziele, Anlässe, Kanäle, die Angabe, wer die Kommunikation macht, die Stunden
            und das Budget{hinweis ? " und die Namen deiner Anspruchsgruppen mit Interesse und Einfluss" : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht deine
            E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und das Konzept gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei
            Fragen weiterhelfen können. Gib nichts Vertrauliches ein, zum Beispiel keine Namen von Mitgliedern.
          </p>

          <p id="vk-error" role="alert" className="min-h-6 text-destructive">
            {shownError}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              {busy ? "Die KI schreibt …" : "Konzept erstellen"}
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
        {busy ? "Die KI schreibt dein Kommunikationskonzept." : ""}
      </p>

      {output && doc && savedInput && (
        <ResultCard
          title="Dein Kommunikationskonzept"
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
          <div data-testid="konzept">
            <DocView blocks={screenBlocks(doc)} />
          </div>
          <p className="text-sm text-muted-foreground">
            Das Konzept ist eine Vorlage. Der Vorstand prüft und ergänzt es, bevor es an die Generalversammlung geht.
            {savedInput.kanaele.length > 0 ? " Deine Kanäle heute stehen im Firmenprofil, sofern dort noch keine standen. Andere Werkzeuge lesen sie dort." : ""}
          </p>
        </ResultCard>
      )}
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <KonzeptFlow />
    </ToolShell>
  );
}
