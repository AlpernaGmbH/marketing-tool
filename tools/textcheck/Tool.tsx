"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/use-account";
import { useLocalJson } from "@/lib/use-local";
import {
  LONG_SENTENCE_WORDS,
  MAX_CHARS,
  MIN_WORDS_FOR_INDEX,
  SAMPLE_TEXT,
  SLUG,
  analyzeText,
  inputProblem,
  kindTitle,
  num,
  parseTextcheckState,
  reportMarkdown,
  type Finding,
  type FindingKind,
  type TextReport,
} from "./logic";
import config from "./tool.config";

const KINDS: FindingKind[] = ["fehler", "schreibweise", "floskel", "satz"];
const MAX_LABEL = MAX_CHARS.toLocaleString("en-US").replace(/,/g, "'");

function Intro({ inAccount }: { inAccount: boolean }) {
  return (
    <>
      <p>
        Füge einen Text ein, zum Beispiel von deiner Website, aus einem Newsletter oder für einen Beitrag. Der Textcheck sucht Formfehler wie doppelte Wörter und falsche Leerzeichen, prüft die Schweizer
        Schreibweise, markiert Floskeln und misst, wie leicht sich der Text lesen lässt. Du bekommst den Text mit den sicheren Korrekturen zurück.
      </p>
      <p>
        Die Prüfung läuft in deinem Browser. Der Text geht an keinen Server und an keine KI. Rechtschreibung einzelner Wörter und Grammatik prüft der
        Textcheck nicht: Dafür unterstreicht dein Browser unbekannte Wörter im Textfeld.{" "}
        {inAccount
          ? "Du bist angemeldet: Der Text wird in deinem Konto gespeichert, damit du ihn auf jedem Gerät wiederfindest."
          : "Der Text bleibt in deinem Browser. Mit Konto bleibt er auf jedem Gerät erhalten."}
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

function FindingRow({ f }: { f: Finding }) {
  return (
    <li className="grid gap-1 rounded-xl border border-line bg-paper p-4">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{f.title}</span>
        <span className="mono text-sm text-muted-foreground">
          {f.count} {f.count === 1 ? "Stelle" : "Stellen"}
          {f.fix ? ", wird bereinigt" : ""}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">{f.hint}</p>
      <ul className="mt-1 grid gap-1">
        {f.examples.map((e) => (
          <li key={`${e.start}-${e.end}`} className="mono break-words rounded-md bg-surface px-2 py-1 text-sm">
            {e.excerpt}
          </li>
        ))}
      </ul>
    </li>
  );
}

function ResultView({
  report,
  onEdit,
  onNew,
  headingRef,
}: {
  report: TextReport;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const r = report.readability;
  const byKind = KINDS.map((k) => ({ kind: k, items: report.findings.filter((f) => f.kind === k) })).filter((g) => g.items.length > 0);
  return (
    <ResultCard
      title="Dein Textcheck"
      headingRef={headingRef}
      actions={
        <>
          <CopyButton text={report.cleaned} label="Bereinigten Text kopieren" variant="default" />
          <CopyButton text={() => reportMarkdown(report)} label="Bericht kopieren" />
          <Button type="button" variant="outline" onClick={onEdit}>
            Text ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neuen Text prüfen
          </Button>
        </>
      }
    >
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Wörter" value={String(report.words)} />
        <Stat label="Sätze" value={String(report.sentences)} note={r ? `Ø ${num(r.avgSentenceLength)} Wörter pro Satz` : undefined} />
        <Stat
          label="Lesbarkeit"
          value={r ? `${r.index} von 100` : "noch offen"}
          note={r ? `${r.level} (Index nach Amstad)` : `Der Index braucht mindestens ${MIN_WORDS_FOR_INDEX} Wörter.`}
        />
        <Stat label="Fundstellen" value={String(report.findings.reduce((n, f) => n + f.count, 0))} note={`${report.fixedCount} werden automatisch bereinigt`} />
      </dl>

      {r && (
        <p className="text-sm text-muted-foreground">
          Als Orientierung gelten 60 bis 70 Punkte als gut verständlich. Der Index misst nur Satz- und Wortlänge und schätzt die Silben, er ersetzt kein Lesen
          durch einen Menschen. Quelle: Lesbarkeitsindex nach Toni Amstad (Universität Zürich, 1978), nachzulesen auf Wikipedia unter «Lesbarkeitsindex».
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Geprüft: doppelte Wörter, Leerzeichen und Satzzeichen, Schweizer Schreibweise, Floskeln aus unserer Liste, Satzlänge und Lesbarkeit. Nicht geprüft:
        Rechtschreibung einzelner Wörter und Grammatik.
      </p>

      <div className="grid gap-4">
        <h4>Das fällt auf</h4>
        {byKind.length === 0 ? (
          <p>
            Zu den geprüften Punkten ist nichts aufgefallen. Das heisst nicht, dass der Text fehlerfrei ist: Tippfehler in einzelnen Wörtern und Grammatik prüft der
            Textcheck nicht.
          </p>
        ) : (
          byKind.map((g) => (
            <section key={g.kind} aria-label={kindTitle(g.kind)} className="grid gap-2">
              <h5 className="font-heading font-semibold">{kindTitle(g.kind)}</h5>
              <ul className="grid gap-2">
                {g.items.map((f) => (
                  <FindingRow key={f.id} f={f} />
                ))}
              </ul>
            </section>
          ))
        )}
        {report.findings.some((f) => f.kind === "satz") && (
          <p className="text-sm text-muted-foreground">Als lang gilt hier ein Satz ab {LONG_SENTENCE_WORDS + 1} Wörtern. Das ist ein Richtwert dieses Werkzeugs, keine Norm.</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tc-cleaned">Bereinigter Text</Label>
        <Textarea id="tc-cleaned" readOnly value={report.cleaned} rows={10} className="mono text-sm" />
        <p className="text-sm text-muted-foreground">
          Die Bereinigung ersetzt das Eszett durch ss, stellt Anführungszeichen auf «…» um (nur wenn sie in der Zeile paarweise stehen), entfernt doppelte
          Leerzeichen und Leerzeichen vor Satzzeichen, setzt fehlende Leerzeichen nach dem Komma und schreibt Prozent mit Leerzeichen. Floskeln, doppelte
          Wörter, lange Sätze, die Stellung von CHF und die Tausendertrennung bleiben bei dir, weil sie dein Urteil brauchen. Namen mit Eszett, etwa «Strauß»,
          korrigierst du von Hand.
        </p>
      </div>
    </ResultCard>
  );
}

function TextFlow() {
  const ctx = useToolContext();
  const account = useAccount();
  const inAccount = Boolean(account?.account && account.storage);
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseTextcheckState);

  // Der Entwurf lebt im Feld, der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? saved.text;
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
    if (draft === null || draft === savedRef.current.text) return;
    const timer = setTimeout(() => set({ ...savedRef.current, text: draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "area") areaRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const report = useMemo(() => (saved.phase === "result" ? analyzeText(saved.text) : null), [saved.phase, saved.text]);

  async function start() {
    const problem = inputProblem(text);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      // Ein bereits gezählter Durchlauf wird nur fortgesetzt: kein neues Gate, keine Doppelzählung.
      if (!saved.counted && !(await ctx.requestStart())) return;
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", text, counted: true });
      setDraft(null);
      if (!saved.counted) void ctx.completeRun();
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
          set({ v: 1, phase: "edit", text: "", counted: false });
        }}
      />
    );
  }

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
        <Intro inAccount={inAccount} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tc-text">Dein Text</Label>
        <Textarea
          id="tc-text"
          ref={areaRef}
          rows={12}
          maxLength={MAX_CHARS}
          value={text}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          aria-describedby="tc-count tc-error"
          aria-invalid={Boolean(error)}
          lang="de-CH"
          spellCheck
          disabled={!ready}
        />
        <p id="tc-count" className="mono text-sm text-muted-foreground">
          {text.length.toLocaleString("en-US").replace(/,/g, "'")} von {MAX_LABEL} Zeichen
        </p>
      </div>

      <p id="tc-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || busy}>
          Text prüfen
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!ready}
          onClick={() => {
            setDraft(SAMPLE_TEXT);
            setError(null);
          }}
        >
          Beispieltext einfügen
        </Button>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <TextFlow />
    </ToolShell>
  );
}
