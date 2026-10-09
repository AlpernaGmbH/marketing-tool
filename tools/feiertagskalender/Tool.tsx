"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocView } from "@/components/tool/DocView";
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
import { loadKalenderData } from "./data";
import {
  BRANCHEN,
  EMPTY_STATE,
  KANAELE,
  KANAL_KEYS,
  MAX_TERMINE,
  MAX_TITEL,
  READING_HINWEIS,
  SLUG,
  addTermin,
  artLabel,
  ausgabeText,
  brancheAusProfil,
  brancheLabel,
  buildCalendar,
  buildCsv,
  buildIcs,
  countsText,
  csvFilename,
  dateLabel,
  eingabeText,
  formProblem,
  formatIso,
  icsFilename,
  inputFromState,
  isBranche,
  jahresRaster,
  kanaeleAusProfil,
  kanaeleText,
  kanaeleVorschlag,
  kantonLabel,
  normalizeKanaele,
  parseState,
  removeTermin,
  toDocument,
  yearOptions,
  type Calendar,
  type CkState,
  type Input as CalInput,
  type KalenderData,
  type KanalKey,
  type Vorschlag,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const DOWNLOAD_ERROR = "Der Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Text.";
const LOAD_ERROR = "Die Daten konnten nicht geladen werden. Prüfe deine Verbindung und versuch es noch einmal.";

function Intro() {
  return (
    <>
      <p>
        Wähle deinen Kanton, das Jahr und die Kanäle, auf denen ihr postet. Du bekommst einen Jahreskalender mit den Anlässen, Feiertagen und Schulferien deines
        Kantons und zu jedem Anlass einen Vorschlag für einen Beitrag. Eigene Termine trägst du dazu.
      </p>
      <p>
        Der Kalender entsteht in deinem Browser. Kanton, Jahr, Branche, Kanäle und deine Termine gehen mit dem Ergebnis und deiner E-Mail-Adresse an Alperna, damit
        wir dir bei Fragen weiterhelfen können.
      </p>
    </>
  );
}

type FileKind = "ics" | "csv";

/** Der Vorschlag zu einem Anlass: drei Varianten mit Format, Bildidee und Hook, zum Aufklappen. */
function VorschlagView({ vorschlag, kanaele }: { vorschlag: Vorschlag; kanaele: readonly KanalKey[] }) {
  return (
    <details className="group mt-2 rounded-lg border border-line bg-paper" data-testid="ck-vorschlag">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-medium">Vorschlag:</span> {vorschlag.titel}
          <span className="block text-muted-foreground">{vorschlag.varianten.length} Varianten, je mit Format, Bildidee und Hook</span>
        </span>
        <ChevronDown aria-hidden="true" strokeWidth={1.8} className="size-4 shrink-0 transition-transform duration-300 group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-line p-3 md:grid-cols-3">
        {vorschlag.varianten.map((v, i) => (
          <div key={i} className="grid min-w-0 content-start gap-2 rounded-lg bg-surface p-3 text-sm" data-testid="ck-variante">
            <p className="eyebrow">
              Variante {i + 1} · {v.format}
            </p>
            <p>
              <span className="font-medium">Bild:</span> {v.bildidee}
            </p>
            <p>
              <span className="font-medium">Hook:</span> «{v.hook}»
            </p>
            <CopyButton text={v.hook} label="Hook kopieren" variant="ghost" className="justify-self-start" />
          </div>
        ))}
        <p className="text-sm text-muted-foreground md:col-span-3">Kanäle: {kanaeleText(kanaele)}</p>
      </div>
    </details>
  );
}

function ResultView({
  cal,
  firma,
  headingRef,
  onEdit,
  onNew,
}: {
  cal: Calendar;
  firma: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  const ctx = useToolContext();
  const { input, note } = cal;
  const doc = useMemo(() => toDocument(cal, firma), [cal, firma]);
  const raster = useMemo(() => jahresRaster(cal), [cal]);
  const [busy, setBusy] = useState<FileKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = (kind: FileKind) =>
    ctx.guardDownload(() => {
      setError(null);
      setBusy(kind);
      try {
        if (kind === "ics") {
          const text = buildIcs(cal, { firma, now: new Date() });
          downloadBytes(new TextEncoder().encode(text), icsFilename(input.jahr, firma), "text/calendar;charset=utf-8");
        } else {
          downloadBytes(new TextEncoder().encode(buildCsv(cal)), csvFilename(input.jahr, firma), "text/csv;charset=utf-8");
        }
      } catch {
        setError(DOWNLOAD_ERROR);
      } finally {
        setBusy(null);
      }
    });

  return (
    <ResultCard
      title="Dein Feiertagskalender"
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
      <section aria-label="Überblick" className="grid gap-2">
        <p data-testid="ck-summary">
          {input.jahr} für {firma ? `${firma}, ` : ""}
          {kantonLabel(input.kanton)}, Branche {brancheLabel(input.branche)}. Kanäle: {kanaeleText(input.kanaele)}.
        </p>
        <p className="text-sm text-muted-foreground" data-testid="ck-counts">
          {countsText(cal.entries)}.
        </p>
        <p className="text-sm text-muted-foreground">{READING_HINWEIS}</p>
      </section>

      {raster && (
        <section aria-label="Jahr auf einen Blick" data-testid="ck-raster">
          <DocView blocks={[raster]} />
        </section>
      )}

      <section aria-label="Dateien" className="grid gap-3">
        <h4 className="font-heading font-medium">Dateien</h4>
        <p className="text-sm text-muted-foreground">
          Die Kalenderdatei (.ics) öffnest du in Google Kalender, Outlook oder Apple Kalender. Jeder Eintrag ist ein Ganztagstermin, bei Anlässen mit einer Erinnerung
          sieben Tage vorher (Richtwert von Alperna, keine Statistik).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => download("ics")} data-testid="ck-ics" data-umami-event="export_ics" data-umami-event-tool={SLUG}>
            {busy === "ics" ? "Kalender wird erstellt …" : "Kalender (.ics)"}
          </Button>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => download("csv")} data-testid="ck-csv" data-umami-event="export_csv" data-umami-event-tool={SLUG}>
            {busy === "csv" ? "CSV wird erstellt …" : "CSV"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Die Jahresübersicht mit einer Tabelle je Monat gibt es als PDF zum Drucken und als Word-Datei. Den Text kannst du immer kopieren.</p>
        <DocumentExport model={doc} />
        <p role="alert" className="min-h-6 text-sm text-destructive">
          {error}
        </p>
      </section>

      <section aria-label="Monatsansicht" className="grid gap-6" data-testid="ck-months">
        {cal.months.map((m) => (
          <div key={m.month} className="grid gap-2">
            <h4 className="font-heading font-medium">{m.label}</h4>
            <ul aria-label={m.name} className="grid gap-2">
              {m.entries.length === 0 && <li className="text-sm text-muted-foreground">Keine Einträge in diesem Monat.</li>}
              {m.entries.map((e) => (
                <li key={e.key} data-testid="ck-entry" data-art={e.art} className="min-w-0 rounded-lg border border-line p-3 break-words">
                  <p className="font-medium">
                    {dateLabel(e)}: {e.titel}
                  </p>
                  <p className="text-sm text-muted-foreground">{artLabel(e)}</p>
                  {e.vorschlag && <VorschlagView vorschlag={e.vorschlag} kanaele={input.kanaele} />}
                  {e.hinweis && <p className="mt-1 text-sm text-muted-foreground">{e.hinweis}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label="Quellen und Hinweise" className="grid gap-3 text-sm" data-testid="ck-quellen">
        <h4 className="font-heading font-medium">Quellen und Hinweise</h4>
        {note.kantone.map((k) => (
          <p key={k}>{k}</p>
        ))}
        {note.hinweise.length > 0 && (
          <ul aria-label="Hinweise" className="grid list-disc gap-1 pl-5">
            {note.hinweise.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        <ul aria-label="Quellen" className="grid gap-3">
          {note.gruppen.map((g) => (
            <li key={g.titel} className="min-w-0 break-words">
              <p>
                <span className="font-medium">{g.titel}:</span> {g.text}
                {g.stand ? ` (Stand ${formatIso(g.stand)})` : ""}
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer underline underline-offset-4">Links zu den Quellen</summary>
                <ul className="mt-2 grid list-disc gap-1 pl-5">
                  {g.links.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </ResultCard>
  );
}

function CalendarFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const live = ready && profileReady;

  const [data, setData] = useState<KalenderData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tDatum, setTDatum] = useState("");
  const [tTitel, setTTitel] = useState("");
  const [tError, setTError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const jahrRef = useRef<HTMLSelectElement>(null);
  const terminRef = useRef<HTMLInputElement>(null);
  const shouldFocus = useRef<"heading" | "jahr" | null>(null);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "jahr") jahrRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const result = useMemo(() => inputFromState(saved), [saved]);

  // Nach dem Neuladen steht das Ergebnis im Speicher; die Datensätze kommen dann nach.
  useEffect(() => {
    if (!ready || !result || data) return;
    let alive = true;
    setLoadFailed(false);
    loadKalenderData()
      .then((d) => alive && setData(d))
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [ready, result, data, attempt]);

  const cal = useMemo(() => (result && data ? buildCalendar(result, data) : null), [result, data]);

  // Eingabe: gespeicherte Wahl, sonst Vorbelegung aus dem Profil.
  const years = useMemo(() => (ready ? yearOptions(new Date()) : []), [ready]);
  const jahr = saved.jahr !== null && years.includes(saved.jahr) ? saved.jahr : (years[0] ?? null);
  const branche = saved.branche ?? brancheAusProfil(profile);
  const kanaeleList = saved.kanaele ?? kanaeleVorschlag(profile);
  const kanton = profile.kanton ?? "";
  const brancheVomProfil = saved.branche === null && (profile.organisationstyp === "verein" || Boolean(profile.branche?.trim()));
  const kanaeleVomProfil = saved.kanaele === null && kanaeleAusProfil(profile).length > 0;
  const firma = profile.firma?.trim() ?? "";

  const patch = (p: Partial<CkState>) => {
    set({ ...saved, phase: "edit", ...p });
    setError(null);
  };
  const toggleKanal = (key: KanalKey, on: boolean) => patch({ kanaele: KANAL_KEYS.filter((k) => (k === key ? on : kanaeleList.includes(k))) });

  function addNow() {
    const r = addTermin(saved.termine, tDatum, tTitel);
    if (!r.ok) {
      setTError(r.error);
      return;
    }
    patch({ termine: r.list });
    setTDatum("");
    setTTitel("");
    setTError(null);
    terminRef.current?.focus();
  }

  async function start() {
    const problem = formProblem({ kanton, jahr, kanaele: kanaeleList });
    if (problem || jahr === null) {
      setError(problem ?? "Wähle das Jahr.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      let loaded = data;
      if (!loaded) {
        loaded = await loadKalenderData();
        setData(loaded);
      }
      const inp: CalInput = { jahr, kanton, branche, kanaele: normalizeKanaele(kanaeleList), termine: saved.termine };
      const calc = buildCalendar(inp, loaded);
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", jahr: inp.jahr, kanton: inp.kanton, branche: inp.branche, kanaele: inp.kanaele, termine: inp.termine });
      void ctx.sendResult({ eingabe: eingabeText(inp), ausgabe: ausgabeText(calc, firma) });
    } catch {
      setError(LOAD_ERROR);
    } finally {
      setBusy(false);
    }
  }

  if (ready && result) {
    if (!cal) {
      return loadFailed ? (
        <div className="grid gap-3">
          <p role="alert" className="text-destructive">
            {LOAD_ERROR}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Noch einmal laden
            </Button>
            <Button type="button" variant="ghost" onClick={() => set(EMPTY_STATE)}>
              Neu beginnen
            </Button>
          </div>
        </div>
      ) : (
        <p role="status" aria-live="polite" className="text-muted-foreground">
          Kalender wird geladen …
        </p>
      );
    }
    return (
      <ResultView
        cal={cal}
        firma={firma}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "jahr";
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "jahr";
          setError(null);
          setTError(null);
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
        <ProfileFieldsForm idPrefix="ck" fields={["firma", "branche", "kanton"]} />
        <p className="text-sm text-muted-foreground">
          Firma, Branche und Kanton speichern wir in deinem Firmenprofil, in deinem Browser. Der Kanton bestimmt Feiertage, Schulferien und regionale Anlässe.
        </p>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Dein Kalender</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="ck-jahr">Jahr</Label>
          <select
            id="ck-jahr"
            ref={jahrRef}
            className={selectClass}
            value={jahr ?? ""}
            onChange={(e) => patch({ jahr: Number(e.target.value) })}
            disabled={!live}
            data-testid="ck-jahr"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ck-branche-key">Branche für Vorschläge</Label>
          <select
            id="ck-branche-key"
            className={selectClass}
            value={branche}
            onChange={(e) => patch({ branche: isBranche(e.target.value) ? e.target.value : "andere" })}
            disabled={!live}
            aria-describedby="ck-branche-key-help"
            data-testid="ck-branche-key"
          >
            {BRANCHEN.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <p id="ck-branche-key-help" className="text-sm text-muted-foreground">
            {brancheVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : ""}Die Vorschläge richten sich nach der Branche.
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Kanäle</legend>
        <p className="text-sm text-muted-foreground">
          {kanaeleVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : "Ohne Angabe im Firmenprofil sind Instagram und Google-Beitrag gewählt. "}Wähle die Kanäle, auf denen
          ihr Beiträge veröffentlicht.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kanäle">
          {KANAELE.map((k) => (
            <li key={k.key} className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={`ck-kanal-${k.key}`}
                aria-label={k.label}
                className="size-6"
                checked={live && kanaeleList.includes(k.key)}
                onCheckedChange={(v) => toggleKanal(k.key, v === true)}
                disabled={!live}
              />
              <label htmlFor={`ck-kanal-${k.key}`} className="cursor-pointer">
                {k.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Eigene Termine (freiwillig)</legend>
        <p className="text-sm text-muted-foreground">
          Messen, Tage der offenen Tür, Aktionen: Was nicht in der Liste steht, trägst du selbst ein. Bis {MAX_TERMINE} Termine; sie erscheinen im Kalender, wenn sie im
          gewählten Jahr liegen.
        </p>
        <div className="grid gap-3 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="ck-termin-datum">Datum</Label>
            <Input id="ck-termin-datum" type="date" value={tDatum} onChange={(e) => setTDatum(e.target.value)} disabled={!live} aria-describedby="ck-termin-error" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ck-termin-titel">Titel</Label>
            <Input
              id="ck-termin-titel"
              ref={terminRef}
              value={tTitel}
              maxLength={MAX_TITEL}
              placeholder="Tag der offenen Tür"
              onChange={(e) => setTTitel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNow();
                }
              }}
              disabled={!live}
              aria-describedby="ck-termin-error"
            />
          </div>
          <Button type="button" variant="outline" onClick={addNow} disabled={!live}>
            Termin hinzufügen
          </Button>
        </div>
        <p id="ck-termin-error" role="alert" className="min-h-6 text-sm text-destructive">
          {tError}
        </p>
        <ul aria-label="Eigene Termine" className="grid gap-2">
          {saved.termine.map((t, i) => (
            <li key={`${t.datum}-${t.titel}-${i}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
              <span className="min-w-0 break-words">
                {formatIso(t.datum)}: {t.titel}
              </span>
              <Button type="button" variant="ghost" size="sm" aria-label={`Termin entfernen: ${t.titel}`} onClick={() => patch({ termine: removeTermin(saved.termine, i) })}>
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          {saved.termine.length} von {MAX_TERMINE} Terminen.
        </p>
      </fieldset>

      <p id="ck-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!live || busy}>
          Kalender erstellen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert vier Minuten.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <CalendarFlow />
    </ToolShell>
  );
}
