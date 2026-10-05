"use client";

import { cn } from "cn";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  EMPTY_STATE,
  FAEHIGKEITEN,
  FIELD_IDS,
  GEBIET_KEYS,
  GEBIET_LABEL,
  GRENZE_NOTE,
  KANAELE,
  KANAL_KEYS,
  KUNDSCHAFT_KEYS,
  KUNDSCHAFT_LABEL,
  PAUSIEREN_TITEL,
  PFLICHTANGABEN,
  RICHTWERT_NOTE,
  ROLLEN,
  ROLLE_INTRO,
  ROLLE_LABEL,
  SLUG,
  SUCHE_KEYS,
  SUCHE_LABEL,
  ZEITEN,
  angaben,
  auswerten,
  ausgabeText,
  begriffe,
  eingabeText,
  faehigkeitLegende,
  gebietLegende,
  heuteLegende,
  heuteOf,
  kundschaftLegende,
  kurzergebnis,
  mitTyp,
  parseState,
  pausierenHinweis,
  pausierenZeile,
  profilePatch,
  rechnungFor,
  sucheLegende,
  toDocument,
  typOf,
  validate,
  zielLegende,
  zieleFor,
  zeitLabelText,
  type Auswertung,
  type FaehigkeitKey,
  type Input,
  type KanalErgebnis,
  type KanalKey,
  type Kontext,
  type Problem,
  type Rolle,
} from "./logic";
import config from "./tool.config";

const optionClass =
  "flex min-h-11 max-w-full cursor-pointer items-center gap-2.5 rounded-lg border border-input px-3 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";
const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro({ verein }: { verein: boolean }) {
  return (
    <>
      <p>
        Du beantwortest sieben Fragen zu {verein ? "deinem Verein" : "deinem Betrieb"} und bekommst eine Rangfolge der Kanäle: Basis, Fokus, Ergänzung oder vorerst
        nicht. Zu jedem Kanal gehören eine Begründung, ein erster Schritt und eine Reihenfolge für die nächsten drei Monate.
      </p>
      <p>
        Alles rechnet in deinem Browser, ohne KI. Gewichte, Schwellen und Regeln sind ein {RICHTWERT_NOTE}. {GRENZE_NOTE} Dein Ergebnis geht zusammen mit deinen
        Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können.
      </p>
    </>
  );
}

// ---- Formular ----------------------------------------------------------------------------------

