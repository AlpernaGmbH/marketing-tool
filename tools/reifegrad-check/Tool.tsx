"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { DocView } from "@/components/tool/DocView";
import { QuestionnaireEngine } from "@/components/tool/QuestionnaireEngine";
import { ResultCard } from "@/components/tool/ResultCard";
import { ResultPitch } from "@/components/tool/ResultPitch";
import { ToolShell } from "@/components/tool/ToolShell";
import { prefillFromProfile, type Answers } from "@/components/tool/questionnaire";
import { dateCH } from "@/lib/ch";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { SLUG as CHECK_SLUG, parseCheckState } from "@/tools/digitaler-auftritt-check/logic";
import { RICHTWERT_HINWEIS, STUFE_AB, checkInfo, evaluate, pitchFor, questions, resultText, toDocument, visualBlocks, type Reifegrad } from "./logic";
import config from "./tool.config";
import { WebsiteScan } from "./WebsiteScan";

const CHECK_PATH = `/tools/${CHECK_SLUG}`;

function CheckLink() {
  return (
    <Link href={CHECK_PATH} className="underline underline-offset-4">
      Marketing-Check
    </Link>
  );
}

function Result({ result }: { result: Reifegrad }) {
  return (
    <ResultCard title="Dein Marketing-Reifegrad" actions={<DocumentExport model={toDocument(result)} />}>
      <DocView blocks={visualBlocks(result)} />
      <p className="text-sm text-muted-foreground">
        {RICHTWERT_HINWEIS} Stufen: bis {STUFE_AB.Aufbau - 1} Anfang, ab {STUFE_AB.Aufbau} Aufbau, ab {STUFE_AB.Routine} Routine, ab {STUFE_AB.Fortgeschritten}{" "}
        Fortgeschritten.
      </p>
      <p className="text-sm">
        {result.check ? (
          <>
            Auftritt, Inhalte und eine Frage in Steuerung kommen aus deinem <CheckLink />
            {result.check.checkedAt ? ` vom ${dateCH(result.check.checkedAt)}` : ""} ({result.check.score} von 100).
            {!result.check.gbpGeprueft ? " Das Google-Profil ist nicht über Google bestätigt, sein Wert ist eine Annahme aus dem Link auf deiner Website." : ""}
          </>
        ) : (
          <>
            {result.nichtBewertet.join(" und ")} {result.nichtBewertet.length === 1 ? "ist" : "sind"} nicht bewertet, weil kein Website-Scan vorliegt. Starte ihn über
            «Neu beginnen» auf der Startseite dieses Werkzeugs oder lass den <CheckLink /> laufen; beim nächsten Durchlauf zählt sein Ergebnis.
          </>
        )}
      </p>
      <p className="text-sm text-muted-foreground">Bei Vereinen gilt dasselbe sinngemäss: Kundschaft sind Mitglieder, Publikum und Sponsoren, Aufträge sind Anlässe und Beitritte.</p>
      <ResultPitch spec={pitchFor(result)} />
    </ResultCard>
  );
}

function Intro({ checkDate }: { checkDate: string | null }) {
  return (
    <>
      <p>
        Wie gut ist dein Marketing aufgestellt? Sechs Fragen zu Zielen, Kundenkontakt und Steuerung, dazu ein Scan deiner Website für Auftritt und Inhalte. Das dauert etwa
        drei Minuten. Du bekommst einen Marketing-Reifegrad von 0 bis 100, bis zu fünf Dimensionen mit Stufe und je zwei nächste Schritte, bei der schwächsten Dimension
        beginnend.
      </p>
      <p>
        {checkDate ? <>Dein Scan vom {checkDate} ist gespeichert.</> : <>Ohne Scan sind Auftritt und Inhalte nicht bewertet.</>} Das Ergebnis geht zusammen mit deinen
        Antworten und deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können.
      </p>
      <WebsiteScan />
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
