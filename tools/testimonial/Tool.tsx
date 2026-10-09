"use client";

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
import { numberCH } from "@/lib/ch";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  ANREDEN,
  EMPTY_ANFRAGE,
  EMPTY_REFERENZ,
  EMPTY_STATE,
  FIELD,
  FOLD_NOTE,
  FRAGEN,
  FREIGABEN,
  KANAELE,
  LIMITS,
  MODI,
  MODUS_LEGENDE,
  NENNUNGEN,
  PRUEF_SCHLUSS,
  STORAGE_KEY,
  anredeFromProfile,
  ausgabeAnfrage,
  ausgabeReferenz,
  beitragZaehler,
  brauchtName,
  brauchtOrtFirma,
  buildAnfrage,
  buildReferenz,
  charCount,
  cleanZitat,
  eingabeAnfrage,
  eingabeReferenz,
  fallstudieBildschirm,
  frageId,
  kanalLabel,
  leitfadenText,
  normalizeFragen,
  parseState,
  resolveAnrede,
  tidy,
  validateAnfrage,
  validateReferenz,
  zitatAuswahl,
  type Anfrage,
  type AnfrageErgebnis,
  type Anrede,
  type FrageId,
  type Kanal,
  type Modus,
  type Nennung,
  type Problem,
  type Referenz,
  type ReferenzErgebnis,
  type Typ,
} from "./logic";
import config from "./tool.config";

const choice =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input px-4 py-3 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";

function Intro() {
  return (
    <>
      <p>
        Zwei Wege in einem Werkzeug: Du bittest Kundschaft um ein Zitat, oder du baust aus einem Zitat, das du schon hast, Kachel, Kurz-Referenz, Beitrag und
        Fallstudie. Das Werkzeug erfindet nichts. Das Zitat bleibt wörtlich, gekürzt wird nur durch die Auswahl ganzer Sätze, und Zahlen stammen nur aus
        deinen Angaben. Eine KI ist nicht im Spiel.
      </p>
      <p>
        Alles entsteht in deinem Browser. Dein Ergebnis geht zusammen mit deinen Angaben und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können. Bei der Bitte um ein Zitat geht der Vorname der Person nicht mit. Bei der Referenz gehen das Zitat und der Name mit, den du im
        Ergebnis zeigst. Dein Zwischenstand bleibt in deinem Browser.
      </p>
    </>
  );
}

type Option<T extends string> = { value: T; label: string };

