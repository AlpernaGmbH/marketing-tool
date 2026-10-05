"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  DATA,
  EMPTY_STATE,
  HELP_TITLE,
  HELP_URL,
  NATIONAL_NOTE,
  RULE_KINDS,
  RULE_LABELS,
  SLUG,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  ALARM_DAYS,
  ausgabeText,
  buildCsv,
  buildIcs,
  buildPlan,
  closedHint,
  copyText,
  csvFilename,
  dayText,
  defaultYear,
  eingabeText,
  formProblem,
  formatIso,
  hoursProblem,
  holidaysFor,
  icsFilename,
  isChecked,
  isKanton,
  isRuleKind,
  kantonLabel,
  kantonName,
  noListMessage,
  parseState,
  ruleFor,
  ruleProblem,
  sourcesFor,
  yearOptions,
  type DayHours,
  type GfState,
  type Holiday,
  type Quelle,
  type Rule,
  type Window as TimeWindow,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

const DOWNLOAD_ERROR = "Der Download hat nicht geklappt. Versuch es noch einmal.";

type Download = "ics" | "csv";

function Intro() {
  return (
    <>
      <p>
        Wähl deinen Kanton und das Jahr, trag deine normalen Öffnungszeiten ein und leg für jeden Feiertag fest, ob du geschlossen hast, wie am Sonntag
        offen hast oder Sonderzeiten gelten. Du bekommst die Liste zum Abtippen ins Google-Unternehmensprofil, einen Kalender (.ics) mit Erinnerung zehn
        Tage vorher und eine CSV.
      </p>
      <p>
        Die Liste entsteht in deinem Browser. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können.
      </p>
    </>
  );
}

/** Die Zeitfenster eines Tages mit Beschriftung «von» und «bis»; der Wochentag steht im aria-label. */
function WindowFields({
  idBase,
  day,
  label,
  short,
  win,
  disabled,
  invalid,
  onChange,
}: {
  idBase: string;
  day: string;
  /** Beschriftung über den Feldern. */
  label: string;
  /** Kurzname des Zeitfensters für den aria-label der Felder. */
  short: string;
  win: TimeWindow;
  disabled: boolean;
  invalid: boolean;
  onChange: (next: TimeWindow) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <p className="col-span-2 text-xs text-muted-foreground">{label}</p>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idBase}-von`}>von</Label>
        <Input
          id={`${idBase}-von`}
          type="time"
          aria-label={`${day}, ${short}, von`}
          value={win.von}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => onChange({ ...win, von: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idBase}-bis`}>bis</Label>
        <Input
          id={`${idBase}-bis`}
          type="time"
          aria-label={`${day}, ${short}, bis`}
          value={win.bis}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => onChange({ ...win, bis: e.target.value })}
        />
      </div>
    </div>
  );
}

