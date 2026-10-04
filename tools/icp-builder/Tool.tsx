"use client";

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
import { LIMITS, icpGenerator, type IcpInput, type IcpOutput } from "./generator";
import {
  BEWERTUNG_HINWEIS,
  EMPTY_FORM,
  EMPTY_STATE,
  KI_HINWEIS,
  SLUG,
  bewerten,
  eingabeText,
  einzugsgebietVorschlag,
  formFrom,
  formProblem,
  parseState,
  profilePatch,
  punkteText,
  reportMarkdown,
  toDocument,
  toInput,
  type FormFields,
} from "./logic";
import config from "./tool.config";

function Intro() {
  return (
    <p>
      Beschreib in zwei Feldern, was du anbietest und wer heute deine besten Kunden sind. Eine KI macht daraus dein Idealkundenprofil: wer diese Kundschaft
      ist, wann sie kauft, was sie zögern lässt und woran du eine passende Anfrage erkennst. Dazu kommt eine Punktekarte mit sechs bis acht Kriterien, mit
      der du neue Anfragen in einer Minute einordnest.
    </p>
  );
}

/** Kasten «Anfrage bewerten»: Kreuze nur im Browser, nicht gespeichert. */
function Punktekarte({ output }: { output: IcpOutput }) {
  const [checks, setChecks] = useState<boolean[]>([]);
  const b = bewerten(output, checks);
  const toggle = (i: number, on: boolean) =>
    setChecks((prev) => {
      const next = output.punktekarte.map((_, j) => prev[j] === true);
      next[i] = on;
      return next;
    });

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-surface p-4" data-testid="anfrage-bewerten">
      <h4 className="font-heading font-medium">Anfrage bewerten</h4>
      <p className="text-sm text-muted-foreground">Kreuze an, was auf eine neue Anfrage zutrifft. Die Kreuze bleiben nur, solange die Seite offen ist.</p>
      <ul className="grid gap-2" aria-label="Kriterien der Punktekarte">
        {output.punktekarte.map((k, i) => (
          <li key={i} className="flex min-h-11 items-start gap-3 py-1">
            <Checkbox id={`icp-krit-${i}`} className="mt-1" checked={checks[i] === true} onCheckedChange={(v) => toggle(i, v === true)} />
            <label htmlFor={`icp-krit-${i}`} className="cursor-pointer">
              {k.kriterium} <span className="mono text-xs text-muted-foreground">({punkteText(k.punkte)})</span>
            </label>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="font-medium" data-testid="bewertung">
        {b.punkte} von {b.max} Punkten ({b.prozent} %): {b.text}
      </p>
      <p className="text-sm text-muted-foreground">{BEWERTUNG_HINWEIS}</p>
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setChecks([])} disabled={!checks.some(Boolean)}>
          Kreuze löschen
        </Button>
      </div>
    </div>
  );
}

function IcpFlow() {
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<IcpInput | null>(null);
  const gen = useGenerator(icpGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => reportMarkdown(o, inputRef.current ?? { betrieb: "", branche: "", einzugsgebiet: "" }),
  });

  // Änderungen am Formular leben im Entwurf, bis der Entwurf gespeichert wird; vorher gilt der gespeicherte Stand.
  const [draft, setDraft] = useState<FormFields | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  const form = draft ?? formFrom(saved.input);
  const busy = gen.busy;
  const output = ready && !busy && !editing ? saved.output : null;
  const shownError = error ?? gen.error;

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [output, busy]);

  const setField = (key: keyof FormFields, value: string) => {
    setError(null);
    setDraft({ ...form, [key]: value });
  };

  async function start() {
    const problem = formProblem(form, profile);
    if (problem) return setError(problem);
    setError(null);
    gen.clearError();
    const input = toInput(profile, form);
    inputRef.current = input;
    // generate() macht Fenster, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const result = await gen.generate(input);
    if (!result) return;
    shouldFocus.current = true;
    set({ v: 1, input, output: result });
    setDraft(null);
    setEditing(false);
    const patch = profilePatch(profile, result);
    if (Object.keys(patch).length > 0) update(patch);
  }

  const edit = () => {
    setError(null);
    gen.clearError();
    setDraft(formFrom(saved.input));
    setEditing(true);
  };

  const backToResult = () => {
    setError(null);
    setDraft(null);
    setEditing(false);
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    setDraft({ ...EMPTY_FORM });
    setEditing(false);
    set(EMPTY_STATE);
  };

  const placeholders = output ? placeholdersIn(output) : [];
  const doc = output && saved.input ? toDocument(output, saved.input) : null;
  const vorschlag = einzugsgebietVorschlag(profile.ort, profile.kanton);

  if (output && doc) {
    return (
      <ResultCard
        title="Dein Idealkundenprofil"
        headingRef={headingRef}
        actions={
          <>
            <DocumentExport model={doc} />
            <Button type="button" variant="outline" onClick={edit}>
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
        <DocView blocks={doc.blocks} />
        <Punktekarte key={output.segmentName} output={output} />
      </ResultCard>
    );
  }

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

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="icp" fields={["firma", "branche", "ort", "kanton", "groesse"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">Firma, Branche, Ort, Kanton und Grösse speichern wir in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-5" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Deine Kundschaft</legend>

        <div className="grid gap-1.5">
          <Label htmlFor="icp-angebot">Was bietest du an?</Label>
          <Textarea
            id="icp-angebot"
            value={form.angebot}
            onChange={(e) => setField("angebot", e.target.value)}
            maxLength={LIMITS.angebot.max}
            required
            aria-describedby="icp-angebot-help"
          />
          <p id="icp-angebot-help" className="text-sm text-muted-foreground">
            Leistungen, Produkte, Besonderheiten. Zwei bis fünf Sätze reichen ({LIMITS.angebot.min} bis {LIMITS.angebot.max} Zeichen).
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="icp-kunden">Wer sind heute deine besten Kunden, und warum?</Label>
          <Textarea
            id="icp-kunden"
            value={form.besteKunden}
            onChange={(e) => setField("besteKunden", e.target.value)}
            maxLength={LIMITS.besteKunden.max}
            required
            aria-describedby="icp-kunden-help"
          />
          <p id="icp-kunden-help" className="text-sm text-muted-foreground">
            Die Kunden, bei denen die Arbeit am besten läuft: Wer sind sie, was zeichnet sie aus, warum arbeiten sie mit dir ({LIMITS.besteKunden.min} bis{" "}
            {LIMITS.besteKunden.max} Zeichen)?
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="icp-einzugsgebiet">Einzugsgebiet (freiwillig)</Label>
            <Input
              id="icp-einzugsgebiet"
              value={form.einzugsgebiet}
              onChange={(e) => setField("einzugsgebiet", e.target.value)}
              maxLength={LIMITS.einzugsgebiet.max}
              placeholder={vorschlag || "Gossau und Umgebung, Kanton St. Gallen"}
              aria-describedby="icp-einzugsgebiet-help"
            />
            <p id="icp-einzugsgebiet-help" className="text-sm text-muted-foreground">
              {vorschlag ? `Leer gelassen nehmen wir: ${vorschlag}.` : "Zum Beispiel ein Ort mit Umgebung, ein Bezirk oder ein Kanton."}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="icp-auftrag">Typischer Auftrag oder Projektgrösse (freiwillig)</Label>
            <Input
              id="icp-auftrag"
              value={form.auftrag}
              onChange={(e) => setField("auftrag", e.target.value)}
              maxLength={LIMITS.auftrag.max}
              placeholder="Fassade eines Einfamilienhauses, CHF 15'000.- bis 40'000.-"
              aria-describedby="icp-auftrag-help"
            />
            <p id="icp-auftrag-help" className="text-sm text-muted-foreground">
              Beträge, die du hier nennst, darf die KI verwenden; andere Zahlen erfindet sie nicht.
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="icp-nicht">Woran erkennst du Anfragen, die nicht passen? (freiwillig)</Label>
          <Textarea
            id="icp-nicht"
            value={form.nichtPassend}
            onChange={(e) => setField("nichtPassend", e.target.value)}
            maxLength={LIMITS.nichtPassend.max}
            className="min-h-20"
            aria-describedby="icp-nicht-help"
          />
          <p id="icp-nicht-help" className="text-sm text-muted-foreground">
            Zum Beispiel: nur der Preis zählt, zu weit weg, ein Generalunternehmer dazwischen (bis {LIMITS.nichtPassend.max} Zeichen).
          </p>
        </div>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Dafür gehen Betrieb, Branche, Ort, Kanton, Grösse und deine fünf Angaben an unseren Server und von dort an unseren KI-Anbieter, nicht deine
        E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und das Profil gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei
        Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
      </p>

      <p id="icp-error" role="alert" className="min-h-6 text-destructive">
        {shownError}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
          {busy ? "Bitte warten …" : "Profil erstellen"}
        </Button>
        {editing && saved.output && (
          <Button type="button" variant="ghost" onClick={backToResult} disabled={busy}>
            Zurück zum Ergebnis
          </Button>
        )}
        <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
      </div>

      {busy && (
        <p role="status" aria-live="polite" className="rounded-xl border border-line p-4 font-medium">
          Die KI schreibt dein Idealkundenprofil.
        </p>
      )}
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <IcpFlow />
    </ToolShell>
  );
}