/** Radiogruppe mit Legende. Der Name des Radios ist die Beschriftung. */
function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  intro,
  compact = false,
  disabled = false,
}: {
  legend: string;
  name: string;
  options: readonly Option<T>[];
  value: T | "";
  onChange: (value: T) => void;
  intro?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset role="radiogroup" className="grid gap-2" disabled={disabled}>
      <legend className="mb-1 font-heading font-semibold">{legend}</legend>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      <div className={compact ? "flex flex-wrap gap-2" : "grid gap-2"}>
        {options.map((o) => (
          <label key={o.value} className={choice}>
            <input
              type="radio"
              name={name}
              id={`${name}-${o.value}`}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              aria-label={o.label}
              className="mt-0.5 size-5 shrink-0 accent-ink"
            />
            <span className="min-w-0">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Check({ id, checked, onChange, children, invalid }: { id: string; checked: boolean; onChange: () => void; children: React.ReactNode; invalid?: boolean }) {
  return (
    <label htmlFor={id} className={choice}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-invalid={invalid || undefined}
        className="mt-0.5 size-5 shrink-0 accent-ink"
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </label>
  );
}

function Count({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="mono text-sm text-muted-foreground">
      {text}
    </p>
  );
}

// ---- Ergebnis Weg 1 --------------------------------------------------------------------------------

function AnfrageResult({
  res,
  headingRef,
  onEdit,
  onNew,
}: {
  res: AnfrageErgebnis;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  return (
    <ResultCard
      title="Deine Nachricht"
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
      <p className="text-sm text-muted-foreground" data-testid="tb-anfrage-kopf">
        Weg: {kanalLabel(res.kanal)}. Anrede: {res.anrede === "du" ? "Du" : "Sie"}. Du kannst jeden Text ändern, bevor du ihn verschickst.
      </p>

      {res.leitfaden ? (
        <section aria-label="Gesprächsleitfaden" data-testid="tb-leitfaden" className="grid gap-3 rounded-xl border border-line bg-paper p-4">
          <h4 className="font-heading font-medium">Gesprächsleitfaden</h4>
          <p lang="de-CH" data-testid="tb-leitfaden-einstieg">
            {res.leitfaden.einstieg}
          </p>
          <ol aria-label="Leitfragen im Gespräch" className="grid list-decimal gap-1.5 pl-5">
            {res.leitfaden.fragen.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
          <p lang="de-CH" data-testid="tb-leitfaden-schluss">
            {res.leitfaden.schluss}
          </p>
          <div>
            <CopyButton text={leitfadenText(res.leitfaden)} label="Leitfaden kopieren" />
          </div>
        </section>
      ) : (
        <ul aria-label="Fassungen der Nachricht" className="grid gap-3">
          {res.fassungen.map((f) => (
            <li key={f.id} className="grid gap-2 rounded-xl border border-line bg-paper p-4" data-testid={`tb-fassung-${f.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{f.label}</span>
                <span className="mono text-sm text-muted-foreground" data-testid={`tb-fassung-${f.id}-zeichen`}>
                  {numberCH(f.zeichen, 0)} Zeichen
                </span>
              </div>
              {f.passend && <p className="eyebrow">Passt zu deinem Weg</p>}
              <p lang="de-CH" className="whitespace-pre-wrap break-words text-sm" data-testid={`tb-fassung-${f.id}-text`}>
                {f.text}
              </p>
              <div>
                <CopyButton text={f.text} label={f.copyLabel} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section aria-label="Hinweise" className="grid gap-2">
        <h4 className="font-heading font-medium">Hinweise</h4>
        <ul aria-label="Hinweise zur Nachricht" className="grid list-disc gap-1.5 pl-5 text-sm">
          {res.hinweise.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Nachfassen" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 className="font-heading font-medium">Nachfassen nach etwa einer Woche</h4>
        <p lang="de-CH" className="text-sm" data-testid="tb-nachfass">
          {res.nachfass}
        </p>
        <div>
          <CopyButton text={res.nachfass} label="Nachfass-Satz kopieren" />
        </div>
      </section>
    </ResultCard>
  );
}

// ---- Ergebnis Weg 2 --------------------------------------------------------------------------------

function ReferenzResult({
  res,
  headingRef,
  onEdit,
  onNew,
}: {
  res: ReferenzErgebnis;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  return (
    <ResultCard
      title="Deine Referenz"
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
      <section aria-label="Zitat-Kachel" className="grid gap-3">
        <h4 className="font-heading font-medium">Zitat-Kachel für die Website</h4>
        <figure className="grid gap-2 rounded-xl border border-ink bg-paper p-5" data-testid="tb-kachel">
          <blockquote lang="de-CH" className="font-heading text-lg [overflow-wrap:anywhere]" data-testid="tb-kachel-zitat">
            {res.kachel.zitat}
          </blockquote>
          <figcaption className="mono text-sm" data-testid="tb-kachel-quelle">
            {res.kachel.quelle}
          </figcaption>
        </figure>
        <div>
          <CopyButton text={res.kachel.text} label="Kachel kopieren" />
        </div>
      </section>

      <section aria-label="Kurz-Referenz" className="grid gap-3">
        <h4 className="font-heading font-medium">Kurz-Referenz</h4>
        <p lang="de-CH" data-testid="tb-kurz">
          {res.kurz.join(" ")}
        </p>
        <div>
          <CopyButton text={res.kurz.join(" ")} label="Kurz-Referenz kopieren" />
        </div>
      </section>

      <section aria-label="Beitrag für LinkedIn und Instagram" className="grid gap-3">
        <h4 className="font-heading font-medium">Beitrag für LinkedIn und Instagram</h4>
        {(
          [
            ["linkedin", "LinkedIn", res.linkedin],
            ["instagram", "Instagram", res.instagram],
          ] as const
        ).map(([id, label, text]) => (
          <div key={id} className="grid gap-2 rounded-xl border border-line bg-paper p-4" data-testid={`tb-${id}`}>
            <p className="eyebrow">{label}</p>
            <p lang="de-CH" className="whitespace-pre-wrap [overflow-wrap:anywhere]" data-testid={`tb-${id}-text`}>
              {text}
            </p>
            <p className="mono text-sm" data-testid={`tb-${id}-zaehler`}>
              {beitragZaehler(id, text)}
            </p>
            <div>
              <CopyButton text={text} label={`${label}-Text kopieren`} />
            </div>
          </div>
        ))}
        <p className="text-sm text-muted-foreground">{FOLD_NOTE} Hashtags setzt du selbst.</p>
      </section>

      <section aria-label="Fallstudie" className="grid gap-3">
        <h4 className="font-heading font-medium">Fallstudie</h4>
        <div className="grid gap-3 rounded-xl border border-line bg-paper p-4" data-testid="tb-fallstudie">
          <p lang="de-CH" className="font-heading text-lg font-medium" data-testid="tb-fallstudie-titel">
            {res.dokument.title}
          </p>
          <DocView blocks={fallstudieBildschirm(res.dokument)} baseLevel={5} />
        </div>
        <DocumentExport model={res.dokument} />
      </section>

      <section aria-label="Prüfliste vor der Veröffentlichung" className="grid gap-2">
        <h4 className="font-heading font-medium">Prüfliste vor der Veröffentlichung</h4>
        <ul aria-label="Prüfliste" className="grid list-disc gap-1.5 pl-5 text-sm" data-testid="tb-pruefliste">
          {res.pruefliste.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{PRUEF_SCHLUSS}</p>
      </section>

      {res.hinweise.length > 0 && (
        <section aria-label="Hinweise" className="grid gap-2">
          <h4 className="font-heading font-medium">Hinweise</h4>
          <ul aria-label="Hinweise zu deinen Texten" className="grid list-disc gap-1.5 pl-5 text-sm" data-testid="tb-hinweise">
            {res.hinweise.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>
      )}
    </ResultCard>
  );
}

// ---- Eingaben Weg 1 --------------------------------------------------------------------------------

function AnfrageFields({
  value,
  anrede,
  typ,
  invalid,
  disabled,
  onChange,
}: {
  value: Anfrage;
  anrede: Anrede;
  typ: Typ;
  invalid: Set<string>;
  disabled: boolean;
  onChange: (patch: Partial<Anfrage>) => void;
}) {
  const gewaehlt = normalizeFragen(value.fragen);
  const toggle = (id: FrageId) => onChange({ fragen: normalizeFragen(gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : [...gewaehlt, id]) });
  const beispiel = typ === "verein" ? "das Jugendturnier in Trogen" : "den Anstrich der Fassade in Gossau";
  return (
    <>
      <RadioGroup<Anrede>
        legend="Wie sprichst du die Person an?"
        name="tb-anrede"
        options={ANREDEN}
        value={anrede}
        onChange={(a) => onChange({ anrede: a })}
        compact
        disabled={disabled}
      />
      <RadioGroup<Kanal>
        legend="Wie erreichst du sie?"
        name="tb-kanal"
        intro="Du bekommst drei Fassungen für Nachrichten. Bei «Im Gespräch» bekommst du stattdessen einen Gesprächsleitfaden."
        options={KANAELE}
        value={value.kanal}
        onChange={(k) => onChange({ kanal: k })}
        compact
        disabled={disabled}
      />

      <fieldset className="grid gap-5" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Die Person</legend>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD.vorname}>Vorname der Person</Label>
          <Input
            id={FIELD.vorname}
            autoComplete="off"
            maxLength={LIMITS.vorname.max}
            value={value.vorname}
            onChange={(e) => onChange({ vorname: e.target.value })}
            aria-describedby="tb-vorname-hint"
            aria-invalid={invalid.has(FIELD.vorname) || undefined}
          />
          <p id="tb-vorname-hint" className="text-sm text-muted-foreground">
            Bei «Sie» darf auch «Frau Keller» stehen. Der Vorname bleibt in deinem Browser und geht nicht ans CRM.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD.leistung}>Was habt ihr zusammen gemacht?</Label>
          <Input
            id={FIELD.leistung}
            maxLength={LIMITS.leistung.max}
            value={value.leistung}
            placeholder={beispiel}
            onChange={(e) => onChange({ leistung: e.target.value })}
            aria-describedby="tb-leistung-hint"
            aria-invalid={invalid.has(FIELD.leistung) || undefined}
            lang="de-CH"
          />
          <p id="tb-leistung-hint" className="text-sm text-muted-foreground">
            In der Nachricht steht «Danke für …». Schreib es so, dass der Satz stimmt, zum Beispiel «{beispiel}», und ohne Namen der Person.
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-2" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Leitfragen</legend>
        <p className="text-sm text-muted-foreground">
          Wähle zwei oder drei. Gute Fragen lassen sich mit zwei Sätzen beantworten. In der Nachricht stehen sie in der Anrede, die du gewählt hast.
        </p>
        {FRAGEN.map((f) => (
          <Check key={f.id} id={frageId(f.id)} checked={gewaehlt.includes(f.id)} onChange={() => toggle(f.id)} invalid={invalid.has(FIELD.fragen)}>
            {f.du}
          </Check>
        ))}
        <p role="status" aria-live="polite" className="mono text-sm" data-testid="tb-fragen-zaehler">
          Gewählt: {gewaehlt.length}. Erlaubt sind zwei oder drei.
        </p>
      </fieldset>

      <RadioGroup<Nennung>
        legend="Freigabe"
        name="tb-freigabe"
        intro="Wie darf das Zitat erscheinen? Das fragst du die Person in der Nachricht."
        options={FREIGABEN}
        value={value.freigabe}
        onChange={(n) => onChange({ freigabe: n })}
        disabled={disabled}
      />
    </>
  );
}

// ---- Eingaben Weg 2 --------------------------------------------------------------------------------

function ReferenzFields({
  value,
  typ,
  invalid,
  disabled,
  onChange,
}: {
  value: Referenz;
  typ: Typ;
  invalid: Set<string>;
  disabled: boolean;
  onChange: (patch: Partial<Referenz>) => void;
}) {
  const auswahl = zitatAuswahl(value.zitat, value.ohne);
  const toggle = (satz: string) => onChange({ ohne: value.ohne.includes(satz) ? value.ohne.filter((x) => x !== satz) : [...value.ohne, satz] });
  const nZitat = charCount(cleanZitat(value.zitat));
  const count = (text: string, min: number, max: number, optional = false) =>
    `${numberCH(charCount(tidy(text)), 0)} Zeichen (${optional ? "leer oder " : ""}${min} bis ${max})`;
  const nameHint =
    value.nennung === "vorname-ort" ? "Nur der Vorname, zum Beispiel «Regula»." : "Vor- und Nachname, zum Beispiel «Regula Meier».";
  const ortHint = value.nennung === "vorname-ort" ? "Der Ort, zum Beispiel «Gossau»." : "Die Firma der Person.";
  return (
    <>
      <fieldset className="grid gap-5" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Das Zitat</legend>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD.zitat}>Zitat der Kundschaft</Label>
          <Textarea
            id={FIELD.zitat}
            rows={4}
            maxLength={LIMITS.zitat.max}
            value={value.zitat}
            onChange={(e) => onChange({ zitat: e.target.value })}
            aria-describedby="tb-zitat-hint tb-zitat-count"
            aria-invalid={invalid.has(FIELD.zitat) || undefined}
            lang="de-CH"
          />
          <p id="tb-zitat-hint" className="text-sm text-muted-foreground">
            Füge das Zitat wörtlich ein, so wie die Person es geschrieben oder gesagt hat. Das Werkzeug ändert keine Wörter.
          </p>
          <Count id="tb-zitat-count" text={`${numberCH(nZitat, 0)} Zeichen (${LIMITS.zitat.min} bis ${LIMITS.zitat.max})`} />
        </div>

        {auswahl.saetze.length > 0 ? (
          <fieldset className="grid gap-2" disabled={disabled}>
            <legend className="mb-1 font-medium">Diese Sätze in der Kachel zeigen</legend>
            <p className="text-sm text-muted-foreground">
              Abgewählte Sätze fehlen in der Kachel. Zwischen zwei gezeigten Sätzen, die nicht nebeneinander stehen, setzt das Werkzeug «[…]».
            </p>
            {auswahl.saetze.map((s, i) => (
              <Check key={`${i}-${s}`} id={`tb-satz-${i}`} checked={auswahl.gewaehlt[i]} onChange={() => toggle(s)} invalid={invalid.has(FIELD.saetze)}>
                {s}
              </Check>
            ))}
            <p role="status" aria-live="polite" className="mono text-sm" data-testid="tb-saetze-zaehler">
              {auswahl.gezeigt} von {auswahl.saetze.length} {auswahl.saetze.length === 1 ? "Satz" : "Sätzen"} gewählt
            </p>
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="tb-saetze-leer">
            Sobald du das Zitat eingefügt hast, erscheinen hier seine Sätze zur Auswahl.
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-5" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Die Person</legend>
        <RadioGroup<Nennung>
          legend="Wie soll die Person genannt werden?"
          name="tb-nennung"
          options={NENNUNGEN}
          value={value.nennung}
          onChange={(n) => onChange({ nennung: n })}
          disabled={disabled}
        />
        {brauchtName(value.nennung) && (
          <div className="grid gap-1.5">
            <Label htmlFor={FIELD.name}>Name</Label>
            <Input
              id={FIELD.name}
              autoComplete="off"
              maxLength={LIMITS.name.max}
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
              aria-describedby="tb-name-hint"
              aria-invalid={invalid.has(FIELD.name) || undefined}
            />
            <p id="tb-name-hint" className="text-sm text-muted-foreground">
              {nameHint}
            </p>
          </div>
        )}
        {brauchtOrtFirma(value.nennung) && (
          <div className="grid gap-1.5">
            <Label htmlFor={FIELD.ortFirma}>Ort oder Firma</Label>
            <Input
              id={FIELD.ortFirma}
              autoComplete="off"
              maxLength={LIMITS.ortFirma.max}
              value={value.ortFirma}
              onChange={(e) => onChange({ ortFirma: e.target.value })}
              aria-describedby="tb-ortfirma-hint"
              aria-invalid={invalid.has(FIELD.ortFirma) || undefined}
            />
            <p id="tb-ortfirma-hint" className="text-sm text-muted-foreground">
              {ortHint}
            </p>
          </div>
        )}
        {brauchtName(value.nennung) && (
          <div className="grid gap-1.5">
            <Label htmlFor={FIELD.funktion}>Funktion (freiwillig)</Label>
            <Input
              id={FIELD.funktion}
              autoComplete="off"
              maxLength={LIMITS.funktion.max}
              value={value.funktion}
              onChange={(e) => onChange({ funktion: e.target.value })}
              aria-describedby="tb-funktion-hint"
              aria-invalid={invalid.has(FIELD.funktion) || undefined}
            />
            <p id="tb-funktion-hint" className="text-sm text-muted-foreground">
              Zum Beispiel «Hauseigentümerin». Sie steht nach dem Namen.
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-5" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Die Zusammenarbeit</legend>
        <p className="text-sm text-muted-foreground">
          Schreib in deinen eigenen Worten. Die Kurz-Referenz übernimmt je Angabe den ersten Satz und ändert nur Grossschreibung am Satzanfang und den
          Schlusspunkt.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD.gemacht}>Was habt ihr gemacht?</Label>
          <Input
            id={FIELD.gemacht}
            maxLength={LIMITS.gemacht.max}
            value={value.gemacht}
            placeholder={typ === "verein" ? "Jugendturnier auf dem Sportplatz in Trogen" : "Fassadenanstrich an einem Einfamilienhaus"}
            onChange={(e) => onChange({ gemacht: e.target.value })}
            aria-describedby="tb-gemacht-count"
            aria-invalid={invalid.has(FIELD.gemacht) || undefined}
            lang="de-CH"
          />
          <Count id="tb-gemacht-count" text={count(value.gemacht, LIMITS.gemacht.min, LIMITS.gemacht.max)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD.ausgangslage}>Ausgangslage</Label>
          <Textarea
            id={FIELD.ausgangslage}
            rows={3}
            maxLength={LIMITS.text.max}
            value={value.ausgangslage}
            placeholder={typ === "verein" ? "Der Platz war zu klein für alle Mannschaften." : "Die Fassade blätterte nach drei Wintern ab."}
            onChange={(e) => onChange({ ausgangslage: e.target.value })}
            aria-describedby="tb-ausgangslage-count"
            aria-invalid={invalid.has(FIELD.ausgangslage) || undefined}
            lang="de-CH"
          />
          <Count id="tb-ausgangslage-count" text={count(value.ausgangslage, LIMITS.text.min, LIMITS.text.max)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD.getan}>Was habt ihr getan?</Label>
          <Textarea
            id={FIELD.getan}
            rows={3}
            maxLength={LIMITS.text.max}
            value={value.getan}
            placeholder={typ === "verein" ? "Wir haben den Spielplan neu aufgeteilt." : "Wir haben erst die Feuchte im Putz gemessen und dann neu gestrichen."}
            onChange={(e) => onChange({ getan: e.target.value })}
            aria-describedby="tb-getan-count"
            aria-invalid={invalid.has(FIELD.getan) || undefined}
            lang="de-CH"
          />
          <Count id="tb-getan-count" text={count(value.getan, LIMITS.text.min, LIMITS.text.max)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={FIELD.ergebnis}>Ergebnis (freiwillig)</Label>
          <Textarea
            id={FIELD.ergebnis}
            rows={3}
            maxLength={LIMITS.text.max}
            value={value.ergebnis}
            onChange={(e) => onChange({ ergebnis: e.target.value })}
            aria-describedby="tb-ergebnis-hint tb-ergebnis-count"
            aria-invalid={invalid.has(FIELD.ergebnis) || undefined}
            lang="de-CH"
          />
          <p id="tb-ergebnis-hint" className="text-sm text-muted-foreground">
            Nur, was stimmt und sich belegen lässt. Ohne Ergebnis hat die Kurz-Referenz zwei Sätze.
          </p>
          <Count id="tb-ergebnis-count" text={count(value.ergebnis, LIMITS.text.min, LIMITS.text.max, true)} />
        </div>
      </fieldset>
    </>
  );
}

// ---- Ablauf ----------------------------------------------------------------------------------------

type Draft = { modus: Modus; anfrage: Anfrage; referenz: Referenz };

function TestimonialFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(STORAGE_KEY, parseState);

  // Die Angaben leben im Entwurf; der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<Draft | null>(null);
  const form: Draft = draft ?? { modus: saved.modus, anfrage: saved.anfrage, referenz: saved.referenz };
  const [problems, setProblems] = useState<Problem[]>([]);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<string | null>(null);

  const firma = (profile.firma ?? "").trim();
  const typ: Typ = profile.organisationstyp === "verein" ? "verein" : "kmu";
  const profilAnrede = anredeFromProfile(profile);
  const anrede = resolveAnrede(form.anfrage.anrede, profilAnrede);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    if (draft === null) return;
    const s = savedRef.current;
    if (draft.modus === s.modus && JSON.stringify(draft.anfrage) === JSON.stringify(s.anfrage) && JSON.stringify(draft.referenz) === JSON.stringify(s.referenz)) {
      return;
    }
    const timer = setTimeout(() => set({ ...savedRef.current, modus: draft.modus, anfrage: draft.anfrage, referenz: draft.referenz }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion der Person, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    const target = shouldFocus.current;
    shouldFocus.current = null;
    if (target === "heading") headingRef.current?.focus();
    else if (target?.startsWith("field:")) document.getElementById(target.slice(6))?.focus();
  }, [saved.phase]);

  const edit = (patch: Partial<Draft>) => {
    setDraft({ ...form, ...patch });
    setProblems([]);
  };
  const editAnfrage = (patch: Partial<Anfrage>) => edit({ anfrage: { ...form.anfrage, ...patch } });
  const editReferenz = (patch: Partial<Referenz>) => edit({ referenz: { ...form.referenz, ...patch } });

  async function create() {
    const basis = { firma, typ };
    const found = form.modus === "anfrage" ? validateAnfrage(form.anfrage, basis) : validateReferenz(form.referenz, basis);
    if (found.length > 0) {
      setProblems(found);
      document.getElementById(found[0].id)?.focus();
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      // Gespeichert wird, was die Person gesehen hat: die gewählte Anrede, nur Sätze, die es im Zitat noch gibt.
      const anfrage: Anfrage = { ...form.anfrage, anrede, fragen: normalizeFragen(form.anfrage.fragen) };
      const saetze = new Set(zitatAuswahl(form.referenz.zitat, []).saetze);
      const referenz: Referenz = { ...form.referenz, ohne: form.referenz.ohne.filter((s) => saetze.has(s)) };
      let eingabe: string;
      let ausgabe: string;
      if (form.modus === "anfrage") {
        const input = { ...anfrage, anrede, firma };
        eingabe = eingabeAnfrage(input);
        ausgabe = ausgabeAnfrage(input);
      } else {
        eingabe = eingabeReferenz(referenz);
        ausgabe = ausgabeReferenz({ ...referenz, firma });
      }
      shouldFocus.current = "heading";
      set({ v: 1, modus: form.modus, phase: "result", anfrage, referenz, output: { ausgabe } });
      setDraft(null);
      void ctx.sendResult({ eingabe, ausgabe });
    } finally {
      setBusy(false);
    }
  }

  const resultAnrede = resolveAnrede(saved.anfrage.anrede, profilAnrede);
  const anfrageRes = useMemo(
    () => (saved.phase === "result" && saved.modus === "anfrage" ? buildAnfrage({ ...saved.anfrage, anrede: resultAnrede, firma }) : null),
    [saved.phase, saved.modus, saved.anfrage, resultAnrede, firma],
  );
  const referenzRes = useMemo(
    () => (saved.phase === "result" && saved.modus === "referenz" ? buildReferenz({ ...saved.referenz, firma }) : null),
    [saved.phase, saved.modus, saved.referenz, firma],
  );

  if (ready && profileReady && saved.phase === "result" && (anfrageRes || referenzRes)) {
    const onEdit = () => {
      shouldFocus.current = `field:${saved.modus === "anfrage" ? FIELD.vorname : FIELD.zitat}`;
      setDraft(null);
      setProblems([]);
      set({ ...saved, phase: "edit" });
    };
    const onNew = () => {
      shouldFocus.current = `field:${saved.modus === "anfrage" ? FIELD.vorname : FIELD.zitat}`;
      setDraft(null);
      setProblems([]);
      set({
        ...EMPTY_STATE,
        modus: saved.modus,
        anfrage: saved.modus === "anfrage" ? EMPTY_ANFRAGE : saved.anfrage,
        referenz: saved.modus === "referenz" ? EMPTY_REFERENZ : saved.referenz,
      });
    };
    return anfrageRes ? (
      <AnfrageResult res={anfrageRes} headingRef={headingRef} onEdit={onEdit} onNew={onNew} />
    ) : (
      <ReferenzResult res={referenzRes!} headingRef={headingRef} onEdit={onEdit} onNew={onNew} />
    );
  }

  const disabled = !ready || !profileReady || busy;
  const invalid = new Set(problems.map((p) => p.id));

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={!ready || !profileReady}
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <RadioGroup<Modus>
        legend={MODUS_LEGENDE}
        name="tb-modus"
        options={MODI}
        value={form.modus}
        onChange={(m) => edit({ modus: m })}
        disabled={disabled}
      />

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:max-w-md" disabled={disabled}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="tb" fields={["organisationstyp", "firma"]} />
        <p className="text-sm text-muted-foreground">
          Die Angaben speichern wir in deinem Firmenprofil, in deinem Browser. Die Firma steht in der Unterschrift der Nachricht und im Kopf der Datei.
        </p>
      </fieldset>

      {form.modus === "anfrage" ? (
        <AnfrageFields value={form.anfrage} anrede={anrede} typ={typ} invalid={invalid} disabled={disabled} onChange={editAnfrage} />
      ) : (
        <ReferenzFields value={form.referenz} typ={typ} invalid={invalid} disabled={disabled} onChange={editReferenz} />
      )}

      <div id="tb-error" role="alert" className="min-h-6 text-destructive">
        {problems.length > 0 && (
          <ul aria-label="Das fehlt noch" className="grid gap-1">
            {problems.map((p) => (
              <li key={p.id + p.message}>{p.message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={disabled}>
          {form.modus === "anfrage" ? "Nachricht erstellen" : "Referenz bauen"}
        </Button>
        <span className="text-sm text-muted-foreground">Dauert etwa fünf Minuten.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <TestimonialFlow />
    </ToolShell>
  );
}
