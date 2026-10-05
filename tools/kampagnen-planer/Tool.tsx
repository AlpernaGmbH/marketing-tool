"use client";

import { cn } from "cn";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chf } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { useLocalJson, useLocalRaw } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { icsFile } from "./export";
import {
  ANGEBOT_MAX,
  BOTSCHAFTEN_KEY,
  BOTSCHAFT_MAX,
  BOTSCHAFT_MIN,
  EMPTY_STATE,
  HINWEISE,
  KANAELE,
  MATERIAL_HINWEIS,
  RICHTWERT_HINWEIS,
  SLUG,
  WOCHEN_MAX,
  WOCHEN_MIN,
  ZIELE,
  ZIELGRUPPE_MAX,
  ausgabeText,
  betragText,
  botschaftVorschlag,
  buildPlan,
  eingabeText,
  formFrom,
  formToRaw,
  isZiel,
  kampagnenName,
  kanaeleAusProfil,
  kanaeleText,
  kanaeleVorschlag,
  kanalName,
  normalizeKanaele,
  parseState,
  phaseInfo,
  sanitizeInput,
  toDocument,
  todayIso,
  validate,
  verteilungText,
  weeksBetween,
  werkzeugHref,
  zeitraumKurz,
  zeitraumLang,
  zielLabel,
  zielgruppeVorschlag,
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
const FIELD_ID: Record<Problem["feld"], string> = {
  ziel: "kp-ziel",
  zielgruppe: "kp-zielgruppe",
  botschaft: "kp-botschaft",
  angebot: "kp-angebot",
  kanaele: "kp-kanal-website",
  start: "kp-start",
  ende: "kp-ende",
  budget: "kp-budget",
};

function Intro() {
  return (
    <>
      <p>
        Sag, was die Kampagne bringen soll, für wen sie ist und wie lange sie läuft. Du bekommst einen Plan in vier Phasen: Vorbereitung, Anlauf, Hauptphase und Nachfassen, mit
        Massnahmen je Kanal und Woche, einem Budget je Woche (wenn du eines angibst), Vorschlägen für Kennzahlen, einem Kampagnenbrief und einer Kalenderdatei.
      </p>
      <p>
        Der Plan entsteht in deinem Browser. Ziel, Zielgruppe, Kernbotschaft, Angebot, Kanäle, Zeitraum, Budget und der Plan gehen mit deiner E-Mail-Adresse an Alperna, damit
        wir dir bei Fragen weiterhelfen können.
      </p>
    </>
  );
}

function ResultView({
  input,
  firma,
  headingRef,
  onEdit,
  onNew,
}: {
  input: PlanInput;
  firma: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  const ctx = useToolContext();
  // Das heutige Datum wird einmal beim Öffnen des Ergebnisses gelesen; es bestimmt nur, welche Woche läuft.
  const [heute] = useState(() => todayIso(new Date()));
  const plan = useMemo(() => buildPlan(input, heute), [input, heute]);
  const doc = useMemo(() => toDocument(plan, input, { firma }), [plan, input, firma]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mitBudget = plan.budget !== null;

  const downloadIcs = () =>
    ctx.guardDownload(async () => {
      setError(null);
      setBusy(true);
      try {
        const file = icsFile(plan, input);
        downloadBytes(file.bytes, file.filename, file.mime);
      } catch {
        setError(DOWNLOAD_ERROR);
      } finally {
        setBusy(false);
      }
    });

  const fakten: { label: string; value: string }[] = [
    { label: "Ziel", value: zielLabel(input.ziel) },
    { label: "Zielgruppe", value: input.zielgruppe },
    { label: "Kernbotschaft", value: input.botschaft },
    ...(input.angebot ? [{ label: "Angebot", value: input.angebot }] : []),
    { label: "Zeitraum", value: `${zeitraumLang(input.start, input.ende)} (${plan.wochen} Wochen)` },
    { label: "Kanäle", value: kanaeleText(input.kanaele) },
    { label: "Budget", value: mitBudget ? chf(input.budget) : "kein Budget angegeben" },
  ];

  return (
    <ResultCard
      title="Dein Kampagnenplan"
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
      <section aria-labelledby="kp-h-ueberblick" className="grid gap-2" data-testid="kp-ueberblick">
        <h4 id="kp-h-ueberblick" className="font-heading font-medium">
          {kampagnenName(input)}
        </h4>
        <dl className="grid gap-2 sm:grid-cols-[max-content_1fr] sm:gap-x-6">
          {fakten.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
        {mitBudget && (
          <p className="text-sm text-muted-foreground" data-testid="kp-verteilung">
            Verteilung: {verteilungText(plan)} (Richtwert von Alperna, keine Statistik). {MATERIAL_HINWEIS}
          </p>
        )}
      </section>

      <section className="grid gap-2">
        <h4 id="kp-h-phasen" className="font-heading font-medium">
          Phasen
        </h4>
        <ul aria-labelledby="kp-h-phasen" className="grid gap-2" data-testid="kp-phasen">
          {plan.phasen.map((p) => (
            <li key={p.key} data-testid="kp-phase" data-phase={p.key} className="min-w-0 rounded-lg border border-line p-3">
              <p className="font-medium">
                {p.label}
                <span className="font-normal text-muted-foreground">
                  {" · "}
                  {p.wochen === 1 ? `Woche ${p.ersteWoche}` : `Woche ${p.ersteWoche} bis ${p.letzteWoche}`}
                  {" · "}
                  {zeitraumLang(p.von, p.bis)}
                  {mitBudget ? ` · ${betragText(p.budget ?? 0)}` : ""}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{phaseInfo(p.key).kurz}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-2">
        <h4 id="kp-h-kennzahlen" className="font-heading font-medium">
          Kennzahlen
        </h4>
        <ul aria-labelledby="kp-h-kennzahlen" className="grid list-disc gap-1.5 pl-5" data-testid="kp-kennzahlen">
          {plan.kennzahlen.map((k) => (
            <li key={k.key}>{k.label}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground" data-testid="kp-kpi-hinweis">
          Zielwerte setzt du im{" "}
          <Link href={werkzeugHref("kpi-baum")} className="underline underline-offset-4">
            Ziel- und KPI-Baum
          </Link>
          .
        </p>
      </section>

      <section className="grid gap-2">
        <h4 id="kp-h-wochenplan" className="font-heading font-medium">
          Wochenplan
        </h4>
        <ul aria-labelledby="kp-h-wochenplan" className="grid gap-3" data-testid="kp-wochenplan">
          {plan.zeilen.map((z) => (
            <li
              key={z.nr}
              data-testid="kp-woche"
              data-nr={z.nr}
              data-phase={z.phase}
              data-status={z.status}
              className={cn("min-w-0 rounded-lg border p-3", z.status === "laeuft" ? "border-ink" : "border-line")}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p id={`kp-woche-${z.nr}`} className="font-medium">
                  Woche {z.nr}
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {z.phaseLabel}
                    {" · "}
                    {zeitraumKurz(z.von, z.bis)}
                  </span>
                  {z.status === "laeuft" && <span className="ml-2 rounded-full border border-ink px-2 py-0.5 text-xs font-normal">läuft diese Woche</span>}
                  {z.status === "vorbei" && <span className="ml-2 text-xs font-normal text-muted-foreground">vorbei</span>}
                </p>
                {mitBudget && (
                  <p className="text-sm" data-testid="kp-woche-budget">
                    {betragText(z.budget ?? 0)}
                  </p>
                )}
              </div>
              {z.massnahmen.length > 0 ? (
                <ul aria-label={`Massnahmen Woche ${z.nr}`} className="mt-2 grid gap-1.5">
                  {z.massnahmen.map((m) => (
                    <li key={m.id} data-testid="kp-massnahme" data-kanal={m.kanal} className="min-w-0 break-words">
                      <span className="text-sm text-muted-foreground">{kanalName(m.kanal)}: </span>
                      {m.titel}
                      {m.hinweis ? <span className="text-sm text-muted-foreground">{` (${m.hinweis.replace(/\.$/, "")})`}</span> : null}
                      {m.werkzeug && (
                        <>
                          {" "}
                          <Link href={werkzeugHref(m.werkzeug)} aria-label={`Werkzeug öffnen: ${m.titel}`} className="whitespace-nowrap text-sm underline underline-offset-4">
                            Werkzeug öffnen
                          </Link>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Keine Massnahme in dieser Woche.</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-2">
        <h4 id="kp-h-hinweise" className="font-heading font-medium">
          Hinweise
        </h4>
        <ul aria-labelledby="kp-h-hinweise" className="grid list-disc gap-1.5 pl-5" data-testid="kp-hinweise">
          {HINWEISE.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Dateien" className="grid gap-3">
        <h4 className="font-heading font-medium">Dateien</h4>
        <p className="text-sm text-muted-foreground">
          Der Kampagnenbrief ist ein Dokument mit Steckbrief, Phasen und Wochenplan: als PDF, als Word-Datei oder als Text zum Kopieren. Die Kalenderdatei (.ics) öffnest du in
          Google Kalender, Outlook oder Apple Kalender: ein ganztägiger Eintrag je Meilenstein, vom Start der Vorbereitung bis zur Auswertung.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={busy} onClick={downloadIcs} data-testid="kp-ics" data-umami-event="export_ics" data-umami-event-tool={SLUG}>
            {busy ? "Kalender wird erstellt …" : "Kalender (.ics) herunterladen"}
          </Button>
        </div>
        <DocumentExport model={doc} />
        <p role="alert" className="min-h-6 text-sm text-destructive">
          {error}
        </p>
      </section>

      <p className="text-sm text-muted-foreground" data-testid="kp-richtwert">
        {RICHTWERT_HINWEIS}
      </p>
    </ResultCard>
  );
}

function PlannerFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson<PlannerState>(`mt:${SLUG}`, parseState);
  // Der gespeicherte Stand von «Kernbotschaften» liefert die Hauptbotschaft als Vorschlag; ohne ihn bleibt das Feld leer.
  const botschaftenRaw = useLocalRaw(BOTSCHAFTEN_KEY);
  const vorschlag = useMemo(() => {
    if (!botschaftenRaw) return "";
    try {
      return botschaftVorschlag(JSON.parse(botschaftenRaw));
    } catch {
      return "";
    }
  }, [botschaftenRaw]);
  const live = ready && profileReady && botschaftenRaw !== undefined;

  // Änderungen am Formular leben im Entwurf, bis der Plan erstellt wird; vorher gilt der gespeicherte Stand.
  const [draft, setDraft] = useState<FormFields | null>(null);
  const form = draft ?? formFrom(saved.input);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<"heading" | "ziel" | null>(null);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "ziel") document.getElementById("kp-ziel")?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const ziel = form.ziel ?? ZIELE[0].key;
  const zielgruppe = form.zielgruppe ?? zielgruppeVorschlag(profile);
  const botschaft = form.botschaft ?? vorschlag;
  const kanaeleListe = normalizeKanaele(form.kanaele ?? kanaeleVorschlag(profile));
  const kanaeleVomProfil = form.kanaele === null && kanaeleAusProfil(profile).length > 0;
  const zielgruppeVomProfil = form.zielgruppe === null && zielgruppe !== "";
  const botschaftVonBotschaften = form.botschaft === null && vorschlag !== "";
  const firma = profile.firma?.trim() ?? "";
  const wochen = weeksBetween(form.start, form.ende);

  const edit = (patch: Partial<FormFields>) => {
    setDraft({ ...form, ...patch });
    setProblems([]);
  };
  const toggleKanal = (key: KanalKey, on: boolean) => edit({ kanaele: normalizeKanaele(on ? [...kanaeleListe, key] : kanaeleListe.filter((k) => k !== key)) });
  const has = (feld: Problem["feld"]) => problems.some((p) => p.feld === feld);

  async function start() {
    const heute = todayIso(new Date());
    const raw = formToRaw(form, profile, vorschlag);
    const found = validate(raw, heute);
    if (found.length > 0) {
      setProblems(found);
      document.getElementById(FIELD_ID[found[0].feld])?.focus();
      return;
    }
    const input = sanitizeInput(raw);
    if (!input) return;
    setProblems([]);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const plan = buildPlan(input, heute);
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", input, output: { erstellt: heute } });
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
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "ziel";
          setDraft(null);
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "ziel";
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
        <ProfileFieldsForm idPrefix="kp" fields={["organisationstyp", "firma", "branche"]} />
        <p className="text-sm text-muted-foreground">
          Firma, Branche und Art der Organisation speichern wir in deinem Firmenprofil, in deinem Browser. Die Art der Organisation bestimmt die Kennzahlen-Vorschläge.
        </p>
      </fieldset>

      <fieldset className="grid gap-5" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Deine Kampagne</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="kp-ziel">Was soll die Kampagne bringen?</Label>
          <select
            id="kp-ziel"
            className={selectClass}
            value={ziel}
            onChange={(e) => edit({ ziel: isZiel(e.target.value) ? e.target.value : null })}
            disabled={!live}
            aria-invalid={has("ziel")}
            aria-describedby="kp-error"
            data-testid="kp-ziel"
          >
            {ZIELE.map((z) => (
              <option key={z.key} value={z.key}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kp-zielgruppe">Für wen?</Label>
          <Input
            id="kp-zielgruppe"
            value={zielgruppe}
            maxLength={ZIELGRUPPE_MAX}
            placeholder="Hausbesitzerinnen und Hausbesitzer in Gossau"
            onChange={(e) => edit({ zielgruppe: e.target.value })}
            disabled={!live}
            required
            aria-invalid={has("zielgruppe")}
            aria-describedby="kp-zielgruppe-help kp-error"
          />
          <p id="kp-zielgruppe-help" className="text-sm text-muted-foreground">
            {zielgruppeVomProfil ? "Vorbelegt aus deinem Firmenprofil (Primärsegment). " : ""}Höchstens {ZIELGRUPPE_MAX} Zeichen.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kp-botschaft">Kernbotschaft in einem Satz</Label>
          <Input
            id="kp-botschaft"
            value={botschaft}
            maxLength={BOTSCHAFT_MAX}
            onChange={(e) => edit({ botschaft: e.target.value })}
            disabled={!live}
            required
            aria-invalid={has("botschaft")}
            aria-describedby="kp-botschaft-help kp-error"
          />
          <p id="kp-botschaft-help" className="text-sm text-muted-foreground">
            {botschaftVonBotschaften ? "Vorbelegt aus deinem Ergebnis in «Kernbotschaften». " : ""}
            {BOTSCHAFT_MIN} bis {BOTSCHAFT_MAX} Zeichen.
            {botschaft === "" && (
              <>
                {" Noch keine? Im Werkzeug "}
                <Link href={werkzeugHref("botschaften")} className="underline underline-offset-4">
                  Kernbotschaften
                </Link>
                {" entsteht sie."}
              </>
            )}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kp-angebot">Angebot oder Anreiz (freiwillig)</Label>
          <Input
            id="kp-angebot"
            value={form.angebot}
            maxLength={ANGEBOT_MAX}
            placeholder="Herbstaktion Fassadenanstrich"
            onChange={(e) => edit({ angebot: e.target.value })}
            disabled={!live}
            aria-invalid={has("angebot")}
            aria-describedby="kp-angebot-help kp-error"
          />
          <p id="kp-angebot-help" className="text-sm text-muted-foreground">
            Dient als Name der Kampagne im Brief und im Kalender. Höchstens {ANGEBOT_MAX} Zeichen.
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Kanäle</legend>
        <p className="text-sm text-muted-foreground">
          {kanaeleVomProfil ? "Vorbelegt aus deinem Firmenprofil. " : "Ohne Angabe im Firmenprofil sind Website, Instagram sowie Aushang und Flyer gewählt. "}Massnahmen für Kanäle,
          die du nicht wählst, fehlen im Plan. Lieber wenige Kanäle, die du wirklich bespielst.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kanäle">
          {KANAELE.map((k) => (
            <li key={k.key} className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={`kp-kanal-${k.key}`}
                aria-label={k.label}
                className="size-6"
                checked={live && kanaeleListe.includes(k.key)}
                onCheckedChange={(v) => toggleKanal(k.key, v === true)}
                disabled={!live}
                aria-invalid={has("kanaele")}
              />
              <label htmlFor={`kp-kanal-${k.key}`} className="cursor-pointer">
                {k.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Zeitraum und Budget</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="kp-start">Start</Label>
          <Input
            id="kp-start"
            type="date"
            value={form.start}
            onChange={(e) => edit({ start: e.target.value })}
            disabled={!live}
            required
            aria-invalid={has("start")}
            aria-describedby="kp-error"
            data-testid="kp-start"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kp-ende">Ende</Label>
          <Input
            id="kp-ende"
            type="date"
            value={form.ende}
            min={form.start || undefined}
            onChange={(e) => edit({ ende: e.target.value })}
            disabled={!live}
            required
            aria-invalid={has("ende")}
            aria-describedby="kp-zeitraum-help kp-error"
            data-testid="kp-ende"
          />
        </div>
        <p id="kp-zeitraum-help" className="text-sm text-muted-foreground sm:col-span-2">
          Mindestens {WOCHEN_MIN} und höchstens {WOCHEN_MAX} Wochen. Das Ende zählt mit.
        </p>
        <p role="status" aria-live="polite" className="min-h-6 font-medium sm:col-span-2" data-testid="kp-wochen">
          {wochen > 0 ? `Das sind ${wochen} ${wochen === 1 ? "Woche" : "Wochen"}.` : ""}
        </p>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="kp-budget">Budget in CHF (freiwillig)</Label>
          <Input
            id="kp-budget"
            type="number"
            inputMode="numeric"
            min={0}
            max={1000000}
            step={1}
            value={form.budget}
            onChange={(e) => edit({ budget: e.target.value })}
            disabled={!live}
            aria-invalid={has("budget")}
            aria-describedby="kp-budget-help kp-error"
            data-testid="kp-budget"
          />
          <p id="kp-budget-help" className="text-sm text-muted-foreground">
            {"Ganze Franken, von 0 bis 1'000'000. Ohne Budget zeigt der Plan keine Beträge."}
          </p>
        </div>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Phasen, Massnahmen und Budgetverteilung sind ein Richtwert von Alperna, keine Statistik und keine Vorschrift.
      </p>

      <div id="kp-error" role="alert" className="min-h-6 text-destructive">
        {problems.map((p) => (
          <p key={p.feld}>{p.text}</p>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!live || busy}>
          Kampagne planen
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
            Zurück zum Plan
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
