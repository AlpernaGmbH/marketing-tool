"use client";

import { useEffect, useRef, useState } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { placeholdersIn } from "@/lib/generator";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { MAX_ANGEBOT_CHARS, MAX_FREITEXT_CHARS, MAX_ZIELGRUPPE_CHARS, personaGenerator, type PersonaInput } from "./generator";
import { ALTERSGRUPPEN, KI_HINWEIS, ROLLEN, SLUG, eingabeText, formFromInput, inputProblem, parseState, profilePatch, reportMarkdown, screenBlocks, toDocument, toInput, withVorschlag, type PersonaForm } from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Intro() {
  return (
    <p>
      Sag, für wen dein Angebot ist und was du dieser Gruppe anbietest. Eine KI macht daraus eine Persona: eine erfundene, konkrete Person mit Alltag,
      Zielen, Sorgen, Einwänden und den Wörtern, die bei ihr ankommen. An sie richtest du Website-Texte, Beiträge und Offerten.
    </p>
  );
}

function PersonaFlow() {
  const { profile, ready: profileReady, update } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<PersonaInput | null>(null);
  const gen = useGenerator(personaGenerator, { eingabe: eingabeText, ausgabe: (o) => reportMarkdown(o, inputRef.current) });

  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const zielgruppeRef = useRef<HTMLInputElement>(null);
  const shouldFocus = useRef(false);

  // Änderungen am Formular leben im Entwurf, bis die Persona entsteht; vorher gilt der gespeicherte Stand mit dem Vorschlag aus dem Profil.
  const [draft, setDraft] = useState<PersonaForm | null>(null);
  const form = draft ?? withVorschlag(saved.form, profile);
  const patch = (p: Partial<PersonaForm>) => {
    setError(null);
    setDraft({ ...form, ...p });
  };

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || gen.busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved.output, gen.busy]);

  const busy = gen.busy;
  const shownError = error ?? gen.error;
  const fields = { firma: profile.firma, branche: profile.branche, ort: profile.ort };

  async function start() {
    const problem = inputProblem(fields, form);
    if (problem) return setError(problem);
    const input = toInput(fields, form);
    if (!input) return setError("Bitte prüfe deine Angaben und versuch es noch einmal.");
    setError(null);
    gen.clearError();
    inputRef.current = input;
    // Das Formular bleibt nach dem Neuladen gefüllt, auch wenn die Anfrage scheitert.
    set({ ...savedRef.current, v: 1, form: formFromInput(input) });
    // generate() macht Fenster, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const output = await gen.generate(input);
    if (!output) return;
    shouldFocus.current = true;
    set({ v: 1, form: formFromInput(input), input, output });
    // Ins Profil nur nach einem frisch erzeugten Entwurf, nie beim Wiederherstellen (TOOL-BAUEN.md, Abschnitt 2).
    update(profilePatch(profile, output, input));
    setDraft(null);
  }

  const focusForm = () => {
    setError(null);
    gen.clearError();
    zielgruppeRef.current?.focus();
  };

  const restart = () => {
    setError(null);
    gen.clearError();
    set({ ...saved, input: null, output: null });
    zielgruppeRef.current?.focus();
  };

  const output = ready && !busy ? saved.output : null;
  const placeholders = output ? placeholdersIn(output) : [];
  const doc = output ? toDocument(output, saved.input) : null;

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
        <ProfileFieldsForm idPrefix="pg" fields={["firma", "branche", "ort"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-4" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Deine Zielgruppe</legend>

        <div className="grid gap-1.5">
          <Label htmlFor="pg-zielgruppe">Für wen ist das Angebot?</Label>
          <Input
            id="pg-zielgruppe"
            ref={zielgruppeRef}
            value={form.zielgruppe}
            maxLength={MAX_ZIELGRUPPE_CHARS + 50}
            onChange={(e) => patch({ zielgruppe: e.target.value })}
            aria-describedby="pg-zielgruppe-help"
            aria-required="true"
          />
          <p id="pg-zielgruppe-help" className="text-sm text-muted-foreground">
            Zum Beispiel «Hausbesitzer in Gossau und Umgebung». Steht in deinem Profil ein Primärsegment, steht es hier schon.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pg-angebot">Was bietest du dieser Gruppe an?</Label>
          <Textarea
            id="pg-angebot"
            value={form.angebot}
            maxLength={MAX_ANGEBOT_CHARS + 100}
            onChange={(e) => patch({ angebot: e.target.value })}
            aria-describedby="pg-angebot-help"
            aria-required="true"
          />
          <p id="pg-angebot-help" className="text-sm text-muted-foreground">
            Zwei bis vier Sätze: Leistung, Besonderheit, Ablauf. Höchstens {MAX_ANGEBOT_CHARS} Zeichen.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pg-altersgruppe">Altersgruppe</Label>
            <select id="pg-altersgruppe" className={selectClass} value={form.altersgruppe} onChange={(e) => patch({ altersgruppe: e.target.value as PersonaForm["altersgruppe"] })} aria-required="true">
              <option value="">Bitte wählen</option>
              {ALTERSGRUPPEN.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pg-rolle">Rolle</Label>
            <select id="pg-rolle" className={selectClass} value={form.rolle} onChange={(e) => patch({ rolle: e.target.value as PersonaForm["rolle"] })} aria-required="true">
              <option value="">Bitte wählen</option>
              {ROLLEN.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pg-situation">Typische Situation, in der sie dich braucht (freiwillig)</Label>
          <Textarea
            id="pg-situation"
            value={form.situation}
            maxLength={MAX_FREITEXT_CHARS + 100}
            onChange={(e) => patch({ situation: e.target.value })}
            aria-describedby="pg-situation-help"
          />
          <p id="pg-situation-help" className="text-sm text-muted-foreground">
            Zum Beispiel: Die Fassade blättert, der Nachbar hat schon gestrichen, im Frühling soll es fertig sein.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pg-fragen">Fragen, die sie dir stellt (freiwillig)</Label>
          <Textarea id="pg-fragen" value={form.fragen} maxLength={MAX_FREITEXT_CHARS + 100} onChange={(e) => patch({ fragen: e.target.value })} aria-describedby="pg-fragen-help" />
          <p id="pg-fragen-help" className="text-sm text-muted-foreground">
            Was du am Telefon oder vor Ort immer wieder hörst, eine Frage je Zeile.
          </p>
        </div>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Dafür gehen Betrieb, Branche, Ort und deine Angaben zur Zielgruppe an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse.
        Unser Server speichert sie nicht. Deine Angaben und die Persona gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können.
        Gib nichts Vertrauliches ein, zum Beispiel keine Namen echter Kundinnen und Kunden.
      </p>

      <p id="pg-error" role="alert" className="min-h-6 text-destructive">
        {shownError}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
          {busy ? "Bitte warten …" : "Persona erstellen"}
        </Button>
        <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
      </div>

      {busy && (
        <p role="status" aria-live="polite" className="rounded-xl border border-line p-4 font-medium">
          Die KI schreibt deine Persona.
        </p>
      )}

      {output && doc && (
        <ResultCard
          title="Deine Persona"
          headingRef={headingRef}
          actions={
            <>
              <DocumentExport model={doc} />
              <Button type="button" variant="ghost" onClick={focusForm}>
                Angaben ändern
              </Button>
              <Button type="button" variant="ghost" onClick={restart}>
                Neue Persona
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
            {KI_HINWEIS}
          </p>
          <p className="font-heading text-lg font-medium">{output.name}</p>
          {placeholders.length > 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {placeholders.join(", ")}
            </p>
          )}
          <DocView blocks={screenBlocks(doc)} />
          <p className="text-sm text-muted-foreground">
            Die Persona steht in deinem Firmenprofil unter «Personas». Für eine zweite Gruppe änderst du oben die Angaben und klickst erneut auf «Persona
            erstellen».
          </p>
        </ResultCard>
      )}
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <PersonaFlow />
    </ToolShell>
  );
}
