"use client";

import { cn } from "cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  ALLE,
  AUFWAND_HINWEIS,
  AUFWAND_LABELS,
  BRANCHEN,
  EMPTY_FILTER,
  EXPORT_LABELS,
  FORMATE,
  FORMAT_LABELS,
  IDEEN,
  MAX_MERK,
  MERKLISTE_KEY,
  MONAT_NAMEN,
  PAGE_SIZE,
  SAEULEN,
  SAEULE_LABELS,
  STATE_KEY,
  UEBERGREIFEND,
  ZIELE,
  ZIEL_LABELS,
  ausgabeText,
  brancheLabel,
  buildCsv,
  buildIcs,
  countText,
  eigeneSaeulen,
  eingabeText,
  exportBasename,
  filterIdeen,
  initialFilter,
  isFormat,
  isMonatWert,
  isSaeule,
  isZiel,
  merkIdeen,
  merkSignature,
  merklisteMarkdown,
  monateLabel,
  parseMerkliste,
  parseState,
  randomIdea,
  stateAfterMerk,
  toggleMerk,
  visibleLimit,
  type ExportKind,
  type Filter,
  type Idea,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Knöpfe mit langem Text dürfen auf 375 px umbrechen, statt über den Rand zu laufen. */
const WRAP_BUTTON = "h-auto min-h-11 whitespace-normal py-2 text-center";

/** Leise Knöpfe (Entfernen, Liste leeren): unterstrichen wie «ändern» im Kopf, mit voller Trefferfläche. */
const LINK_BUTTON = "px-1 underline";

const DOWNLOAD_ERROR = "Der Download hat nicht geklappt. Versuch es noch einmal oder kopiere die Merkliste.";

const cardDomId = (id: string) => `ci-card-${id}`;
const titleDomId = (id: string) => `ci-titel-${id}`;
const merkDomId = (id: string) => `ci-merk-${id}`;

function Intro() {
  return (
    <>
      <p>
        Wähle Branche und Monat, merke dir, was zu deinem Betrieb passt, und nimm die Merkliste als CSV oder als Kalender-Entwurf mit. Das Durchsuchen ist frei,
        die Ideen schreibt die Redaktion von Alperna, ohne KI und ohne Zahlen.
      </p>
      <p>
        Merkliste und Filter bleiben in deinem Browser. Für die Dateien brauchen wir deine E-Mail-Adresse. Mit einer Datei gehen deine Filter und die gemerkten
        Titel an Alperna, damit wir dir bei Fragen weiterhelfen können.
      </p>
    </>
  );
}