function RadioGruppe<T extends string>({
  id,
  legend,
  options,
  value,
  invalid,
  disabled,
  onChange,
}: {
  id: string;
  legend: string;
  options: readonly { key: T; label: string }[];
  value: T | "";
  invalid: boolean;
  disabled: boolean;
  onChange: (key: T) => void;
}) {
  return (
    <fieldset id={id} tabIndex={-1} disabled={disabled} className={cn("grid min-w-0 gap-2 rounded-lg outline-none", invalid && "ring-2 ring-destructive/40")}>
      <legend className="mb-1 font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.key} htmlFor={`${id}-${o.key}`} className={optionClass}>
            <input
              id={`${id}-${o.key}`}
              type="radio"
              name={id}
              value={o.key}
              checked={value === o.key}
              onChange={() => onChange(o.key)}
              className="size-5 shrink-0 accent-ink"
            />
            <span className="min-w-0">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckGruppe<T extends string>({
  id,
  itemPrefix,
  legend,
  hilfe,
  options,
  value,
  disabled,
  columns,
  onToggle,
}: {
  id: string;
  itemPrefix: string;
  legend: string;
  hilfe: string;
  options: readonly { key: T; label: string }[];
  value: readonly T[];
  disabled: boolean;
  columns: string;
  onToggle: (key: T, on: boolean) => void;
}) {
  return (
    <fieldset id={id} tabIndex={-1} disabled={disabled} aria-describedby={`${id}-hilfe`} className="grid min-w-0 gap-2 rounded-lg outline-none">
      <legend className="mb-1 font-medium">{legend}</legend>
      <p id={`${id}-hilfe`} className="text-sm text-muted-foreground">
        {hilfe}
      </p>
      <div className={cn("grid gap-2", columns)}>
        {options.map((o) => (
          <label key={o.key} htmlFor={`${itemPrefix}-${o.key}`} className={optionClass}>
            <input
              id={`${itemPrefix}-${o.key}`}
              type="checkbox"
              checked={value.includes(o.key)}
              onChange={(e) => onToggle(o.key, e.target.checked)}
              className="size-5 shrink-0 accent-ink"
            />
            <span className="min-w-0">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---- Ergebnis ----------------------------------------------------------------------------------

const LISTEN_LABEL: Record<Rolle, string> = {
  basis: "Basis-Kanäle",
  fokus: "Fokus-Kanäle",
  ergaenzung: "Ergänzungs-Kanäle",
  vorerst: "Kanäle, die vorerst nicht dran sind",
};

const badgeBase = "inline-flex w-fit items-center rounded-full border px-3 py-0.5 text-sm font-medium";
const rolleBadge: Record<Rolle, string> = {
  basis: `${badgeBase} border-ink`,
  fokus: `${badgeBase} border-ink bg-ink text-page`,
  ergaenzung: `${badgeBase} border-ink`,
  vorerst: `${badgeBase} border-line text-muted-foreground`,
};

function Karte({ k }: { k: KanalErgebnis }) {
  return (
    <li
      className={cn("grid min-w-0 gap-3 break-words rounded-xl border bg-paper p-4", k.rolle === "fokus" ? "border-ink" : "border-line")}
      data-testid="kanal-karte"
      data-rolle={k.rolle}
      data-kanal={k.key}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <h5 className="font-heading text-base font-semibold">{k.label}</h5>
        <p className="flex flex-wrap gap-2">
          <span className={rolleBadge[k.rolle]} data-testid="kanal-rolle">
            {ROLLE_LABEL[k.rolle]}
          </span>
          {k.heuteAktiv && <span className="inline-flex w-fit items-center rounded-full bg-surface px-3 py-0.5 text-sm">Heute aktiv</span>}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">{k.beschreibung}</p>
      <div className="grid gap-1.5">
        <p className="text-sm text-muted-foreground">
          Passung: <span className="font-medium text-foreground" data-testid="kanal-passung">{k.passungText}</span>
        </p>
        <div
          role="meter"
          aria-label={`Passung ${k.label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={k.eignung}
          aria-valuetext={k.passungText}
          className="h-2 w-full overflow-hidden rounded-full bg-surface"
        >
          <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(k.eignung, 4)}%` }} />
        </div>
      </div>
      <p data-testid="kanal-begruendung">{k.begruendung}</p>
      {k.schritt && (
        <p data-testid="kanal-schritt">
          <span className="text-muted-foreground">Erster Schritt: </span>
          {k.schritt}
        </p>
      )}
      {k.links.length > 0 && (
        <p className="text-sm" data-testid="kanal-links">
          <span className="text-muted-foreground">Werkzeug dazu: </span>
          {k.links.map((l, j) => (
            <span key={l.slug}>
              {j > 0 && ", "}
              <Link href={`/tools/${l.slug}`} className="underline underline-offset-4">
                {l.name}
              </Link>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function RollenAbschnitt({ rolle, a }: { rolle: Rolle; a: Auswertung }) {
  const liste = a[rolle];
  if (liste.length === 0 && rolle !== "fokus") return null;
  const titelId = `ks-${rolle}-titel`;
  return (
    <section aria-labelledby={titelId} className="grid gap-3" data-testid={`ks-abschnitt-${rolle}`}>
      <h4 id={titelId} className="font-heading text-lg font-medium">
        {ROLLE_LABEL[rolle]}
      </h4>
      {liste.length === 0 ? (
        <p data-testid="ks-fokus-leer">{a.fokusLeer}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{ROLLE_INTRO[rolle]}</p>
          <ul aria-label={LISTEN_LABEL[rolle]} className="grid gap-3">
            {liste.map((k) => (
              <Karte key={k.key} k={k} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Ergebnis({
  a,
  kontext,
  headingRef,
  onEdit,
  onNew,
}: {
  a: Auswertung;
  kontext: Kontext;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  const doc = useMemo(() => toDocument(a, kontext), [a, kontext]);
  const b = begriffe(a.typ);

  return (
    <ResultCard
      title="Deine Kanalstrategie"
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
      <section aria-labelledby="ks-aussage-titel" className="grid gap-2 break-words rounded-xl border border-ink bg-surface p-4" data-testid="ks-empfehlung">
        <h4 id="ks-aussage-titel" className="font-heading text-lg font-medium">
          Das Ergebnis in Kürze
        </h4>
        <p className="font-medium" data-testid="ks-aussage">
          {a.aussage}
        </p>
        <p className="text-sm text-muted-foreground">
          {RICHTWERT_NOTE}. {GRENZE_NOTE}
        </p>
      </section>

      {ROLLEN.map((r) => (
        <RollenAbschnitt key={r} rolle={r} a={a} />
      ))}

      {a.pausieren.length > 0 && (
        <section aria-labelledby="ks-pausieren-titel" className="grid gap-3 rounded-xl border border-line p-4" data-testid="ks-pausieren">
          <h4 id="ks-pausieren-titel" className="font-heading text-lg font-medium">
            {PAUSIEREN_TITEL}
          </h4>
          <ul aria-label="Kanäle, die du heute bespielst und pausieren kannst" className="grid list-disc gap-1.5 pl-5">
            {a.pausieren.map((k) => (
              <li key={k.key} data-kanal={k.key}>
                {pausierenZeile(k)}
              </li>
            ))}
          </ul>
          <p>{pausierenHinweis(b)}</p>
        </section>
      )}

      <section aria-labelledby="ks-plan-titel" className="grid gap-3">
        <h4 id="ks-plan-titel" className="font-heading text-lg font-medium">
          Die nächsten drei Monate
        </h4>
        <ol aria-label="Plan für die nächsten drei Monate" className="grid gap-3 md:grid-cols-3" data-testid="ks-plan">
          {a.monate.map((m) => (
            <li key={m.nr} className="grid content-start gap-2 break-words rounded-xl border border-line bg-paper p-4" data-testid={`monat-${m.nr}`}>
              <p className="eyebrow">Monat {m.nr}</p>
              <h5 className="font-heading text-base font-semibold">{m.titel}</h5>
              <p>{m.text}</p>
              {m.punkte.length > 0 && (
                <ul className="grid list-disc gap-1.5 pl-5 text-sm">
                  {m.punkte.map((p) => (
                    <li key={p.kanal}>
                      <span className="font-medium">{p.kanal}:</span> {p.aufgabe}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ks-tabelle-titel" className="grid gap-3">
        <h4 id="ks-tabelle-titel" className="font-heading text-lg font-medium">
          Alle Kanäle im Überblick
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" data-testid="ks-tabelle">
            <caption className="sr-only">Alle Kanäle mit Rolle, Passung und Begründung</caption>
            <thead>
              <tr>
                {["Kanal", "Rolle", "Passung", "Begründung"].map((h) => (
                  <th key={h} scope="col" className="border-b border-ink py-2 pr-4 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.kanaele.map((k) => (
                <tr key={k.key} data-kanal={k.key}>
                  <th scope="row" className="border-b border-line py-2 pr-4 text-left align-top font-medium break-words">
                    {k.label}
                  </th>
                  <td className="border-b border-line py-2 pr-4 align-top">{ROLLE_LABEL[k.rolle]}</td>
                  <td className="border-b border-line py-2 pr-4 align-top">{k.passungText}</td>
                  <td className="min-w-48 border-b border-line py-2 pr-4 align-top">{k.begruendung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="ks-hinweise-titel" className="grid gap-2">
        <h4 id="ks-hinweise-titel" className="font-heading text-base font-semibold">
          Drei Hinweise
        </h4>
        <ol aria-label="Hinweise" className="grid list-decimal gap-1.5 pl-5">
          {a.hinweise.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ks-rechnung-titel" className="grid gap-2 rounded-xl bg-surface p-4" data-testid="ks-richtwert">
        <h4 id="ks-rechnung-titel" className="font-heading text-base font-semibold">
          So ist gerechnet
        </h4>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm">
          {rechnungFor(a.typ).map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          {RICHTWERT_NOTE}. {GRENZE_NOTE}
        </p>
      </section>
    </ResultCard>
  );
}

// ---- Ablauf ------------------------------------------------------------------------------------

function KanalFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusId = useRef<string | null>(null);
  const focusHeading = useRef(false);

  const loaded = ready && profileReady;
  const typ = typOf(profile.organisationstyp);
  const verein = typ === "verein";
  const firma = (profile.firma ?? "").trim();
  const branche = (profile.branche ?? "").trim();
  // Der Typ kommt immer aus dem Profil; passt das gewählte Ziel nicht mehr dazu, fällt es weg.
  const input = useMemo(() => mitTyp(saved.input, typ), [saved.input, typ]);
  // Solange die Person nichts angekreuzt hat, gelten die Kanäle aus dem Profil als Vorschlag.
  const heute = heuteOf(input, profile);
  const vorschlag = input.heute === null && heute.length > 0;
  const kontext = useMemo<Kontext>(() => ({ firma, branche }), [firma, branche]);
  const auswertung = useMemo(() => (saved.phase === "result" ? auswerten(saved.input) : null), [saved.phase, saved.input]);

  // Fokus nach einer Aktion des Besuchers (Meldung, Ergebnis, Ändern), nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (focusId.current) {
      document.getElementById(focusId.current)?.focus();
      focusId.current = null;
    }
    if (focusHeading.current && auswertung) {
      headingRef.current?.focus();
      focusHeading.current = false;
    }
  });

  const change = (patch: Partial<Input>) => {
    setProblem(null);
    set({ v: 1, phase: "edit", input: { ...input, ...patch } });
  };

  const toggleFaehigkeit = (key: FaehigkeitKey, on: boolean) =>
    change({ faehigkeiten: FAEHIGKEITEN.map((f) => f.key).filter((k) => (k === key ? on : input.faehigkeiten.includes(k))) });
  const toggleHeute = (key: KanalKey, on: boolean) => change({ heute: KANAL_KEYS.filter((k) => (k === key ? on : heute.includes(k))) });

  async function start() {
    const p = validate(firma, input);
    if (p) {
      focusId.current = p.fieldId;
      return setProblem(p);
    }
    // Die heutigen Kanäle werden festgehalten, damit das Ergebnis sich nicht ändert, wenn das Profil später Kanäle bekommt.
    const frozen: Input = { ...input, heute };
    const a = auswerten(frozen);
    if (!a) return;
    setProblem(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      focusHeading.current = true;
      set({ v: 1, phase: "result", input: frozen, output: kurzergebnis(a) });
      const patch = profilePatch(profile, a);
      if (Object.keys(patch).length > 0) update(patch);
      void ctx.sendResult({ eingabe: eingabeText(a.input, kontext), ausgabe: ausgabeText(a, kontext) });
    } finally {
      setBusy(false);
    }
  }

  if (loaded && saved.phase === "result" && auswertung) {
    return (
      <Ergebnis
        a={auswertung}
        kontext={kontext}
        headingRef={headingRef}
        onEdit={() => {
          focusId.current = FIELD_IDS.firma;
          setProblem(null);
          set({ v: 1, phase: "edit", input: saved.input });
        }}
        onNew={() => {
          focusId.current = FIELD_IDS.firma;
          setProblem(null);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const off = !loaded || busy;
  const fehler = problem?.fieldId;
  const kundschaftOptionen = KUNDSCHAFT_KEYS.map((key) => ({ key, label: KUNDSCHAFT_LABEL[typ][key] }));
  const sucheOptionen = SUCHE_KEYS.map((key) => ({ key, label: SUCHE_LABEL[key] }));
  const gebietOptionen = GEBIET_KEYS.map((key) => ({ key, label: GEBIET_LABEL[key] }));
  const heuteOptionen = KANAELE.map((k) => ({ key: k.key, label: k.label }));

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={busy || !loaded}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro verein={verein} />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">{verein ? "Dein Verein" : "Dein Betrieb"}</legend>
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="ks" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="ks" fields={["firma", "branche"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          {verein ? "Name und Tätigkeit des Vereins" : "Firma und Branche"} speichern wir in deinem Firmenprofil, in deinem Browser.
        </p>
      </fieldset>

      <RadioGruppe
        id={FIELD_IDS.ziel}
        legend={zielLegende}
        options={zieleFor(typ).map((z) => ({ key: z.key, label: z.label }))}
        value={input.ziel}
        invalid={fehler === FIELD_IDS.ziel}
        disabled={off}
        onChange={(ziel) => change({ ziel })}
      />
      <RadioGruppe
        id={FIELD_IDS.kundschaft}
        legend={kundschaftLegende}
        options={kundschaftOptionen}
        value={input.kundschaft}
        invalid={fehler === FIELD_IDS.kundschaft}
        disabled={off}
        onChange={(kundschaft) => change({ kundschaft })}
      />
      <RadioGruppe
        id={FIELD_IDS.suche}
        legend={sucheLegende}
        options={sucheOptionen}
        value={input.suche}
        invalid={fehler === FIELD_IDS.suche}
        disabled={off}
        onChange={(suche) => change({ suche })}
      />
      <RadioGruppe
        id={FIELD_IDS.gebiet}
        legend={gebietLegende}
        options={gebietOptionen}
        value={input.gebiet}
        invalid={fehler === FIELD_IDS.gebiet}
        disabled={off}
        onChange={(gebiet) => change({ gebiet })}
      />

      <div className="grid gap-1.5 md:max-w-sm">
        <Label htmlFor={FIELD_IDS.zeit}>{zeitLabelText}</Label>
        <select
          id={FIELD_IDS.zeit}
          className={cn(selectClass, fehler === FIELD_IDS.zeit && "border-destructive")}
          value={input.zeit === 0 ? "" : String(input.zeit)}
          disabled={off}
          aria-invalid={fehler === FIELD_IDS.zeit}
          aria-describedby="ks-zeit-hilfe"
          onChange={(e) => {
            const stufe = ZEITEN.find((z) => String(z.stufe) === e.target.value)?.stufe;
            change({ zeit: stufe ?? 0 });
          }}
        >
          <option value="">Bitte wählen</option>
          {ZEITEN.map((z) => (
            <option key={z.stufe} value={String(z.stufe)}>
              {z.label}
            </option>
          ))}
        </select>
        <p id="ks-zeit-hilfe" className="text-sm text-muted-foreground">
          Zähle nur die Zeit, die wirklich für Texte, Fotos, Antworten und Pflege bleibt.
        </p>
      </div>

      <CheckGruppe
        id={FIELD_IDS.faehigkeiten}
        itemPrefix="ks-faehigkeit"
        legend={faehigkeitLegende}
        hilfe="Freiwillig. Ohne Auswahl bleibt es bei den Basis-Kanälen."
        options={FAEHIGKEITEN}
        value={input.faehigkeiten}
        disabled={off}
        columns="sm:grid-cols-2 lg:grid-cols-4"
        onToggle={toggleFaehigkeit}
      />
      <CheckGruppe
        id={FIELD_IDS.heute}
        itemPrefix="ks-heute"
        legend={heuteLegende}
        hilfe={
          vorschlag
            ? "Freiwillig. Vorgewählt aus deinem Firmenprofil. Passe die Auswahl an."
            : "Freiwillig. Wähle die Kanäle, die ihr heute wirklich bespielt."
        }
        options={heuteOptionen}
        value={heute}
        disabled={off}
        columns="sm:grid-cols-2 lg:grid-cols-3"
        onToggle={toggleHeute}
      />

      <p role="status" aria-live="polite" className="mono text-sm text-muted-foreground" data-testid="ks-fortschritt">
        {angaben(firma, input)} von {PFLICHTANGABEN} Pflichtangaben gemacht
      </p>

      <p id="ks-error" role="alert" className="min-h-6 text-destructive">
        {problem?.message}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={off}>
          Kanäle bewerten
        </Button>
        <span className="text-sm text-muted-foreground">Dein Ergebnis erscheint nach der Angabe deiner E-Mail-Adresse.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <KanalFlow />
    </ToolShell>
  );
}
