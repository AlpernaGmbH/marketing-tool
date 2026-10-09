"use client";

import { cn } from "cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dateCH } from "@/lib/ch";
import { readWebsite } from "@/lib/read-client";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  AKTION_KURZ,
  ART_LABEL,
  BEDINGUNGEN_NOTE,
  BESCHREIBUNG_HINWEIS,
  DATA,
  EMPTY_STATE,
  FELD_LABEL,
  FREI_ANDERES,
  KEINE_LISTE_NOTE,
  KEIN_ABRUF_NOTE,
  LIMITS,
  RICHTWERT_NOTE,
  SLUG,
  STATUS_OPTIONS,
  STUFE_LABEL,
  auswerten,
  clean,
  eingabeText,
  einheitBlocks,
  eintragFelder,
  eintragText,
  formatPhoneCH,
  fundOf,
  itemsFor,
  parseState,
  quellenzeile,
  reportMarkdown,
  statusOf,
  summaryText,
  toDocument,
  validate,
  type Aktion,
  type Aufgabe,
  type Ergebnis,
  type FieldKey,
  type Fund,
  type Item,
  type Problem,
  type Stamm,
  type Status,
  type VzInput,
  type VzState,
} from "./logic";
import config from "./tool.config";
import { kontaktAus, kontaktVorschlaege, type KontaktFeld, type KontaktVorschlag } from "./website";

function Intro() {
  return (
    <>
      <p>
        Gib deine Stammdaten an und markiere, in welchen Verzeichnissen du schon stehst. Du bekommst eine Aufgabenliste mit Eintragen, Prüfen und Angleichen,
        dazu deinen einheitlichen Eintrag zum Kopieren. Wo du den Eintrag dort einfügst, zeigt das Werkzeug Abweichungen zur Schreibweise.
      </p>
      <p>
        Das Werkzeug ruft keine Verzeichnisse ab und liest keine fremden Seiten. Auf Wunsch liest es deine eigene Startseite und schlägt Strasse, PLZ und
        Telefon vor; du bestätigst jeden Vorschlag. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei
        Fragen weiterhelfen können.
      </p>
    </>
  );
}

const chipClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";

const FIELD_IDS: Record<FieldKey, string> = {
  firma: "vz-firma",
  ort: "vz-ort",
  website: "vz-website",
  strasse: "vz-strasse",
  plz: "vz-plz",
  telefon: "vz-telefon",
  oeffnungszeiten: "vz-oeffnungszeiten",
  beschreibung: "vz-beschreibung",
};

// ---- Formular ----------------------------------------------------------------------------------

type GruppeProps = {
  item: Item;
  input: VzInput;
  disabled: boolean;
  onStatus: (id: string, s: Status) => void;
  onFund: (id: string, patch: Partial<Fund>) => void;
  onAnderesName: (name: string) => void;
};