/** Eckdaten einer Idee als Liste von Begriff und Wert. */
function Facts({ idea, showBranche }: { idea: Idea; showBranche: boolean }) {
  const rows: [string, string][] = [
    ...(showBranche ? ([["Für", idea.branche === ALLE ? "alle Betriebe" : brancheLabel(idea.branche)]] as [string, string][]) : []),
    ["Format", FORMAT_LABELS[idea.format]],
    ["Aufwand", AUFWAND_LABELS[idea.aufwand]],
    ["Ziel", ZIEL_LABELS[idea.ziel]],
    ["Monate", monateLabel(idea.monate)],
    ...(idea.saeule ? ([["Säule", SAEULE_LABELS[idea.saeule]]] as [string, string][]) : []),
  ];
  return (
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="flex gap-1.5">
          <dt className="text-muted-foreground">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IdeaCard({
  idea,
  merkt,
  highlighted,
  canMerk,
  showBranche,
  onToggle,
}: {
  idea: Idea;
  merkt: boolean;
  highlighted: boolean;
  canMerk: boolean;
  showBranche: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <li>
      <article
        id={cardDomId(idea.id)}
        tabIndex={-1}
        aria-labelledby={titleDomId(idea.id)}
        data-testid="ci-card"
        data-idea-id={idea.id}
        data-highlight={highlighted ? "true" : undefined}
        className={cn("rounded-xl border bg-paper p-5", highlighted ? "border-ink ring-2 ring-ink" : "border-line")}
      >
        <p id={titleDomId(idea.id)} className="font-heading text-lg leading-snug font-medium">
          {idea.titel}
        </p>
        <p className="mt-2">{idea.beschrieb}</p>
        <p className="mt-2">
          <span className="text-sm text-muted-foreground">Erster Satz: </span>
          <em>«{idea.hook}»</em>
        </p>
        <Facts idea={idea} showBranche={showBranche} />
        <div className="mt-4">
          <Button
            type="button"
            variant={merkt ? "default" : "outline"}
            aria-pressed={merkt}
            aria-describedby={titleDomId(idea.id)}
            disabled={!canMerk && !merkt}
            onClick={() => onToggle(idea.id)}
            data-umami-event="idea_merken"
            data-umami-event-tool={config.slug}
          >
            {merkt ? "Gemerkt" : "Merken"}
          </Button>
        </div>
      </article>
    </li>
  );
}

type Highlight = { id: string; key: string };
type PendingFocus = { id: string; block: ScrollLogicalPosition };

function ContentIdeen() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: merk, ready: merkReady, set: setMerk } = useLocalJson(MERKLISTE_KEY, parseMerkliste);
  const { value: state, set: setState } = useLocalJson(STATE_KEY, parseState);

  // ---- Filter: Startwerte aus dem Profil, was die Person ändert, liegt darüber ----
  const { branche: profilBranche, organisationstyp, contentSaeulen } = profile;
  const base = useMemo<Filter>(
    // Erst nach der Hydrierung: Der Monat hängt von der Uhr des Browsers ab, der Server kennt ihn nicht.
    () => (profileReady ? initialFilter({ branche: profilBranche, organisationstyp }, new Date()) : EMPTY_FILTER),
    [profileReady, profilBranche, organisationstyp],
  );
  const [touched, setTouched] = useState<Partial<Filter>>({});
  const [query, setQuery] = useState("");
  const filter: Filter = { ...base, ...touched };
  const { branche, mitAllgemein, format, monat, ziel, saeule } = filter;
  const change = (patch: Partial<Filter>) => setTouched((t) => ({ ...t, ...patch }));
  const specificBranche = branche !== ALLE && branche !== UEBERGREIFEND;
  const fromProfile = touched.branche === undefined && base.branche !== ALLE;
  const eigene = useMemo(() => eigeneSaeulen(contentSaeulen), [contentSaeulen]);

  const results = useMemo(
    () => filterIdeen(IDEEN, { branche, mitAllgemein, format, monat, ziel, saeule }, query),
    [branche, mitAllgemein, format, monat, ziel, saeule, query],
  );
  const filterKey = `${branche}|${mitAllgemein}|${format}|${monat}|${ziel}|${saeule}|${query}`;

  // ---- Liste: Seiten, zufällige Idee, Fokus ----
  const [paging, setPaging] = useState({ key: "", limit: PAGE_SIZE });
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const highlightId = highlight && highlight.key === filterKey ? highlight.id : null;
  const highlightIndex = highlightId ? results.findIndex((i) => i.id === highlightId) : -1;
  const limit = visibleLimit(paging.key === filterKey ? paging.limit : PAGE_SIZE, highlightIndex);
  const shown = results.slice(0, limit);
  const pending = useRef<PendingFocus | null>(null);

  // Scrollen und Fokus nur nach einer Aktion der Person (Zufall, Mehr anzeigen), nie beim ersten Zeigen der Seite.
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const el = document.getElementById(cardDomId(p.id));
    if (!el) return;
    const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView?.({ block: p.block, behavior: calm ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  });

  const pickRandom = () => {
    const pick = randomIdea(results, undefined, highlightId ?? undefined);
    if (!pick) return;
    pending.current = { id: pick.id, block: "center" };
    setHighlight({ id: pick.id, key: filterKey });
  };

  const showMore = () => {
    const next = results[limit];
    if (next) pending.current = { id: next.id, block: "nearest" };
    setPaging({ key: filterKey, limit: limit + PAGE_SIZE });
  };

  const clearFilters = () => {
    setTouched({ ...EMPTY_FILTER });
    setQuery("");
  };

  // ---- Merkliste ----
  const gemerkt = useMemo(() => merkIdeen(merk.ideen), [merk.ideen]);
  const merkIds = useMemo(() => new Set(gemerkt.map((i) => i.id)), [gemerkt]);
  const voll = merk.ideen.length >= MAX_MERK;
  const merkHeading = useRef<HTMLParagraphElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (id: string) => {
    if (!merkReady) return;
    setNotice(null);
    const next = toggleMerk(merk.ideen, id);
    setMerk({ v: 1, ideen: next });
    const count = merkIdeen(next).length;
    const nextState = stateAfterMerk(state, count);
    // Der Pfad-Fortschritt zählt das Werkzeug als erledigt, sobald die Merkliste einmal eine Idee hatte.
    if (nextState.output?.gemerkt !== state.output?.gemerkt) setState(nextState);
  };

  const remove = (id: string) => {
    toggle(id);
    merkHeading.current?.focus();
  };

  const clearAll = () => {
    setNotice(null);
    setMerk({ v: 1, ideen: [] });
    setConfirmClear(false);
    merkHeading.current?.focus();
  };

  // ---- Export: Datei, dann einmal ins CRM ----
  // Die Aktion läuft womöglich erst nach dem E-Mail-Fenster; sie liest darum den neuesten Stand.
  const firma = profile.firma?.trim() ?? "";
  const latest = useRef({ gemerkt, filter, query, firma });
  useEffect(() => {
    latest.current = { gemerkt, filter, query, firma };
  });
  const sentFor = useRef<string | null>(null);

  const exportAs = (kind: ExportKind) =>
    ctx.guardDownload(async () => {
      setError(null);
      setNotice(null);
      const { gemerkt: list, filter: f, query: q, firma: betrieb } = latest.current;
      if (list.length === 0) return;
      try {
        const name = exportBasename(betrieb);
        const now = new Date();
        if (kind === "csv") downloadBytes(new TextEncoder().encode(buildCsv(list)), `${name}.csv`, "text/csv;charset=utf-8");
        else downloadBytes(new TextEncoder().encode(buildIcs(list, now)), `${name}.ics`, "text/calendar;charset=utf-8");
      } catch {
        setError(DOWNLOAD_ERROR);
        return;
      }
      setNotice(`${EXPORT_LABELS[kind]} heruntergeladen.`);
      // Dieselbe Liste noch einmal zu laden, löst keinen zweiten CRM-Eintrag aus.
      const signature = `${kind}:${merkSignature(list)}`;
      if (sentFor.current === signature) return;
      sentFor.current = signature;
      void ctx.sendResult({ eingabe: eingabeText(f, q, list, kind), ausgabe: ausgabeText(list) });
    });

  const noMatch = results.length === 0;

  return (
    <div className="grid gap-8" aria-busy={!profileReady || !merkReady}>
      <div className="content">
        <Intro />
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-6">
          <form aria-label="Filter" className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2 md:p-5" onSubmit={(e) => e.preventDefault()}>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="ci-branche">Branche</Label>
              <select id="ci-branche" className={selectClass} value={branche} aria-describedby="ci-branche-help" onChange={(e) => change({ branche: e.target.value })}>
                <option value={ALLE}>Alle Branchen</option>
                <option value={UEBERGREIFEND}>Nur Ideen für alle Betriebe</option>
                {BRANCHEN.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
              <p id="ci-branche-help" className="text-sm text-muted-foreground">
                {fromProfile && profilBranche ? `Vorbelegt aus deinem Firmenprofil (Branche: ${profilBranche}).` : "Wähle deine Branche oder lass alle stehen."}
              </p>
              {specificBranche && (
                <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    id="ci-allgemein"
                    type="checkbox"
                    className="size-6 shrink-0 accent-ink"
                    checked={mitAllgemein}
                    onChange={(e) => change({ mitAllgemein: e.target.checked })}
                  />
                  Ideen für alle Betriebe mitzeigen
                </label>
              )}
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="ci-monat">Monat</Label>
              <select
                id="ci-monat"
                className={selectClass}
                value={String(monat)}
                aria-describedby="ci-monat-help"
                onChange={(e) => change({ monat: isMonatWert(Number(e.target.value)) ? Number(e.target.value) : "alle" })}
              >
                <option value="alle">Alle Monate</option>
                {MONAT_NAMEN.map((name, i) => (
                  <option key={name} value={String(i + 1)}>
                    {name}
                  </option>
                ))}
              </select>
              <p id="ci-monat-help" className="text-sm text-muted-foreground">
                Ideen für das ganze Jahr passen zu jedem Monat. Vorbelegt ist der laufende Monat.
              </p>
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="ci-format">Format</Label>
              <select id="ci-format" className={selectClass} value={format} onChange={(e) => change({ format: isFormat(e.target.value) ? e.target.value : "alle" })}>
                <option value="alle">Alle Formate</option>
                {FORMATE.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="ci-ziel">Ziel</Label>
              <select id="ci-ziel" className={selectClass} value={ziel} onChange={(e) => change({ ziel: isZiel(e.target.value) ? e.target.value : "alle" })}>
                <option value="alle">Alle Ziele</option>
                {ZIELE.map((z) => (
                  <option key={z} value={z}>
                    {ZIEL_LABELS[z]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="ci-saeule">Säule</Label>
              <select
                id="ci-saeule"
                className={selectClass}
                value={saeule}
                aria-describedby="ci-saeule-help"
                onChange={(e) => change({ saeule: isSaeule(e.target.value) ? e.target.value : "alle" })}
              >
                <option value="alle">Alle Säulen</option>
                {SAEULEN.map((s) => (
                  <option key={s} value={s}>
                    {SAEULE_LABELS[s]}
                  </option>
                ))}
              </select>
              <p id="ci-saeule-help" className="text-sm text-muted-foreground" data-testid="ci-saeulen-hint">
                {eigene.length > 0 ? `Deine Säulen: ${eigene.join(", ")}. ` : ""}
                Der Filter ordnet die Ideen in fünf feste Gruppen: Arbeit, Wissen, Team, Angebot, Region.
              </p>
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="ci-suche">Suchen</Label>
              <Input
                id="ci-suche"
                type="search"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="zum Beispiel Küche, Team, Winter"
                value={query}
                maxLength={80}
                aria-describedby="ci-suche-help"
                onChange={(e) => setQuery(e.target.value)}
              />
              <p id="ci-suche-help" className="text-sm text-muted-foreground">
                Sucht in Titel und Beschrieb. Jedes Wort muss vorkommen.
              </p>
            </div>

            <div className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Alle Filter aufheben
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" aria-live="polite" data-testid="ci-count" className="mono text-sm">
              {countText(results.length)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#ci-merkliste" className="text-sm underline underline-offset-4 lg:hidden">
                Zur Merkliste ({gemerkt.length})
              </a>
              <Button type="button" variant="outline" onClick={pickRandom} disabled={noMatch} data-testid="ci-random" data-umami-event="idea_random" data-umami-event-tool={config.slug}>
                Zufällige Idee
              </Button>
            </div>
          </div>

          {noMatch ? (
            <div className="rounded-xl border border-line bg-paper p-5" data-testid="ci-empty">
              <p>Keine Idee passt zu diesen Filtern. Hebe einen Filter auf oder such mit einem anderen Wort.</p>
              <div className="mt-3">
                <Button type="button" variant="outline" onClick={clearFilters}>
                  Alle Filter aufheben
                </Button>
              </div>
            </div>
          ) : (
            <ul aria-label="Ideen" className="grid gap-4">
              {shown.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  merkt={merkIds.has(idea.id)}
                  highlighted={idea.id === highlightId}
                  canMerk={merkReady && !voll}
                  showBranche={!specificBranche || idea.branche === ALLE}
                  onToggle={toggle}
                />
              ))}
            </ul>
          )}

          {results.length > shown.length && (
            <div className="grid justify-items-start gap-2">
              <p className="text-sm text-muted-foreground" data-testid="ci-shown">
                {shown.length} von {results.length} Ideen angezeigt.
              </p>
              <Button type="button" variant="outline" onClick={showMore} data-testid="ci-more">
                Mehr Ideen anzeigen
              </Button>
            </div>
          )}

          <p className="text-sm text-muted-foreground">{AUFWAND_HINWEIS}</p>
        </div>

        <section
          id="ci-merkliste"
          aria-labelledby="ci-merk-titel"
          data-testid="ci-merkliste"
          className="grid gap-4 rounded-xl border border-ink bg-paper p-5 lg:sticky lg:top-24"
        >
          <p id="ci-merk-titel" ref={merkHeading} tabIndex={-1} className="font-heading text-xl font-medium outline-none">
            Deine Merkliste
          </p>
          <p role="status" aria-live="polite" data-testid="ci-merk-count" className="mono text-sm">
            {gemerkt.length === 0 ? "Noch nichts gemerkt" : `${countText(gemerkt.length)} gemerkt`}
          </p>
          {gemerkt.length === 0 && <p className="text-sm text-muted-foreground">Tippe bei einer Idee auf «Merken». Die Liste bleibt in deinem Browser.</p>}
          {voll && <p className="text-sm text-muted-foreground">Die Merkliste ist voll. Entferne eine Idee, um eine neue zu merken.</p>}

          <ul aria-label="Gemerkte Ideen" className="grid gap-3">
            {gemerkt.map((idea) => (
              <li key={idea.id} className="grid gap-1 border-t border-line pt-3">
                <p id={merkDomId(idea.id)} className="font-medium">
                  {idea.titel}
                </p>
                <p className="text-sm text-muted-foreground">
                  {FORMAT_LABELS[idea.format]}, {monateLabel(idea.monate)}
                </p>
                <div>
                  <Button type="button" variant="link" className={LINK_BUTTON} aria-describedby={merkDomId(idea.id)} onClick={() => remove(idea.id)}>
                    Entfernen
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {gemerkt.length > 0 && (
            <div className="grid gap-3 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton text={() => merklisteMarkdown(gemerkt)} label="Merkliste kopieren" />
                {confirmClear ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">Alle Ideen entfernen?</span>
                    <Button type="button" variant="destructive" onClick={clearAll}>
                      Ja, leeren
                    </Button>
                    <Button type="button" variant="link" className={LINK_BUTTON} onClick={() => setConfirmClear(false)}>
                      Abbrechen
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="link" className={LINK_BUTTON} onClick={() => setConfirmClear(true)}>
                    Liste leeren
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button
                  type="button"
                  variant="outline"
                  className={WRAP_BUTTON}
                  onClick={() => exportAs("csv")}
                  data-testid="ci-csv"
                  data-umami-event="export_csv"
                  data-umami-event-tool={config.slug}
                >
                  CSV herunterladen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={WRAP_BUTTON}
                  onClick={() => exportAs("ics")}
                  data-testid="ci-ics"
                  data-umami-event="export_ics"
                  data-umami-event-tool={config.slug}
                >
                  Kalender-Entwurf (.ics) herunterladen
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Der Kalender-Entwurf legt je Idee einen Ganztagstermin an: am Ersten des nächsten passenden Monats, bei laufendem Monat heute. Verschiebe die Termine in
                deinem Kalender.
              </p>
              {!ctx.email && <p className="text-sm text-muted-foreground">Für Dateien brauchen wir deine E-Mail-Adresse. Die Merkliste kopieren kannst du immer.</p>}
            </div>
          )}
          <div>
            <p role="status" aria-live="polite" data-testid="ci-notice" className="text-sm">
              {notice}
            </p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <ContentIdeen />
    </ToolShell>
  );
}
