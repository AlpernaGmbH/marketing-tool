"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ResultCard } from "@/components/tool/ResultCard";
import { ScoreBadge } from "@/components/tool/ScoreBadge";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocalJson } from "@/lib/use-local";
import { MIN_WORDS_FOR_INDEX } from "@/tools/textcheck/logic";
import {
  GROUPS,
  MAX_CHARS,
  RICHTWERT,
  SAMPLE,
  SLUG,
  analyzeNewsletter,
  findingsOf,
  groupTitle,
  inputProblem,
  isHtml,
  parseNewsletterState,
  reportMarkdown,
  toDocument,
  type Check,
  type Modus,
  type NewsletterReport,
  type NewsletterState,
} from "./logic";
import config from "./tool.config";

const MAX_LABEL = MAX_CHARS.toLocaleString("en-US").replace(/,/g, "'");
const fmt = (n: number) => n.toLocaleString("en-US").replace(/,/g, "'");

function Intro() {
  return (
    <>
      <p>
        Füge den Text deines Newsletters ein, dazu Betreff und Absendername. Reiner Text genügt; mit dem HTML-Quelltext aus deinem Versandprogramm prüfen wir zusätzlich Bilder und Linktexte. Der
        Newsletter-Check prüft Betreff, Absender, Anrede, Ziel und Links, Abmeldemöglichkeit, Postadresse, Bilder (bei HTML), Spam-Signale, Sprache und Länge.
        Du bekommst eine Punktzahl von 0 bis 100 und je Fund einen Hinweis, was du änderst.
      </p>
      <p>
        Die Prüfung läuft in deinem Browser. Dein Ergebnis geht zusammen mit Betreff, Absender, Text und deiner E-Mail-Adresse an Alperna, damit wir dir bei
        Fragen weiterhelfen können. Ob dein Newsletter rechtlich in Ordnung ist, prüft dieses Werkzeug nicht.
      </p>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 font-heading text-2xl font-medium tracking-tight">{value}</dd>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

function FindingRow({ c }: { c: Check }) {
  return (
    <li className="grid gap-1 rounded-xl border border-line bg-paper p-4">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{c.label}</span>
        <span className="mono text-sm text-muted-foreground">{Math.round(c.pass * 100)} von 100</span>
      </p>
      <p className="text-sm">{c.detail}</p>
      <p className="text-sm text-muted-foreground">{c.hint}</p>
      {c.examples.length > 0 && (
        <ul className="mt-1 grid gap-1">
          {c.examples.map((e, i) => (
            <li key={i} className="mono break-words rounded-md bg-surface px-2 py-1 text-sm">
              {e}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ResultView({
  report,
  onEdit,
  onNew,
  headingRef,
}: {
  report: NewsletterReport;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const findings = findingsOf(report);
  const passed = report.checks.filter((c) => c.ok);
  const byGroup = GROUPS.map((g) => ({ group: g, items: findings.filter((c) => c.group === g) })).filter((x) => x.items.length > 0);
  const r = report.readability;
  const doc = toDocument(report);

  return (
    <ResultCard
      title="Dein Newsletter-Check"
      headingRef={headingRef}
      actions={
        <>
          <DocumentExport model={doc} />
          <Button type="button" variant="outline" onClick={onEdit}>
            Text ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neuen Newsletter prüfen
          </Button>
        </>
      }
    >
      <ScoreBadge score={report.score} label={report.betreff ? `Betreff: ${report.betreff}` : "Ohne Betreff"} />
      <p className="text-sm text-muted-foreground">
        {passed.length} von {report.checks.length} Prüfpunkten erfüllt. {report.html ? "HTML erkannt, Bilder und Linktexte sind geprüft." : "Reiner Text; Bilder und Alt-Texte prüft der Check nur bei HTML."}
      </p>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Wörter" value={String(report.words)} note={`${report.sentences} ${report.sentences === 1 ? "Satz" : "Sätze"}`} />
        <Stat label="Linkziele" value={String(report.links)} note={`${report.ctas} ${report.ctas === 1 ? "Aufforderung" : "Aufforderungen"}`} />
        <Stat label="Bilder" value={report.images === null ? "nur bei HTML" : String(report.images)} />
        <Stat
          label="Lesbarkeit"
          value={r ? `${r.index} von 100` : "noch offen"}
          note={r ? `${r.level} (Index nach Amstad)` : `Der Index braucht mindestens ${MIN_WORDS_FOR_INDEX} Wörter.`}
        />
      </dl>

      <div className="grid gap-4">
        <h4>Das fällt auf</h4>
        {byGroup.length === 0 ? (
          <p>Zu den geprüften Punkten ist nichts aufgefallen. Schick dir eine Testmail aufs Handy und lies sie dort noch einmal.</p>
        ) : (
          byGroup.map((g) => (
            <section key={g.group} aria-label={groupTitle(g.group)} className="grid gap-2">
              <h5 className="font-heading font-semibold">{groupTitle(g.group)}</h5>
              <ul className="grid gap-2">
                {g.items.map((c) => (
                  <FindingRow key={c.id} c={c} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {passed.length > 0 && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-heading font-semibold">Erfüllt ({passed.length})</summary>
          <ul className="mt-3 grid gap-2 text-sm">
            {passed.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.label}:</span> {c.detail}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section aria-labelledby="nc-messung" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 id="nc-messung" className="font-heading text-base font-semibold">
          Was geprüft ist und was nicht
        </h4>
        <ul className="grid gap-2 text-sm text-muted-foreground">
          <li>
            Richtwerte von Alperna, keine Statistik: Betreff {RICHTWERT.betreffMin} bis {RICHTWERT.betreffMax} Zeichen, höchstens {RICHTWERT.linksMax} Linkziele,
            höchstens {RICHTWERT.ctaMax} Aufforderungen, {RICHTWERT.wordsMin} bis {RICHTWERT.wordsMax} Wörter, ein Bild je {RICHTWERT.wordsPerImage} Wörter.
          </li>
          <li>Geprüft wird der eingefügte Text. Abmeldelink und Adresse, die dein Versandprogramm erst beim Versand einfügt, sieht der Check nicht. Prüf dann die Testmail.</li>
          <li>
            Form, Schweizer Schreibweise, Floskeln und Satzlänge prüft derselbe Regelsatz wie der{" "}
            <Link href="/tools/textcheck" className="underline underline-offset-4">
              Textcheck
            </Link>
            ; dort bekommst du den bereinigten Text zum Kopieren.
          </li>
          <li>Ob der Newsletter rechtlich in Ordnung ist, prüft dieses Werkzeug nicht.</li>
        </ul>
      </section>
    </ResultCard>
  );
}

type Draft = Pick<NewsletterState, "betreff" | "absender" | "text" | "modus">;

function NewsletterFlow() {
  const ctx = useToolContext();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseNewsletterState);

  // Der Entwurf lebt in den Feldern, der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<Draft | null>(null);
  const form: Draft = draft ?? { betreff: saved.betreff, absender: saved.absender, text: saved.text, modus: saved.modus };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocus = useRef<"heading" | "area" | null>(null);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    if (draft === null) return;
    const s = savedRef.current;
    if (draft.text === s.text && draft.betreff === s.betreff && draft.absender === s.absender && draft.modus === s.modus) return;
    const timer = setTimeout(() => set({ ...savedRef.current, ...draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "area") areaRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const report = useMemo(
    () => (saved.phase === "result" ? analyzeNewsletter({ betreff: saved.betreff, absender: saved.absender, text: saved.text, modus: saved.modus }) : null),
    [saved.phase, saved.betreff, saved.absender, saved.text, saved.modus],
  );

  const edit = (patch: Partial<Draft>) => {
    setDraft({ ...form, ...patch });
    setError(null);
  };

  async function start() {
    const problem = inputProblem(form.text, form.modus);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      shouldFocus.current = "heading";
      const next: NewsletterState = { v: 1, phase: "result", betreff: form.betreff.trim(), absender: form.absender.trim(), text: form.text, modus: form.modus };
      set(next);
      setDraft(null);
      void ctx.sendResult({
        eingabe: `Betreff: ${next.betreff}\nAbsender: ${next.absender}\n\n${next.text}`,
        ausgabe: reportMarkdown(analyzeNewsletter(next)),
      });
    } finally {
      setBusy(false);
    }
  }

  if (ready && saved.phase === "result" && report) {
    return (
      <ResultView
        report={report}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "area";
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "area";
          setError(null);
          setDraft(null);
          set({ v: 1, phase: "edit", betreff: "", absender: "", text: "", modus: "text" });
        }}
      />
    );
  }

  const bl = form.betreff.trim().length;

  return (
    <form
      className="grid gap-5"
      noValidate
      aria-busy={!ready}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="nc-betreff">Betreff</Label>
          <Input
            id="nc-betreff"
            value={form.betreff}
            maxLength={300}
            onChange={(e) => edit({ betreff: e.target.value })}
            aria-describedby="nc-betreff-count"
            lang="de-CH"
            disabled={!ready}
          />
          <p id="nc-betreff-count" className="mono text-sm text-muted-foreground">
            {bl} Zeichen, Richtwert {RICHTWERT.betreffMin} bis {RICHTWERT.betreffMax}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nc-absender">Absendername</Label>
          <Input
            id="nc-absender"
            value={form.absender}
            maxLength={120}
            onChange={(e) => edit({ absender: e.target.value })}
            aria-describedby="nc-absender-help"
            placeholder="Malerei Keller"
            lang="de-CH"
            disabled={!ready}
          />
          <p id="nc-absender-help" className="text-sm text-muted-foreground">
            So, wie er im Postfach steht. Leer lassen, wenn er im Text steht.
          </p>
        </div>
      </div>

      <fieldset className="grid gap-2" disabled={!ready}>
        <legend className="mb-1 text-sm font-medium">Was fügst du ein?</legend>
        <div role="radiogroup" aria-label="Was fügst du ein?" className="inline-flex w-fit rounded-full border border-line bg-paper p-1" data-testid="nc-modus">
          {(
            [
              ["text", "Nur den Text"],
              ["html", "HTML-Quelltext"],
            ] as [Modus, string][]
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${form.modus === value ? "bg-ink text-page" : "hover:bg-surface"}`}
            >
              <input type="radio" name="nc-modus" value={value} checked={form.modus === value} onChange={() => edit({ modus: value })} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        <p id="nc-modus-help" className="max-w-[60ch] text-sm text-muted-foreground">
          {form.modus === "text"
            ? "Kopiere den Text der Mail, so wie er im Postfach steht. Bilder und Linktexte lassen sich nur mit HTML prüfen, alles andere läuft auch so."
            : "Der Quelltext aus deinem Versandprogramm («HTML anzeigen» oder «Exportieren»). Damit prüfen wir auch Bilder, Linktexte und den Abmeldelink."}
        </p>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="nc-text">{form.modus === "text" ? "Text deines Newsletters" : "HTML deines Newsletters"}</Label>
        <Textarea
          id="nc-text"
          ref={areaRef}
          rows={12}
          maxLength={MAX_CHARS}
          value={form.text}
          onChange={(e) => edit({ text: e.target.value })}
          aria-describedby="nc-count nc-error"
          aria-invalid={Boolean(error)}
          lang="de-CH"
          spellCheck
          disabled={!ready}
        />
        <p id="nc-count" className="mono text-sm text-muted-foreground">
          {fmt(form.text.length)} von {MAX_LABEL} Zeichen.
        </p>
        {form.modus === "text" && isHtml(form.text) && (
          <p role="status" className="text-sm" data-testid="nc-html-hint">
            Das sieht nach HTML aus.{" "}
            <button type="button" className="underline underline-offset-4" onClick={() => edit({ modus: "html" })}>
              Als HTML prüfen
            </button>
            , dann zählen auch Bilder und Links.
          </p>
        )}
      </div>

      <p id="nc-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || busy}>
          Newsletter prüfen
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!ready}
          onClick={() => {
            setDraft({ ...SAMPLE, modus: "text" });
            setError(null);
          }}
        >
          Beispiel einfügen
        </Button>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <NewsletterFlow />
    </ToolShell>
  );
}