function VerzeichnisGruppe({ item, input, disabled, onStatus, onFund, onAnderesName }: GruppeProps) {
  const status = statusOf(input, item.id);
  const fund = fundOf(input, item.id);
  const id = (f: string) => `vz-${item.id}-${f}`;
  const anderes = item.id === FREI_ANDERES;
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-xl border border-line p-4" disabled={disabled} data-testid="verzeichnis-gruppe" data-id={item.id}>
      <legend className="px-2 font-heading font-semibold">{item.anzeige}: Bist du schon eingetragen?</legend>
      {anderes && (
        <div className="grid gap-1.5 md:max-w-sm">
          <Label htmlFor="vz-frei-anderes-bezeichnung">Name des Verzeichnisses</Label>
          <Input
            id="vz-frei-anderes-bezeichnung"
            value={input.anderesName}
            maxLength={LIMITS.anderesName}
            onChange={(e) => onAnderesName(e.target.value)}
            aria-describedby="vz-frei-anderes-hilfe"
            autoComplete="off"
            lang="de-CH"
          />
          <p id="vz-frei-anderes-hilfe" className="text-sm text-muted-foreground">
            Freiwillig. Ohne Namen kommt das Verzeichnis nicht in die Liste.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {STATUS_OPTIONS.map((o) => (
          <label key={o.key} htmlFor={id(`status-${o.key}`)} className={chipClass}>
            <input
              id={id(`status-${o.key}`)}
              type="radio"
              name={id("status")}
              value={o.key}
              className="size-5 shrink-0 accent-ink"
              checked={status === o.key}
              onChange={() => onStatus(item.id, o.key)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {status === "ja" && (
        <details open className="rounded-xl border border-line p-3" data-testid="eintrag-dort">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Wie lautet der Eintrag dort?</summary>
          <p id={id("dort-hilfe")} className="text-sm text-muted-foreground">
            Freiwillig. Kopiere die Angaben aus dem Verzeichnis hierher, dann zeigt das Werkzeug Abweichungen.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor={id("name")}>
                Name<span className="sr-only"> im Eintrag bei {item.anzeige}</span>
              </Label>
              <Input id={id("name")} value={fund.name} maxLength={LIMITS.fundName} onChange={(e) => onFund(item.id, { name: e.target.value })} aria-describedby={id("dort-hilfe")} autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={id("adresse")}>
                Adresse<span className="sr-only"> im Eintrag bei {item.anzeige}</span>
              </Label>
              <Input
                id={id("adresse")}
                value={fund.adresse}
                maxLength={LIMITS.fundAdresse}
                placeholder="Strasse Nr, PLZ Ort"
                onChange={(e) => onFund(item.id, { adresse: e.target.value })}
                aria-describedby={id("dort-hilfe")}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={id("telefon")}>
                Telefon<span className="sr-only"> im Eintrag bei {item.anzeige}</span>
              </Label>
              <Input
                id={id("telefon")}
                type="tel"
                value={fund.telefon}
                maxLength={LIMITS.fundTelefon}
                onChange={(e) => onFund(item.id, { telefon: e.target.value })}
                aria-describedby={id("dort-hilfe")}
                autoComplete="off"
              />
            </div>
          </div>
        </details>
      )}
    </fieldset>
  );
}

// ---- Ergebnis ----------------------------------------------------------------------------------

const badgeBase = "inline-flex w-fit items-center rounded-full border px-3 py-0.5 text-sm font-medium";
const badgeClass: Record<Aktion, string> = {
  eintragen: `${badgeBase} border-ink bg-ink text-page`,
  suchen: `${badgeBase} border-ink`,
  pruefen: `${badgeBase} border-ink`,
  angleichen: `${badgeBase} border-ink bg-ink text-page`,
  ok: `${badgeBase} border-line text-muted-foreground`,
};

function Aussenlink({ href, label, context }: { href: string; label: string; context: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
      {label}
      <span className="sr-only">
        : {context} (öffnet in neuem Tab)
      </span>
    </a>
  );
}

function AufgabeKarte({ a }: { a: Aufgabe }) {
  const offen = a.aktion === "eintragen" || a.aktion === "suchen";
  return (
    <li className={cn("grid gap-3 rounded-xl border bg-paper p-4", a.aktion === "ok" ? "border-line" : "border-ink")} data-testid="aufgabe" data-status={a.aktion} data-id={a.id}>
      <p className="eyebrow">Aufgabe {a.nr}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-heading text-lg font-medium">{a.verzeichnis}</span>
        <span className={badgeClass[a.aktion]}>{AKTION_KURZ[a.aktion]}</span>
      </p>
      <p className="font-medium">{a.aufgabe}</p>
      {offen && <p>{a.hinweis}</p>}
      {a.aktion === "pruefen" && <p>Öffne deinen Eintrag und vergleiche ihn mit dem einheitlichen Eintrag.</p>}
      {a.aktion === "ok" && <p>Die eingefügten Angaben stimmen mit dem einheitlichen Eintrag überein.</p>}
      {offen && a.kosten && (
        <p className="text-sm">
          <span className="text-muted-foreground">Kosten: </span>
          {a.kosten}
        </p>
      )}
      {offen && a.bestaetigung && (
        <p className="text-sm">
          <span className="text-muted-foreground">Bestätigung: </span>
          {a.bestaetigung}
        </p>
      )}
      {a.abweichungen.length > 0 && (
        <ul aria-label={`Abweichungen bei ${a.verzeichnis}`} className="grid gap-2">
          {a.abweichungen.map((x, i) => (
            <li key={i} className="grid gap-1 rounded-lg bg-surface p-3 text-sm" data-testid="abweichung" data-art={x.art} data-stufe={x.stufe}>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{FELD_LABEL[x.feld]}</span>
                <span className="rounded-full border border-line px-2 py-0.5">{ART_LABEL[x.art]}</span>
                <span className="text-muted-foreground">{STUFE_LABEL[x.stufe]}</span>
              </p>
              <p className="break-words">
                <span className="text-muted-foreground">Dort: </span>
                {x.dort}
              </p>
              <p className="break-words">
                <span className="text-muted-foreground">Soll: </span>
                {x.soll}
              </p>
              <p>{x.text}</p>
            </li>
          ))}
        </ul>
      )}
      {(a.url || a.quelle) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {a.url && <Aussenlink href={a.url} label={offen ? "Zur Seite des Anbieters" : "Zum Verzeichnis"} context={a.verzeichnis} />}
          {a.quelle && offen && <Aussenlink href={a.quelle} label="Quelle der Angaben" context={`${a.verzeichnis}${a.geprueft ? `, geprüft am ${dateCH(a.geprueft)}` : ""}`} />}
        </p>
      )}
    </li>
  );
}

function ResultView({ e, headingRef, onEdit, onNew }: { e: Ergebnis; headingRef: React.Ref<HTMLHeadingElement>; onEdit: () => void; onNew: () => void }) {
  const doc = useMemo(() => toDocument(e), [e]);
  const felder = eintragFelder(e.eintrag);
  return (
    <ResultCard
      title="Deine Verzeichnis-Prüfung"
      headingRef={headingRef}
      actions={
        <>
          <DocumentExport model={doc} />
          <Button type="button" variant="outline" onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neu beginnen
          </Button>
        </>
      }
    >
      <p className="font-medium" data-testid="zusammenfassung">
        {summaryText(e)}
      </p>

      <DocView blocks={einheitBlocks(e.aufgaben)} />

      <section aria-labelledby="vz-eintrag" className="grid gap-3">
        <h4 id="vz-eintrag">Dein einheitlicher Eintrag</h4>
        <p className="text-sm text-muted-foreground">Schreib Name, Adresse und Telefon in jedem Verzeichnis genau so.</p>
        <dl className="grid gap-2" data-testid="kopiervorlage">
          {felder.map((f) => (
            <div key={f.key} className="grid gap-2 rounded-xl border border-line bg-paper p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words" data-testid={`feld-${f.key}`}>
                {f.value}
              </dd>
              <div>
                <CopyButton text={f.value} label={`${f.label} kopieren`} />
              </div>
            </div>
          ))}
        </dl>
        <div>
          <CopyButton text={() => eintragText(e.eintrag)} label="Ganzen Eintrag kopieren" />
        </div>
      </section>

      <section aria-labelledby="vz-aufgaben" className="grid gap-3">
        <h4 id="vz-aufgaben">Aufgabenliste</h4>
        <p className="text-sm text-muted-foreground">{RICHTWERT_NOTE}</p>
        <ol aria-label="Aufgaben nach Wichtigkeit" className="grid gap-3" data-testid="aufgabenliste">
          {e.aufgaben.map((a) => (
            <AufgabeKarte key={a.id} a={a} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="vz-hinweise" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 id="vz-hinweise" className="font-heading text-base font-semibold">
          Was geprüft ist und was nicht
        </h4>
        <ul className="grid list-disc gap-2 pl-5 text-sm text-muted-foreground">
          <li>{KEIN_ABRUF_NOTE}</li>
          <li data-testid="quellenzeile">{quellenzeile(e.quelle)}</li>
          <li>{BEDINGUNGEN_NOTE}</li>
        </ul>
      </section>
    </ResultCard>
  );
}

// ---- Angaben aus der eigenen Website ------------------------------------------------------------

type Lesen = { vorschlaege: (KontaktVorschlag & { vorhanden: boolean })[]; ortHinweis: string | null } | { vorschlaege: []; ortHinweis: null; leer: true };

/**
 * «Von meiner Website lesen»: liest die Startseite aus dem Firmenprofil und schlägt Strasse, PLZ und Telefon vor. Die Person wählt, was sie
 * übernimmt; Felder, die schon etwas enthalten, sind nicht vorgewählt. Es wird nichts gespeichert, was die Person nicht bestätigt.
 */
function WebsiteLesen({ stamm, input, disabled, onApply }: { stamm: Stamm; input: VzInput; disabled: boolean; onApply: (patch: Partial<VzInput>) => void }) {
  const ctx = useToolContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lesen, setLesen] = useState<Lesen | null>(null);
  const [chosen, setChosen] = useState<Set<KontaktFeld>>(new Set());
  const hasSite = stamm.website.trim() !== "";

  async function run() {
    setError(null);
    setLesen(null);
    if (!hasSite) return setError("Trag zuerst die Adresse deiner Website ein.");
    if (!(await ctx.ensureEmail())) return;
    setBusy(true);
    const stop = ctx.startLoading(["Website lesen", "Angaben suchen", "Angaben prüfen"]);
    try {
      let read = await readWebsite(stamm.website.trim());
      // Der Server kennt keine Adresse (Cookie fehlt): erst das Fenster, dann einmal wiederholen.
      if (!read.ok && read.reason === "gate") {
        if (!(await ctx.renewEmail())) return;
        read = await readWebsite(stamm.website.trim());
      }
      if (!read.ok) return setError(read.message);
      const kontakt = kontaktAus(read.page, stamm.ort);
      const vorschlaege = kontaktVorschlaege(kontakt, input);
      const ortAnders = kontakt.ort !== "" && stamm.ort.trim() !== "" && !kontakt.ort.toLowerCase().startsWith(stamm.ort.trim().toLowerCase());
      if (vorschlaege.length === 0 && !ortAnders) {
        return setLesen({ vorschlaege: [], ortHinweis: null, leer: true });
      }
      setLesen({ vorschlaege, ortHinweis: ortAnders ? `Auf der Website steht als Ort «${kontakt.ort}», in deinem Firmenprofil «${stamm.ort.trim()}». Prüfe, welcher stimmt.` : null });
      setChosen(new Set(vorschlaege.filter((v) => !v.vorhanden).map((v) => v.key)));
    } finally {
      stop();
      setBusy(false);
    }
  }

  function apply() {
    if (!lesen) return;
    const patch: Partial<VzInput> = {};
    for (const v of lesen.vorschlaege) if (chosen.has(v.key)) patch[v.key] = v.wert;
    onApply(patch);
    setLesen(null);
  }

  const toggle = (key: KontaktFeld) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="grid gap-3 md:col-span-2" data-testid="website-lesen">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => void run()}>
          {busy ? "Die Website wird gelesen …" : "Von meiner Website lesen"}
        </Button>
        <span className="text-sm text-muted-foreground">Schlägt Strasse, PLZ und Telefon vor. Dafür geht die Adresse deiner Website an unseren Server, nicht deine E-Mail-Adresse.</span>
      </div>
      {error && (
        <p role="alert" className="text-destructive" data-testid="website-fehler">
          {error}
        </p>
      )}
      {lesen && "leer" in lesen && (
        <p role="status" className="rounded-xl bg-surface p-4 text-sm" data-testid="website-leer">
          Auf der Startseite haben wir keine Adresse und keine Telefonnummer gefunden, die du noch nicht eingetragen hast. Oft stehen sie nur auf der Seite «Kontakt» oder im Impressum.
        </p>
      )}
      {lesen && !("leer" in lesen) && (
        <div className="grid gap-3 rounded-xl border border-line p-4" data-testid="website-vorschau">
          <h4 className="font-heading text-base font-semibold">Das steht auf deiner Startseite</h4>
          {lesen.ortHinweis && (
            <p role="note" className="rounded-lg bg-surface p-3 text-sm" data-testid="website-ort">
              {lesen.ortHinweis}
            </p>
          )}
          {lesen.vorschlaege.length > 0 ? (
            <>
              <ul className="grid gap-2">
                {lesen.vorschlaege.map((v) => (
                  <li key={v.key}>
                    <label className={chipClass}>
                      <input type="checkbox" className="size-5 accent-ink" checked={chosen.has(v.key)} onChange={() => toggle(v.key)} />
                      <span className="min-w-0 break-words">
                        {v.label}: <strong className="font-medium">{v.wert}</strong>
                        {v.vorhanden ? <span className="block text-sm text-muted-foreground">Bei dir steht schon eine Angabe. Sie wird ersetzt, wenn du dieses Feld wählst.</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={apply} disabled={chosen.size === 0}>
                  Übernehmen
                </Button>
                <Button type="button" variant="ghost" onClick={() => setLesen(null)}>
                  Verwerfen
                </Button>
              </div>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setLesen(null)} className="justify-self-start">
              Schliessen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Ablauf ------------------------------------------------------------------------------------

function VerzeichnisseFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson<VzState>(`mt:${SLUG}`, parseState);
  const verein = profile.organisationstyp === "verein";
  const stamm: Stamm = {
    firma: profile.firma ?? "",
    ort: profile.ort ?? "",
    website: profile.website ?? "",
    branche: profile.branche ?? "",
  };

  // Der Entwurf lebt im Formular; der Speicher folgt mit etwas Verzögerung, nicht bei jedem Tastendruck.
  const [draft, setDraft] = useState<VzInput | null>(null);
  const input = draft ?? saved.input;
  const [problems, setProblems] = useState<Problem[]>([]);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<"heading" | "form" | null>(null);

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => set({ v: 1, phase: "edit", input: draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "form") document.getElementById(FIELD_IDS.strasse)?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const ergebnis = useMemo(
    () => (saved.phase === "result" && saved.output ? auswerten(saved.output, saved.input, saved.output.datum) : null),
    [saved],
  );

  const change = (patch: Partial<VzInput>) => {
    setProblems([]);
    setDraft({ ...input, ...patch });
  };
  const items = itemsFor(stamm.branche, input.anderesName);
  const sichtbar = items.filter((i) => !i.unbenannt);
  const zaehl = {
    ja: sichtbar.filter((i) => statusOf(input, i.id) === "ja").length,
    nein: sichtbar.filter((i) => statusOf(input, i.id) === "nein").length,
    unklar: sichtbar.filter((i) => statusOf(input, i.id) === "unklar").length,
  };
  const phone = formatPhoneCH(input.telefon);

  async function start() {
    const found = validate(stamm, input, verein);
    if (found.length > 0) {
      setProblems(found);
      const own = found.find((p) => p.feld !== "firma" && p.feld !== "ort" && p.feld !== "website") ?? found[0];
      document.getElementById(FIELD_IDS[own.feld])?.focus();
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const datum = dateCH(new Date());
      const output = { firma: clean(stamm.firma), ort: clean(stamm.ort), website: stamm.website.trim(), branche: stamm.branche.trim(), datum };
      const e = auswerten(output, input, datum);
      if (!e) return;
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", input, output });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(output, input), ausgabe: reportMarkdown(e) });
    } finally {
      setBusy(false);
    }
  }

  if (ready && ergebnis) {
    return (
      <ResultView
        e={ergebnis}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "form";
          setProblems([]);
          setDraft(null);
          set({ v: 1, phase: "edit", input: saved.input });
        }}
        onNew={() => {
          shouldFocus.current = "form";
          setProblems([]);
          setDraft(null);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const off = !ready || !profileReady || busy;
  const invalid = (f: FieldKey) => problems.some((p) => p.feld === f);

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={busy || !ready}
      onSubmit={(ev) => {
        ev.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      {!DATA && (
        <p role="status" className="rounded-xl bg-surface p-4 text-sm" data-testid="keine-liste">
          {KEINE_LISTE_NOTE}
        </p>
      )}

      <fieldset className="grid min-w-0 gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={off}>
        <legend className="px-2 font-heading font-semibold">{verein ? "Dein Verein" : "Dein Betrieb"}</legend>
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="vz" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="vz" fields={["firma", "ort", "website"]} />
        <p className="text-sm text-muted-foreground md:col-span-2" data-testid="branche-hinweis">
          {verein ? "Verein" : "Firma"}, Ort und Website speichern wir in deinem Firmenprofil, in deinem Browser.{" "}
          {stamm.branche.trim()
            ? `Branche im Profil: ${stamm.branche.trim()}. Sie entscheidet nur, ob Tripadvisor in der Liste steht.`
            : "Im Profil steht keine Branche. Tripadvisor erscheint darum mit dem Zusatz «falls es zu deiner Branche passt»."}
        </p>

        <WebsiteLesen stamm={stamm} input={input} disabled={off} onApply={(patch) => change(patch)} />

        <div className="grid gap-1.5">
          <Label htmlFor={FIELD_IDS.strasse}>Strasse und Nummer</Label>
          <Input
            id={FIELD_IDS.strasse}
            value={input.strasse}
            maxLength={LIMITS.strasse.max}
            autoComplete="address-line1"
            placeholder="Wilerstrasse 24"
            onChange={(e) => change({ strasse: e.target.value })}
            aria-invalid={invalid("strasse")}
            aria-describedby="vz-fehler"
            lang="de-CH"
          />
        </div>
        <div className="grid gap-1.5 md:max-w-40">
          <Label htmlFor={FIELD_IDS.plz}>PLZ</Label>
          <Input
            id={FIELD_IDS.plz}
            inputMode="numeric"
            value={input.plz}
            maxLength={4}
            autoComplete="postal-code"
            placeholder="9200"
            onChange={(e) => change({ plz: e.target.value })}
            aria-invalid={invalid("plz")}
            aria-describedby="vz-fehler"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD_IDS.telefon}>Telefon</Label>
          <Input
            id={FIELD_IDS.telefon}
            type="tel"
            value={input.telefon}
            maxLength={30}
            autoComplete="tel"
            placeholder="071 123 45 67"
            onChange={(e) => change({ telefon: e.target.value })}
            aria-invalid={invalid("telefon")}
            aria-describedby="vz-telefon-hilfe vz-fehler"
          />
          <p id="vz-telefon-hilfe" className="text-sm text-muted-foreground" data-testid="telefon-hilfe">
            {phone ? `Wird so geschrieben: ${phone.international} oder ${phone.national}.` : "Eine Schweizer Nummer, zum Beispiel 071 123 45 67."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD_IDS.oeffnungszeiten}>Öffnungszeiten</Label>
          <Input
            id={FIELD_IDS.oeffnungszeiten}
            value={input.oeffnungszeiten}
            maxLength={LIMITS.oeffnungszeiten}
            placeholder="Mo bis Fr 7.30 bis 17.00 Uhr"
            onChange={(e) => change({ oeffnungszeiten: e.target.value })}
            aria-describedby="vz-oeffnungszeiten-hilfe"
            lang="de-CH"
          />
          <p id="vz-oeffnungszeiten-hilfe" className="mono text-sm text-muted-foreground">
            Freiwillig. {input.oeffnungszeiten.length} von {LIMITS.oeffnungszeiten} Zeichen
          </p>
        </div>
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor={FIELD_IDS.beschreibung}>Kurzbeschreibung</Label>
          <Textarea
            id={FIELD_IDS.beschreibung}
            rows={3}
            value={input.beschreibung}
            maxLength={LIMITS.beschreibung}
            onChange={(e) => change({ beschreibung: e.target.value })}
            aria-describedby="vz-beschreibung-hilfe"
            lang="de-CH"
          />
          <p id="vz-beschreibung-hilfe" className="text-sm text-muted-foreground">
            Freiwillig. {BESCHREIBUNG_HINWEIS} <span className="mono">{input.beschreibung.length} von {LIMITS.beschreibung} Zeichen</span>
          </p>
        </div>
      </fieldset>

      <section aria-labelledby="vz-wo" className="grid gap-4">
        <h3 id="vz-wo" className="font-heading text-xl font-medium">
          Wo stehst du schon?
        </h3>
        <p className="text-sm text-muted-foreground">
          Die Reihenfolge ist ein Richtwert von Alperna, keine Statistik. «Weiss ich nicht» setzt eine Suche auf die Liste.
        </p>
        {items.map((item) => (
          <VerzeichnisGruppe
            key={item.id}
            item={item}
            input={input}
            disabled={off}
            onStatus={(id, s) => change({ status: { ...input.status, [id]: s } })}
            onFund={(id, patch) => change({ funde: { ...input.funde, [id]: { ...fundOf(input, id), ...patch } } })}
            onAnderesName={(name) => change({ anderesName: name })}
          />
        ))}
      </section>

      <p role="status" aria-live="polite" className="mono text-sm text-muted-foreground" data-testid="fortschritt">
        {sichtbar.length} Verzeichnisse in der Liste. Eingetragen: {zaehl.ja}, nicht eingetragen: {zaehl.nein}, offen: {zaehl.unklar}.
      </p>

      <div id="vz-fehler" role="alert" className="min-h-6 text-destructive" data-testid="fehler">
        {problems.length > 0 && (
          <ul className="grid list-disc gap-1 pl-5">
            {problems.map((p) => (
              <li key={p.feld}>{p.text}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={off}>
          Verzeichnisse prüfen
        </Button>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <VerzeichnisseFlow />
    </ToolShell>
  );
}
