"use client";

import Link from "next/link";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { QuestionnaireEngine } from "@/components/tool/QuestionnaireEngine";
import { ResultCard } from "@/components/tool/ResultCard";
import { ScoreBadge } from "@/components/tool/ScoreBadge";
import { ToolShell } from "@/components/tool/ToolShell";
import { getTool } from "@/lib/registry";
import { scoreBand } from "@/lib/score";
import { useProfile } from "@/lib/use-profile";
import { AUFWAND_TEXT, evaluate, questions, toDocument, type Ergebnis } from "./logic";
import config from "./tool.config";

const SHOWN = 8;

function BausteinZeile({ label, score }: { label: string; score: number }) {
  const band = scoreBand(score / 100);
  return (
    <li className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {score} von 100, {band.text}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={`${score} von 100, ${band.text}`}
        className="h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <div className={band.key === "hoch" ? "h-full bg-ink" : band.key === "mittel" ? "h-full bg-brand" : "h-full bg-yellow"} style={{ width: `${score}%` }} />
      </div>
    </li>
  );
}

function Resultat({ r }: { r: Ergebnis }) {
  const { profile } = useProfile();
  const shown = r.massnahmen.slice(0, SHOWN);

  return (
    <ResultCard title="Dein Ergebnis" actions={<DocumentExport model={toDocument(r, profile)} />}>
      <ScoreBadge score={r.gesamt} label="Gesamtpunktzahl über deine gewählten Bausteine" />

      {r.bausteine.length > 0 && (
        <section aria-labelledby="dac-bausteine" className="grid gap-3">
          <h4 id="dac-bausteine" className="font-heading text-lg font-semibold">
            Nach Baustein
          </h4>
          <ul className="grid gap-4">
            {r.bausteine.map((b) => (
              <BausteinZeile key={b.baustein} label={b.label} score={b.score} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="dac-schritte" className="grid gap-3">
        <h4 id="dac-schritte" className="font-heading text-lg font-semibold">
          Das würde ich zuerst tun
        </h4>
        {shown.length === 0 ? (
          <p>Hier gibt es nichts Dringendes. Prüfe die Punkte in einigen Monaten erneut.</p>
        ) : (
          <ol className="grid gap-4">
            {shown.map((m, i) => {
              const tool = m.tool ? getTool(m.tool) : undefined;
              return (
                <li key={m.id} className="grid gap-1 border-b border-line pb-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-heading font-semibold">{i + 1}.</span>
                    <span className="font-medium">{m.massnahme}</span>
                  </div>
                  <p className="text-muted-foreground">{m.warum}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.bausteinLabel} · Aufwand {AUFWAND_TEXT[m.aufwand]}
                    {tool && (
                      <>
                        {" · "}
                        <Link href={`/tools/${tool.slug}`} className="underline underline-offset-4">
                          Passendes Werkzeug: {tool.name}
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        {r.massnahmen.length > SHOWN && (
          <p className="text-sm text-muted-foreground">Weitere {r.massnahmen.length - SHOWN} Schritte stehen im Export.</p>
        )}
      </section>

      <p className="text-sm text-muted-foreground">
        Gewichte und Aufwand sind eine Einschätzung von Alperna, keine Statistik. Der Check bewertet nur deine Angaben.
      </p>
    </ResultCard>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <QuestionnaireEngine
        slug={config.slug}
        questions={questions}
        scoreFn={evaluate}
        startLabel="Check starten"
        intro={
          <>
            <p>
              Du wählst, was für deinen Betrieb eine Rolle spielt, und beantwortest pro Baustein drei bis vier Aussagen mit Ja, Teilweise oder Nein. Daraus entstehen ein
              Ergebnis pro Baustein und eine Liste der nächsten Schritte.
            </p>
            <fieldset className="mt-6 grid gap-4 rounded-lg border border-line p-4 md:grid-cols-2">
              <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
              <ProfileFieldsForm idPrefix="dac" fields={["firma", "organisationstyp", "branche", "ort", "kanton", "groesse"]} />
              <p className="text-sm text-muted-foreground md:col-span-2">
                Freiwillig. Wird nur in deinem Browser gespeichert und im Export als Kopf verwendet.
              </p>
            </fieldset>
          </>
        }
        renderResult={(r) => <Resultat r={r} />}
      />
    </ToolShell>
  );
}
