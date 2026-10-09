"use client";

import { cn } from "cn";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { icsFile, pdfFile } from "./export";
import {
  EMPTY_STATE,
  FAELLIG_HINWEIS,
  KANAELE,
  NAME_MAX,
  RICHTWERT_HINWEIS,
  SLUG,
  ausgabeText,
  buildPlan,
  cleanErledigt,
  datumKurz,
  eingabeText,
  erledigtCount,
  faelligMeldung,
  formFrom,
  groupByWeek,
  listText,
  isTyp,
  kanaeleAusProfil,
  kanaeleVorschlag,
  kanalLabel,
  normalizeKanaele,
  organisationOf,
  parseState,
  toDocument,
  todayIso,
  toggleErledigt,
  toInput,
  typLabel,
  typenFor,
  validate,
  werkzeugHref,
  datumLang,
  type FormFields,
  type KanalKey,
  type PlanInput,
  type PlannerState,
  type Problem,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const DOWNLOAD_ERROR = "Der Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Text.";
const FIELD_ID: Record<Problem["feld"], string> = { typ: "ap-typ", name: "ap-name", datum: "ap-datum", kanaele: "ap-kanal-website" };

function Intro() {
  return (
    <>
      <p>
        Wähle, was du planst, und das Datum. Du bekommst einen Zeitplan, der rückwärts vom Anlass läuft: Aufgaben von zehn Wochen davor bis eine Woche danach, mit Datum,
        Kanal und, wo es passt, dem Werkzeug, das dir bei der Aufgabe hilft. Abhaken kannst du direkt hier.
      </p>
      <p>
        Der Zeitplan entsteht in deinem Browser. Art, Name, Datum, Kanäle und der Zeitplan gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können. Was du abhakst, bleibt in deinem Browser.
      </p>
    </>
  );
}

type FileKind = "ics" | "pdf";

function ResultView({
  input,
  firma,
  erledigt,
  headingRef,
  onToggle,
  onEdit,
  onNew,
}: {
  input: PlanInput;
  firma: string;
  erledigt: string[];
  headingRef: React.Ref<HTMLHeadingElement>;
  onToggle: (id: string, on: boolean) => void;
  onEdit: () => void;
  onNew: () => void;
}) {
  const ctx = useToolContext();
  // Das heutige Datum wird einmal beim Öffnen des Ergebnisses gelesen; der Plan rechnet damit, was schon fällig ist.
  const [heute] = useState(() => todayIso(new Date()));
  const plan = useMemo(() => buildPlan(input, heute), [input, heute]);
  const groups = useMemo(() => groupByWeek(plan.aufgaben), [plan]);
  const doc = useMemo(() => toDocument(plan, input, { firma, erledigt }), [plan, input, firma, erledigt]);
  const done = useMemo(() => new Set(erledigt), [erledigt]);
  const meldung = faelligMeldung(plan);
  const gesamt = plan.aufgaben.length;
  const erledigtAnzahl = erledigtCount(plan, erledigt);

  const [busy, setBusy] = useState<FileKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = (kind: FileKind) =>
    ctx.guardDownload(async () => {
      setError(null);
      setBusy(kind);
      try {
        const file = kind === "ics" ? icsFile(plan, input) : await pdfFile(doc, input);
        downloadBytes(file.bytes, file.filename, file.mime);
      } catch {
        setError(DOWNLOAD_ERROR);
      } finally {
        setBusy(null);
      }
    });

  return (
    <ResultCard
      title="Dein Zeitplan"
      headingRef={headingRef}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neu beginnen
          </Button>
        </>
      }
    >
      <section aria-label="Überblick" className="grid gap-2" data-testid="ap-kopf">
        <p className="font-heading text-lg font-medium" data-testid="ap-titel">
          {input.name}
        </p>
        <p data-testid="ap-summary">
          {datumLang(input.datum)}, {typLabel(input.typ)}. {gesamt} {gesamt === 1 ? "Aufgabe" : "Aufgaben"}. Kanäle: {normalizeKanaele(input.kanaele).map(kanalLabel).join(", ")}
          {input.inserate ? ", bezahlte Inserate" : ""}.
        </p>
        {meldung && (
          <p data-testid="ap-faellig" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            {meldung} {FAELLIG_HINWEIS}
          </p>
        )}
        <p role="status" aria-live="polite" className="font-medium" data-testid="ap-fortschritt">
          {erledigtAnzahl} von {gesamt} erledigt
        </p>
      </section>

      <ul aria-label="Aufgaben" className="grid gap-6" data-testid="ap-aufgaben">
        {groups.map((g) => (
          <li key={g.woche} className="grid gap-2" data-testid="ap-gruppe">
            <h4 id={`ap-woche-${g.woche}`} className="font-heading font-medium">
              {g.label}
            </h4>
            <ul aria-labelledby={`ap-woche-${g.woche}`} className="grid gap-2">
              {g.aufgaben.map((a) => {
                const erledigtA = done.has(a.id);
                return (
                  <li key={a.id} data-testid="ap-aufgabe" data-id={a.id} data-faellig={a.faellig ? "ja" : "nein"} className="min-w-0 rounded-lg border border-line p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`ap-erledigt-${a.id}`}
                        aria-label={a.titel}
                        className="mt-0.5 size-6"
                        checked={erledigtA}
                        onCheckedChange={(v) => onToggle(a.id, v === true)}
                      />
                      <div className="grid min-w-0 gap-1">
                        <label htmlFor={`ap-erledigt-${a.id}`} className={cn("cursor-pointer break-words font-medium", erledigtA && "text-muted-foreground line-through")}>
                          {a.titel}
                        </label>
                        <p className="text-sm text-muted-foreground">
                          <time dateTime={a.datum} className="mono">
                            {datumKurz(a.datum)}
                          </time>
                          {" · "}
                          {kanalLabel(a.kanal)}
                          {a.hinweis ? ` · ${a.hinweis}` : ""}
                          {a.faellig && !erledigtA && <span className="ml-2 rounded-full border border-ink px-2 py-0.5 text-xs text-foreground">schon fällig</span>}
                        </p>
                        {a.werkzeug && (
                          <Link href={werkzeugHref(a.werkzeug)} aria-label={`Werkzeug öffnen: ${a.titel}`} className="w-fit text-sm underline underline-offset-4">
                            Werkzeug öffnen
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <section aria-label="Dateien" className="grid gap-3">
        <h4 className="font-heading font-medium">Dateien</h4>
        <p className="text-sm text-muted-foreground">
          Die Kalenderdatei (.ics) öffnest du in Google Kalender, Outlook oder Apple Kalender: ein ganztägiger Eintrag je Aufgabe und einer für den Anlass, je mit einer
          Erinnerung um 9 Uhr, soweit dein Kalender sie aus der Datei übernimmt. «Als Liste kopieren» gibt dir eine Zeile je offene Aufgabe zum Einfügen in
          Erinnerungen oder Notizen. Das PDF ist zum Ausdrucken, mit Kästchen zum Abhaken.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => download("ics")} data-testid="ap-ics" data-umami-event="export_ics" data-umami-event-tool={SLUG}>
            {busy === "ics" ? "Kalender wird erstellt …" : "Kalender (.ics) herunterladen"}
          </Button>
          <CopyButton text={() => listText(plan, input, erledigt)} label="Als Liste kopieren" />
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => download("pdf")} data-testid="ap-pdf" data-umami-event="export_pdf" data-umami-event-tool={SLUG}>
            {busy === "pdf" ? "PDF wird erstellt …" : "Zeitplan (PDF) herunterladen"}
          </Button>
        </div>
        <DocumentExport model={doc} formats={["docx"]} />
        <p role="alert" className="min-h-6 text-sm text-destructive">
          {error}
        </p>
      </section>

      <p className="text-sm text-muted-foreground" data-testid="ap-richtwert">
        {RICHTWERT_HINWEIS}
      </p>
    </ResultCard>
  );
}

function PlannerFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson<PlannerState>(`mt:${SLUG}`, parseState);
  const live = ready && profileReady;

  // Änderungen am Formular leben im Entwurf, bis der Zeitplan erstellt wird; vorher gilt der gespeicherte Stand.
  const [draft, setDraft] = useState<FormFields | null>(null);
  const form = draft ?? formFrom(saved.input);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<"heading" | "typ" | null>(null);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "typ") document.getElementById("ap-typ")?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const organisation = organisationOf(profile);
  const arten = typenFor(organisation);
  const typ = form.typ ?? arten[0].key;
  const kanaeleListe = normalizeKanaele(form.kanaele ?? kanaeleVorschlag(profile));
  const kanaeleVomProfil = form.kanaele === null && kanaeleAusProfil(profile).length > 0;
  const firma = profile.firma?.trim() ?? "";

  const edit = (patch: Partial<FormFields>) => {
    setDraft({ ...form, ...patch });
    setProblems([]);
  };
  const toggleKanal = (key: KanalKey, on: boolean) => edit({ kanaele: normalizeKanaele(on ? [...kanaeleListe, key] : kanaeleListe.filter((k) => k !== key)) });
  const has = (feld: Problem["feld"]) => problems.some((p) => p.feld === feld);

  async function start() {
    const heute = todayIso(new Date());
    const input = toInput(form, profile);
    const found = validate(input, heute);
    if (found.length > 0) {
      setProblems(found);
      document.getElementById(FIELD_ID[found[0].feld])?.focus();
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const plan = buildPlan(input, heute);
      // Gleiche Art und gleiches Datum: die Haken bleiben. Sonst beginnt die Liste neu.
      const gleich = saved.input !== null && saved.input.typ === input.typ && saved.input.datum === input.datum;
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", input, erledigt: gleich ? cleanErledigt(plan, saved.erledigt) : [], output: { erstellt: heute } });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(input), ausgabe: ausgabeText(plan, input, { firma }) });
    } finally {
      setBusy(false);
    }
  }

  if (ready && saved.phase === "result" && saved.input) {
    return (
      <ResultView
        input={saved.input}
        firma={firma}
        erledigt={saved.erledigt}
        headingRef={headingRef}
        onToggle={(id, on) => set({ ...saved, erledigt: toggleErledigt(saved.erledigt, id, on) })}
        onEdit={() => {
          shouldFocus.current = "typ";
          setDraft(null);
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "typ";
          setDraft(null);
          setProblems([]);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={!live}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="ap" fields={["organisationstyp", "firma"]} />
        <p className="text-sm text-muted-foreground">
          Firma und Art der Organisation speichern wir in deinem Firmenprofil, in deinem Browser. Vereine sehen zuerst Dorffest und Generalversammlung, KMU zuletzt; wählbar
          sind alle.
        </p>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Dein Anlass</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="ap-typ">Was planst du?</Label>
          <select
            id="ap-typ"
            className={selectClass}
            value={typ}
            onChange={(e) => edit({ typ: isTyp(e.target.value) ? e.target.value : null })}
            disabled={!live}
            aria-invalid={has("typ")}
            aria-describedby="ap-error"
            data-testid="ap-typ"
          >
            {arten.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ap-datum">Datum des Anlasses</Label>
          <Input
            id="ap-datum"
            type="date"
            value={form.datum}
            onChange={(e) => edit({ datum: e.target.value })}
            disabled={!live}
            required
            aria-invalid={has("datum")}
            aria-describedby="ap-error"
            data-testid="ap-datum"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="ap-name">Name des Anlasses</Label>
          <Input
            id="ap-name"
            value={form.name}
            maxLength={NAME_MAX}
            placeholder="Tag der offenen Tür Malerei Keller"
            onChange={(e) => edit({ name: e.target.value })}
            disabled={!live}
            required
            aria-invalid={has("name")}
            aria-describedby="ap-name-help ap-error"
          />
          <p id="ap-name-help" className="text-sm text-muted-foreground">
            So steht der Anlass im Zeitplan und im Kalender (3 bis {NAME_MAX} Zeichen).
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Kanäle</legend>
        <p className="text-sm text-muted-foreground">
          {kanaeleVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : "Ohne Angabe im Firmenprofil sind Website, Instagram sowie Aushang und Flyer gewählt. "}Wähle die Kanäle, auf
          denen ihr den Anlass ankündigt. Aufgaben für Kanäle, die du nicht wählst, fehlen im Zeitplan.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kanäle">
          {KANAELE.map((k) => (
            <li key={k.key} className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={`ap-kanal-${k.key}`}
                aria-label={k.label}
                className="size-6"
                checked={live && kanaeleListe.includes(k.key)}
                onCheckedChange={(v) => toggleKanal(k.key, v === true)}
                disabled={!live}
                aria-invalid={has("kanaele")}
              />
              <label htmlFor={`ap-kanal-${k.key}`} className="cursor-pointer">
                {k.label}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox id="ap-inserate" aria-label="Wir schalten bezahlte Inserate" className="size-6" checked={live && form.inserate} onCheckedChange={(v) => edit({ inserate: v === true })} disabled={!live} />
          <label htmlFor="ap-inserate" className="cursor-pointer">
            Wir schalten bezahlte Inserate
          </label>
        </div>
        <p className="text-sm text-muted-foreground">Mit Inseraten kommen zwei Aufgaben dazu: «Inserat planen und buchen» und «Inserat prüfen».</p>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Die Aufgaben und ihre Vorlaufzeiten sind ein Richtwert von Alperna, keine Statistik und keine Vorschrift. Bewilligungen und Fristen klärst du bei der Gemeinde, beim
        Anzeiger und in den Statuten.
      </p>

      <div id="ap-error" role="alert" className="min-h-6 text-destructive">
        {problems.map((p) => (
          <p key={p.feld}>{p.text}</p>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!live || busy}>
          Zeitplan erstellen
        </Button>
        {saved.input && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setProblems([]);
              set({ ...saved, phase: "result" });
            }}
          >
            Zurück zum Zeitplan
          </Button>
        )}
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <PlannerFlow />
    </ToolShell>
  );
}