function DayRow({
  index,
  day,
  disabled,
  problem,
  onChange,
}: {
  index: number;
  day: DayHours;
  disabled: boolean;
  problem: string | null;
  onChange: (next: DayHours) => void;
}) {
  const name = WEEKDAYS[index];
  const id = (f: string) => `gf-z-${index}-${f}`;
  const inputsOff = disabled || !day.offen;
  return (
    <li className="grid gap-3 rounded-xl border border-line p-4" data-testid={`tag-${index + 1}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-heading font-medium">{name}</span>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-ink"
            aria-label={`${name} geöffnet`}
            checked={day.offen}
            disabled={disabled}
            onChange={(e) => onChange({ ...day, offen: e.target.checked })}
          />
          <span>geöffnet</span>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <WindowFields
          idBase={id("f1")}
          day={name}
          label="Zeitfenster 1"
          short="Zeitfenster 1"
          win={day.f1}
          disabled={inputsOff}
          invalid={Boolean(problem)}
          onChange={(f1) => onChange({ ...day, f1 })}
        />
        <WindowFields
          idBase={id("f2")}
          day={name}
          label="Zeitfenster 2, optional"
          short="Zeitfenster 2"
          win={day.f2}
          disabled={inputsOff}
          invalid={Boolean(problem)}
          onChange={(f2) => onChange({ ...day, f2 })}
        />
      </div>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </li>
  );
}

function HolidayRow({
  holiday,
  rule,
  hours,
  disabled,
  problem,
  onChange,
}: {
  holiday: Holiday;
  rule: Rule;
  hours: DayHours[];
  disabled: boolean;
  problem: string | null;
  onChange: (next: Rule) => void;
}) {
  const id = (f: string) => `gf-r-${holiday.id}-${f}`;
  const hint = closedHint(holiday, hours);
  const gone = Boolean(holiday.entfaellt);
  return (
    <li className="grid gap-3 rounded-xl border border-line p-4" data-testid={`feiertag-${holiday.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-heading font-medium">
          {holiday.name}
          {holiday.art === "ortsueblich" && (
            <span className="ml-2 rounded-full border border-line px-2 py-0.5 align-middle text-xs font-normal text-muted-foreground">ortsüblich</span>
          )}
        </span>
        <span className="mono text-sm text-muted-foreground">
          {WEEKDAYS_SHORT[holiday.weekday]} {formatIso(holiday.date)}
        </span>
      </div>
      {holiday.hinweis && <p className="text-sm text-muted-foreground">{holiday.hinweis}</p>}
      {holiday.entfaellt && <p className="text-sm text-muted-foreground">{holiday.entfaellt}</p>}
      {hint && !gone && (
        <p className="text-sm text-muted-foreground" data-testid={`hinweis-${holiday.id}`}>
          Der Tag {hint}. Dann ist nichts einzutragen, ausser du öffnest an diesem Tag.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={id("regel")}>Regel</Label>
          <select
            id={id("regel")}
            className={selectClass}
            aria-label={`Regel für ${holiday.name}`}
            value={rule.kind}
            disabled={disabled || gone}
            onChange={(e) => {
              const to = e.target.value;
              if (isRuleKind(to)) onChange({ ...rule, kind: to });
            }}
          >
            {RULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {RULE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        {rule.kind === "zeiten" && !gone && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor={id("von")}>von</Label>
              <Input
                id={id("von")}
                type="time"
                aria-label={`${holiday.name}, Sonderzeiten von`}
                value={rule.von}
                disabled={disabled}
                aria-invalid={Boolean(problem)}
                onChange={(e) => onChange({ ...rule, von: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={id("bis")}>bis</Label>
              <Input
                id={id("bis")}
                type="time"
                aria-label={`${holiday.name}, Sonderzeiten bis`}
                value={rule.bis}
                disabled={disabled}
                aria-invalid={Boolean(problem)}
                onChange={(e) => onChange({ ...rule, bis: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
      {rule.kind === "sonntag" && !gone && (
        <p className="text-sm text-muted-foreground">Es gelten deine Sonntagszeiten: {dayText(hours[6])}.</p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </li>
  );
}

function SourceItem({ q }: { q: Quelle }) {
  return (
    <li>
      <a href={q.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
        {q.titel}
      </a>{" "}
      <span className="text-muted-foreground">({q.stand})</span>
      {q.weitere && q.weitere.length > 0 && (
        <ul className="mt-1 grid gap-1 pl-4">
          {q.weitere.map((w) => (
            <li key={w.url}>
              <a href={w.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {w.titel}
              </a>{" "}
              <span className="text-muted-foreground">({w.stand})</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ResultView({
  state,
  firma,
  onEdit,
  onNew,
  headingRef,
}: {
  state: GfState;
  firma?: string;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const ctx = useToolContext();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { kanton, jahr } = state;
  const holidays = useMemo(() => (DATA ? holidaysFor(kanton, jahr, DATA) : []), [kanton, jahr]);
  const plan = useMemo(() => buildPlan(holidays, state.regeln, state.zeiten), [holidays, state.regeln, state.zeiten]);
  const checked = DATA ? isChecked(kanton, DATA) : false;
  const sources = DATA ? sourcesFor(kanton, DATA) : null;
  const gesetzlich = holidays.filter((h) => h.art === "gesetzlich");
  const ortsueblich = holidays.filter((h) => h.art === "ortsueblich");
  const hasEntries = plan.entries.length > 0;

  function run(kind: Download) {
    setError(null);
    setNotice(null);
    try {
      const enc = new TextEncoder();
      if (kind === "ics") {
        downloadBytes(enc.encode(buildIcs(plan.entries, jahr, { firma })), icsFilename(kanton, jahr), "text/calendar;charset=utf-8");
        setNotice("Der Kalender wurde heruntergeladen.");
      } else {
        downloadBytes(enc.encode(buildCsv(plan.entries)), csvFilename(kanton, jahr), "text/csv;charset=utf-8");
        setNotice("Die CSV wurde heruntergeladen.");
      }
    } catch {
      setError(DOWNLOAD_ERROR);
    }
  }

  return (
    <ResultCard
      title="Deine Sonderöffnungszeiten"
      headingRef={headingRef}
      actions={
        <>
          <CopyButton text={() => copyText(plan)} label="Liste kopieren" />
          <Button
            type="button"
            disabled={!hasEntries}
            onClick={() => ctx.guardDownload(() => run("ics"))}
            data-umami-event="export_ics"
            data-umami-event-tool={ctx.slug}
          >
            Kalender (.ics) herunterladen
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!hasEntries}
            onClick={() => ctx.guardDownload(() => run("csv"))}
            data-umami-event="export_csv"
            data-umami-event-tool={ctx.slug}
          >
            CSV herunterladen
          </Button>
          <Button type="button" variant="outline" onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neu beginnen
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {kantonLabel(kanton)}, {jahr}
        {firma ? `, ${firma}` : ""}. {plan.entries.length} {plan.entries.length === 1 ? "Eintrag" : "Einträge"} zum Abtippen.
      </p>

      {!checked && (
        <p className="rounded-xl bg-surface p-4 text-sm" data-testid="keine-liste">
          {noListMessage(kanton)} {NATIONAL_NOTE}
        </p>
      )}

      {hasEntries ? (
        <ol aria-label="Sonderöffnungszeiten" className="mono grid gap-2 rounded-xl border border-line p-4 text-sm md:text-base" data-testid="sonderzeiten">
          {plan.entries.map((e) => (
            <li key={e.holiday.id}>{e.line}</li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl bg-surface p-4 text-sm">
          Es gibt nichts abzutippen: Alle Tage stehen auf «nicht eintragen» oder fallen auf Tage, an denen du ohnehin geschlossen hast.
        </p>
      )}

      {plan.unnoetig.length > 0 && (
        <section aria-labelledby="gf-unnoetig" className="grid gap-2">
          <h4 id="gf-unnoetig" className="font-heading text-base font-semibold">
            Nichts einzutragen
          </h4>
          <ul aria-label="Tage ohne Eintrag" className="grid gap-1 text-sm text-muted-foreground">
            {plan.unnoetig.map((s) => (
              <li key={s.holiday.id}>
                {WEEKDAYS_SHORT[s.holiday.weekday]} {formatIso(s.holiday.date)}, {s.holiday.name}: {s.grund}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.entfallen.length > 0 && (
        <section aria-labelledby="gf-entfallen" className="grid gap-2">
          <h4 id="gf-entfallen" className="font-heading text-base font-semibold">
            Gilt in diesem Jahr nicht
          </h4>
          <ul aria-label="Entfallene Tage" className="grid gap-1 text-sm text-muted-foreground">
            {plan.entfallen.map((s) => (
              <li key={s.holiday.id}>
                {s.holiday.name}: {s.grund}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="gf-anleitung" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 id="gf-anleitung" className="font-heading text-base font-semibold">
          So trägst du die Zeiten ein
        </h4>
        <p className="text-sm">
          Öffne dein Google-Unternehmensprofil, wähl «Profil bearbeiten» und dann «Öffnungszeiten». Wähl neben «Spezielle Öffnungszeiten» die Option
          «Bearbeiten», such das Datum aus und stell den Tag auf geschlossen oder trag die Zeiten ein. Speichere und geh so Zeile für Zeile durch die
          Liste.
        </p>
        <p className="text-sm">
          <a href={HELP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            Hilfe von Google: {HELP_TITLE}
          </a>
        </p>
      </section>

      <section aria-labelledby="gf-hinweis" className="grid gap-2 rounded-xl border border-line p-4">
        <h4 id="gf-hinweis" className="font-heading text-base font-semibold">
          Gesetzlich und ortsüblich
        </h4>
        <p className="text-sm text-muted-foreground">
          «Gesetzlich» heisst: Die Quelle nennt den Tag als Feiertag oder öffentlichen Ruhetag des Kantons. «Ortsüblich» heisst: Der Tag gilt nur in Teilen
          des Kantons. Prüfe bei deiner Gemeinde, ob er für deinen Standort gilt.
        </p>
        <ul aria-label="Gesetzliche Feiertage" className="text-sm">
          <li>
            <span className="font-medium">Gesetzlich:</span> {gesetzlich.map((h) => h.name).join(", ") || "keine"}
          </li>
        </ul>
        {ortsueblich.length > 0 && (
          <ul aria-label="Ortsübliche Feiertage" className="grid gap-1 text-sm">
            <li>
              <span className="font-medium">Ortsüblich:</span> {ortsueblich.map((h) => h.name).join(", ")}
            </li>
          </ul>
        )}
        {sources?.hinweis && <p className="text-sm">{sources.hinweis}</p>}
        {sources && (
          <>
            <p className="text-sm font-medium">Quellen, Stand der Daten {DATA ? formatIso(DATA.meta.asOf) : ""}</p>
            <ul aria-label="Quellen" className="grid gap-2 text-sm">
              {sources.kanton && <SourceItem q={sources.kanton} />}
              {sources.bund.map((q) => (
                <SourceItem key={q.url} q={q} />
              ))}
            </ul>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          Die Liste ersetzt keine Auskunft deines Kantons oder deiner Gemeinde. Prüfe die Tage, bevor du sie einträgst.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        Der Kalender enthält einen Ganztagstermin je Eintrag mit einer Erinnerung {ALARM_DAYS} Tage vorher. Die CSV öffnet sich in Excel mit Semikolon.
      </p>

      {notice && (
        <p role="status" aria-live="polite" className="text-sm font-medium">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </ResultCard>
  );
}

function FeiertageFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady, update: updateProfile } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  const [now] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const shouldFocus = useRef<"heading" | "form" | null>(null);

  const years = useMemo(() => (DATA ? yearOptions(DATA, now) : []), [now]);
  const jahr = years.includes(saved.jahr) ? saved.jahr : DATA ? defaultYear(DATA, now) : 0;
  const kanton = isKanton(profile.kanton) ? profile.kanton : "";
  const holidays = useMemo(() => (DATA && kanton && jahr ? holidaysFor(kanton, jahr, DATA) : []), [kanton, jahr]);
  const checked = DATA && kanton ? isChecked(kanton, DATA) : false;
  const hinweis = DATA && kanton ? sourcesFor(kanton, DATA).hinweis : null;

  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "form") formRef.current?.querySelector<HTMLElement>("select, input")?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  // Jede Änderung im Formular landet sofort im Stand (mt:gbp-feiertage), das Ergebnis bleibt dabei ungültig.
  const edit = (patch: Partial<Pick<GfState, "jahr" | "zeiten" | "regeln">>) => {
    setError(null);
    set({ ...saved, phase: "edit", jahr, ...patch });
  };

  async function start() {
    const problem = !DATA
      ? "Die Feiertagsdaten sind nicht verfügbar. Lade die Seite neu."
      : !kanton
        ? "Wähl zuerst deinen Kanton."
        : formProblem(holidays, saved.regeln, saved.zeiten);
    if (problem) {
      setShowProblems(true);
      return setError(problem);
    }
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      shouldFocus.current = "heading";
      const regeln = Object.fromEntries(holidays.map((h) => [h.id, ruleFor(h, saved.regeln)]));
      const next: GfState = { v: 1, phase: "result", kanton, jahr, zeiten: saved.zeiten, regeln };
      set(next);
      setShowProblems(false);
      const plan = buildPlan(holidays, regeln, next.zeiten);
      void ctx.sendResult({ eingabe: eingabeText(next, holidays), ausgabe: ausgabeText(plan, kanton, jahr) });
    } finally {
      setBusy(false);
    }
  }

  if (ready && saved.phase === "result") {
    return (
      <ResultView
        state={saved}
        firma={profile.firma?.trim() || undefined}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "form";
          // Das Profil hält den Kanton; ist er dort leer, gilt der Kanton des Ergebnisses.
          if (!isKanton(profile.kanton) && isKanton(saved.kanton)) updateProfile({ kanton: saved.kanton });
          setShowProblems(false);
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "form";
          setError(null);
          setShowProblems(false);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const dayProblem = (i: number): string | null =>
    showProblems ? hoursProblem(saved.zeiten.map((d, j) => (j === i ? d : { ...d, offen: false }))) : null;

  return (
    <form
      ref={formRef}
      className="grid gap-6"
      noValidate
      aria-busy={!ready || !profileReady}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-3" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="gf" fields={["firma", "kanton"]} />
        <div className="grid gap-1.5">
          <Label htmlFor="gf-jahr">Jahr</Label>
          <select
            id="gf-jahr"
            className={selectClass}
            value={jahr || ""}
            disabled={!ready || years.length === 0}
            onChange={(e) => {
              const y = Number(e.target.value);
              if (years.includes(y)) edit({ jahr: y });
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted-foreground md:col-span-3">
          Firma und Kanton speichern wir in deinem Firmenprofil, in deinem Browser. Der Kanton bestimmt, welche Feiertage in der Liste stehen.
        </p>
      </fieldset>

      <fieldset className="grid gap-4" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Normale Öffnungszeiten</legend>
        <p className="text-sm text-muted-foreground">
          Zwei Zeitfenster je Tag, zum Beispiel am Vormittag und am Nachmittag. Hast du durchgehend offen, füll nur das erste aus.
        </p>
        <ul aria-label="Öffnungszeiten" className="grid gap-4" data-testid="oeffnungszeiten">
          {saved.zeiten.map((day, i) => (
            <DayRow
              key={WEEKDAYS[i]}
              index={i}
              day={day}
              disabled={!ready}
              problem={dayProblem(i)}
              onChange={(next) => edit({ zeiten: saved.zeiten.map((d, j) => (j === i ? next : d)) })}
            />
          ))}
        </ul>
      </fieldset>

      <fieldset className="grid gap-4" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Regel je Feiertag</legend>
        {!kanton && (
          <p role="status" className="rounded-xl bg-surface p-4 text-sm">
            Wähl oben deinen Kanton. Dann erscheinen hier die Feiertage.
          </p>
        )}
        {kanton && !checked && (
          <p role="status" className="rounded-xl bg-surface p-4 text-sm" data-testid="keine-liste">
            {noListMessage(kanton)} {NATIONAL_NOTE}
          </p>
        )}
        {kanton && checked && hinweis && <p className="rounded-xl bg-surface p-4 text-sm">{hinweis}</p>}
        {kanton && holidays.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              {holidays.length} Tage für {kantonName(kanton)} {jahr}. Gesetzliche Tage starten auf «geschlossen», ortsübliche auf «nicht eintragen».
            </p>
            <ul aria-label="Feiertage" className="grid gap-4" data-testid="feiertage">
              {holidays.map((h) => {
                const rule = ruleFor(h, saved.regeln);
                return (
                  <HolidayRow
                    key={h.id}
                    holiday={h}
                    rule={rule}
                    hours={saved.zeiten}
                    disabled={!ready}
                    problem={showProblems ? ruleProblem(h, rule) : null}
                    onChange={(next) => edit({ regeln: { ...saved.regeln, [h.id]: next } })}
                  />
                );
              })}
            </ul>
          </>
        )}
      </fieldset>

      <p id="gf-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy || !DATA}>
          Liste erstellen
        </Button>
        <span className="text-sm text-muted-foreground">Dein Ergebnis erscheint nach der Angabe deiner E-Mail-Adresse.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <FeiertageFlow />
    </ToolShell>
  );
}
