"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ResultPitch } from "@/components/tool/ResultPitch";
import { ToolShell } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { WebsiteScan } from "@/components/tool/WebsiteScan";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dateCH } from "@/lib/ch";
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import type { CheckResult } from "@/lib/check/types";
import { parseCheckState } from "@/tools/digitaler-auftritt-check/logic";
import { LIMITS, konzeptGenerator, type KanalKey, type KonzeptInput, type ZielKey } from "./generator";
import {
  ANSPRUCHSGRUPPEN_SLUG,
  EMPTY_FORM,
  EMPTY_STATE,
  ENTWICKLUNGEN,
  FIELD_IDS,
  KI_HINWEIS,
  MONAT_OPTIONEN,
  SCAN_SLUG,
  SLUG,
  WORTE,
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
  kanaeleAusScan,
  kanaeleFuer,
  kanalFieldId,
  normalizeKanaele,
  normalizeZiele,
  parseState,
  pitchFor,
  profilePatch,
  removeAnlass,
  reportMarkdown,
  screenBlocks,
  setAnlass,
  toDocument,
  toInput,
  typOf,
  vorbelegung,
  vorbelegungText,
  zielFieldId,
  zieleFuer,
  type KonzeptForm,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro({ intro }: { intro: string }) {
  return <p>{intro}</p>;
}

function KonzeptFlow() {
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  // Die Gruppen aus der Anspruchsgruppen-Analyse und der Scan der Website liegen im Browser; die Funktionen prüfen den Stand selbst.
  const { value: gruppen } = useLocalJson(`mt:${ANSPRUCHSGRUPPEN_SLUG}`, gruppenAus);
  const { value: scan } = useLocalJson(`mt:${SCAN_SLUG}`, parseCheckState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<KonzeptInput | null>(null);
  const gen = useGenerator(konzeptGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => (inputRef.current ? reportMarkdown(o, inputRef.current) : ""),
  });

  // null: die Person hat noch nichts getippt. Dann gelten die gespeicherten Angaben (auch ohne Ergebnis), sonst das leere Formular.
  const [typed, setTyped] = useState<KonzeptForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  // Verein oder Betrieb bestimmt die Rechtsform im Firmenprofil (Reihe oben im Formular); ohne Wahl gilt der Betrieb.
  const typ = typOf(profile);
  const w = WORTE[typ];

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

  // Kanäle: die gewählten, sonst der Vorschlag aus Profil und Website-Prüfung (Harte Regel 10).
  const vorschlag = vorbelegung(profile, scan.result, typ);
  const kanaele = effectiveKanaele(form, vorschlag.kanaele, typ);
  const kanaeleVorbelegt = form.kanaele === null && vorschlag.kanaele.length > 0;
  const hinweis = gruppenHinweis(gruppen);

  // Das Ende eines Scans läuft Sekunden nach dem Klick; es braucht den aktuellen Stand des Formulars, nicht den vom Klick.
  const latest = useRef({ form, kanaele, typ });
  useEffect(() => {
    latest.current = { form, kanaele, typ };
  });
  // Hat die Person die Kanäle schon angefasst, kommen die gefundenen dazu; nichts fällt weg. Sonst folgt die Vorbelegung dem neuen Ergebnis selbst.
  const afterScan = (result: CheckResult) => {
    const { form: f, kanaele: k, typ: t } = latest.current;
    if (f.kanaele === null) return;
    setError(null);
    setTyped({ ...f, kanaele: normalizeKanaele([...k, ...kanaeleAusScan(result)], t) });
  };

  const patch = (p: Partial<KonzeptForm>) => {
    setError(null);
    setTyped({ ...form, ...p });
  };

  const toggleZiel = (key: ZielKey, on: boolean) => patch({ ziele: normalizeZiele(on ? [...form.ziele, key] : form.ziele.filter((z) => z !== key), typ) });
  const toggleKanal = (key: KanalKey, on: boolean) => patch({ kanaele: normalizeKanaele(on ? [...kanaele, key] : kanaele.filter((k) => k !== key), typ) });

  async function start() {
    const problem = inputProblem(profile, form);
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
    if (toProfile.kanaele) update(toProfile);
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
  // Die Wörter im Ergebnis folgen dem Typ, mit dem der Entwurf entstanden ist, nicht der Rechtsform, die jetzt im Profil steht.
  const wErgebnis = WORTE[savedInput?.typ ?? typ];

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
        <Intro intro={w.intro} />
      </div>

      {showForm && (
        <>
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">{w.legend}</legend>
            <ProfileFieldsForm idPrefix="vk" fields={["organisationstyp", "firma", "ort", "kanton"]} />
            <p className="text-sm text-muted-foreground md:col-span-2">Rechtsform, Name, Ort und Kanton speichern wir in deinem Firmenprofil, in deinem Browser. Die Rechtsform bestimmt, ob das Konzept von Mitgliedern oder von Kundschaft spricht.</p>
          </fieldset>

          <fieldset className="grid gap-5" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">{typ === "verein" ? "Zweck und Mitglieder" : "Betrieb und Nachfrage"}</legend>

            <div className="grid gap-1.5">
              <Label htmlFor={FIELD_IDS.zweck}>{w.zweckLabel}</Label>
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
                {w.zweckHilfe}
              </p>
              <p id="vk-zweck-count" className="mono text-sm text-muted-foreground">
                {charCount(form.zweck)} von {LIMITS.zweck} Zeichen, mindestens {LIMITS.zweckMin}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={FIELD_IDS.anzahl}>{w.anzahlLabel}</Label>
                <Input
                  id={FIELD_IDS.anzahl}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={LIMITS.anzahlMax}
                  step={1}
                  value={form.anzahl}
                  onChange={(e) => patch({ anzahl: e.target.value })}
                  aria-describedby="vk-anzahl-help"
                  aria-required="true"
                />
                <p id="vk-anzahl-help" className="text-sm text-muted-foreground">
                  {w.anzahlHilfe}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={FIELD_IDS.entwicklung}>{w.entwicklungLabel}</Label>
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
                {zieleFuer(typ).map((z) => (
                  <li key={z.key} className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      id={zielFieldId(z.key)}
                      aria-label={z.label}
                      className="size-6"
                      checked={ready && normalizeZiele(form.ziele, typ).includes(z.key)}
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
            <p className="text-sm text-muted-foreground">{w.anlaesseHilfe}</p>
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
              {kanaeleVorbelegt ? vorbelegungText(vorschlag) : ""}
              {w.kanaeleHilfe}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kanäle heute">
              {kanaeleFuer(typ).map((k) => (
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

          <WebsiteScan
            idPrefix="vk-scan"
            fields={["website"]}
            intro="Statt die Kanäle von Hand zu wählen, kannst du deine Website prüfen lassen. Das Werkzeug liest die Startseite und erkennt verlinkte Kanäle wie Instagram und Facebook, eine Newsletter-Anmeldung und, soweit die Website darauf verweist, ein Google Business Profil. Die gefundenen Kanäle sind vorgewählt; du ergänzt oder streichst. Die Adresse deiner Website geht an unseren Server, nicht deine E-Mail-Adresse."
            stand={(saved) => {
              if (!saved.result) return null;
              const n = normalizeKanaele(kanaeleAusScan(saved.result), typ).length;
              return `Gespeicherter Scan vom ${dateCH(saved.result.checkedAt)}: ${n} ${n === 1 ? "Kanal" : "Kanäle"} erkannt.`;
            }}
            onScanned={afterScan}
          />

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
                {w.werHilfe}
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
            Dafür gehen {w.serverAngaben}, Ziele, Anlässe, Kanäle, die Angabe, wer die Kommunikation macht, die Stunden und das Budget
            {hinweis ? " und die Namen deiner Anspruchsgruppen mit Interesse und Einfluss" : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht deine
            E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und das Konzept gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei
            Fragen weiterhelfen können. {w.vertraulich}
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
          <ResultPitch spec={pitchFor(output, savedInput)} />
          <p className="text-sm text-muted-foreground">
            {wErgebnis.ergebnisHinweis}
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
