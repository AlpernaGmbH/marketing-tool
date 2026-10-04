"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { QuestionnaireEngine } from "@/components/tool/QuestionnaireEngine";
import { ResultCard } from "@/components/tool/ResultCard";
import { ScoreBadge } from "@/components/tool/ScoreBadge";
import { ToolShell } from "@/components/tool/ToolShell";
import { prefillFromProfile, type Answers } from "@/components/tool/questionnaire";
import { dateCH } from "@/lib/ch";
import { scoreBand } from "@/lib/score";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { SLUG as CHECK_SLUG, parseCheckState } from "@/tools/digitaler-auftritt-check/logic";
import { RICHTWERT_HINWEIS, STUFE_AB, checkInfo, evaluate, questions, resultText, toDocument, type DimensionResult, type Reifegrad } from "./logic";
import config from "./tool.config";

const CHECK_PATH = `/tools/${CHECK_SLUG}`;

function CheckLink() {
  return (
    <Link href={CHECK_PATH} className="underline underline-offset-4">
      Marketing-Check
    </Link>
  );
}

function DimensionRow({ d }: { d: DimensionResult }) {
  const band = scoreBand(d.score / 100);
  return (
    <li className="grid gap-1.5 border-b border-line pb-3 last:border-b-0">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <span className="font-heading font-semibold">{d.name}</span>
        <span className="text-sm text-muted-foreground">
          {d.score} von 100, Stufe «{d.stufe}»
          {d.check !== null && ` (Selbstangabe ${d.selbst}, Marketing-Check ${d.check})`}
        </span>
      </div>
      <span
        role="meter"
        aria-label={d.name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={d.score}
        aria-valuetext={`${d.score} von 100, Stufe ${d.stufe}`}
        className="block h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <span className={`block h-full ${band.key === "hoch" ? "bg-ink" : band.key === "mittel" ? "bg-brand" : "bg-yellow"}`} style={{ width: `${d.score}%` }} />
      </span>
    </li>
  );
}

function Result({ result }: { result: Reifegrad }) {
  return (
    <ResultCard title="Dein Marketing-Reifegrad" actions={<DocumentExport model={toDocument(result)} />}>
      <ScoreBadge score={result.gesamt} label={`Reifegrad gesamt, Stufe «${result.stufe}»`} />
      <p className="text-sm text-muted-foreground">
        {RICHTWERT_HINWEIS} Stufen: bis {STUFE_AB.Aufbau - 1} Anfang, ab {STUFE_AB.Aufbau} Aufbau, ab {STUFE_AB.Routine} Routine, ab {STUFE_AB.Fortgeschritten}{" "}
        Fortgeschritten.
      </p>
      <p className="text-sm">
        {result.check ? (
          <>
            Dein <CheckLink />
            {result.check.checkedAt ? ` vom ${dateCH(result.check.checkedAt)}` : ""} ({result.check.score} von 100) zählt in «Auftritt» zur Hälfte mit.
          </>
        ) : (
          <>
            In «Auftritt» zählt nur deine Selbstangabe. Lass den <CheckLink /> laufen; beim nächsten Durchlauf zählt sein Ergebnis zur Hälfte mit.
          </>
        )}
      </p>

      <section aria-labelledby="rg-dimensionen" className="grid gap-3">
        <h4 id="rg-dimensionen" className="font-heading text-lg font-semibold">
          Fünf Dimensionen
        </h4>
        <ul className="grid gap-3">
          {result.dimensionen.map((d) => (
            <DimensionRow key={d.id} d={d} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="rg-schritte" className="grid gap-3">
        <h4 id="rg-schritte" className="font-heading text-lg font-semibold">
          Nächste Schritte, bei der schwächsten Dimension beginnend
        </h4>
        <ol className="grid gap-3">
          {result.schritte.map((s, i) => (
            <li key={`${s.dimension}-${i}`} className="grid grid-cols-[2rem_1fr] gap-x-2 border-b border-line pb-3 last:border-b-0">
              <span className="font-heading font-semibold">{i + 1}.</span>
              <span>
                <span className="block text-sm text-muted-foreground">{s.name}</span>
                {s.text}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          Bei Vereinen gilt dasselbe sinngemäss: Kundschaft sind Mitglieder, Publikum und Sponsoren, Aufträge sind Anlässe und Beitritte.
        </p>
      </section>
    </ResultCard>
  );
}

function Intro({ checkDate }: { checkDate: string | null }) {
  return (
    <>
      <p>
        Zehn Fragen zu Zielen, Auftritt, Beiträgen, Kundenkontakt und Steuerung, alles Selbstangaben. Das dauert etwa fünf Minuten. Du bekommst einen
        Marketing-Reifegrad von 0 bis 100, fünf Dimensionen mit Stufe und je zwei nächste Schritte, bei der schwächsten Dimension beginnend.
      </p>
      <p>
        {checkDate ? (
          <>
            Dein <CheckLink /> vom {checkDate} zählt in der Dimension «Auftritt» zur Hälfte mit.
          </>
        ) : (
          <>
            Tipp: Lass zuerst den <CheckLink /> laufen. Sein Ergebnis zählt dann in der Dimension «Auftritt» zur Hälfte mit.
          </>
        )}{" "}
        Das Ergebnis geht zusammen mit deinen Antworten und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können.
      </p>
    </>
  );
}

function Fragebogen() {
  const { profile } = useProfile();
  const { value: saved } = useLocalJson(`mt:${CHECK_SLUG}`, parseCheckState);
  const check = useMemo(() => checkInfo(saved), [saved]);
  // Branche und Grösse kommen als Kontext in die Antworten; keine Frage hängt davon ab (Harte Regel 10).
  const prefill = useMemo<Answers>(() => prefillFromProfile(profile, { branche: "branche", groesse: "groesse" }), [profile]);
  const score = useCallback((answers: Answers) => evaluate(answers, check), [check]);

  return (
    <QuestionnaireEngine
      slug={config.slug}
      questions={questions}
      scoreFn={score}
      prefill={prefill}
      intro={<Intro checkDate={check?.checkedAt ? dateCH(check.checkedAt) : null} />}
      resultText={resultText}
      renderResult={(result) => <Result result={result} />}
    />
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <Fragebogen />
    </ToolShell>
  );
}
