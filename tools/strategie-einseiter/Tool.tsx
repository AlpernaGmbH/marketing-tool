"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DocView } from "@/components/tool/DocView";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { readLocal, subscribeLocal } from "@/lib/storage";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { QUELLEN_KEYS, SLUG, collect, eingabeText, parseState, reportMarkdown, toDocument, toState, vollstaendigkeit, type Baustein, type Einseiter } from "./logic";
import config from "./tool.config";

function Intro() {
  return (
    <>
      <p>
        Der Strategie-Einseiter zieht die Ergebnisse deiner Strategie-Werkzeuge aus diesem Browser zusammen: Positionierung, Zielgruppe, Nutzen, Marke,
        Botschaft, Kanäle, Budget und Lage, dazu die Massnahmen aus SWOT-Analyse und Reifegrad-Check. Du gibst nichts ein. Was fehlt, steht als Platzhalter mit
        dem Namen des Werkzeugs.
      </p>
      <p>
        Alles liest das Werkzeug nur in deinem Browser. Der fertige Einseiter geht mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen
        weiterhelfen können.
      </p>
    </>
  );
}

/**
 * Liest die Stände aller Quellen live aus dem Browser (auch Änderungen aus anderen Tabs). Der Schnappschuss ist ein
 * Text, damit useSyncExternalStore ihn vergleichen kann; vor der Hydrierung ist er undefined.
 */
function useQuellen(): { read: (key: string) => string | null; ready: boolean } {
  const snapshot = useSyncExternalStore(
    subscribeLocal,
    () => JSON.stringify(QUELLEN_KEYS.map((key) => readLocal(key))),
    () => undefined,
  );
  return useMemo(() => {
    const values: (string | null)[] = snapshot ? (JSON.parse(snapshot) as (string | null)[]) : [];
    const map = new Map<string, string | null>();
    QUELLEN_KEYS.forEach((key, i) => map.set(key, values[i] ?? null));
    return { read: (key: string) => map.get(key) ?? null, ready: snapshot !== undefined };
  }, [snapshot]);
}

function BausteinRow({ b }: { b: Baustein }) {
  return (
    <li className="grid gap-1 rounded-xl border border-line bg-paper p-4" data-testid={`baustein-${b.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-heading font-medium">{b.label}</span>
        <span className={`rounded-full border px-3 py-0.5 text-sm ${b.vorhanden ? "border-ink" : "border-line text-muted-foreground"}`} data-testid={`status-${b.key}`}>
          {b.vorhanden ? "vorhanden" : "fehlt"}
        </span>
      </div>
      {b.vorhanden ? (
        <p className="text-sm text-muted-foreground">Quelle: {b.quellen.join(", ")}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Quelle wäre: {b.quelle}.{" "}
          <Link href={b.link} className="underline underline-offset-4">
            {b.werkzeugName} öffnen
          </Link>
        </p>
      )}
    </li>
  );
}

function Uebersicht({ einseiter }: { einseiter: Einseiter }) {
  const { betrieb } = einseiter;
  return (
    <section aria-labelledby="se-uebersicht" className="grid gap-3">
      <h4 id="se-uebersicht" className="font-heading text-lg font-medium">
        Deine Bausteine
      </h4>
      <p className="text-sm" data-testid="betrieb">
        {betrieb.firma ? (
          <>
            Betrieb: {[betrieb.firma, betrieb.ort].filter(Boolean).join(", ")}
            {betrieb.branche ? `, ${betrieb.branche}` : ""} (Firmenprofil)
          </>
        ) : (
          <>
            Betrieb: noch nicht im Firmenprofil.{" "}
            <Link href="/profil" className="underline underline-offset-4">
              Firmenprofil ergänzen
            </Link>
          </>
        )}
      </p>
      <p role="status" aria-live="polite" className="font-medium" data-testid="vollstaendigkeit">
        {vollstaendigkeit(einseiter)}
      </p>
      <ol aria-label="Bausteine" className="grid gap-2 sm:grid-cols-2">
        {einseiter.bausteine.map((b) => (
          <BausteinRow key={b.key} b={b} />
        ))}
      </ol>
    </section>
  );
}

function EinseiterFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const quellen = useQuellen();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  // Immer frisch aus dem Browser; der gespeicherte Stand merkt nur, dass der Einseiter einmal erstellt wurde.
  const einseiter = useMemo(() => collect(quellen.read, profile), [quellen, profile]);
  const allReady = ready && profileReady && quellen.ready;
  const showResult = allReady && (created || saved.output !== null);
  const doc = useMemo(() => (showResult ? toDocument(einseiter) : null), [showResult, einseiter]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (!shouldFocus.current || !doc) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [doc]);

  async function erstellen() {
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const now = new Date();
      shouldFocus.current = true;
      set(toState(einseiter, now));
      setCreated(true);
      void ctx.sendResult({ eingabe: eingabeText(einseiter), ausgabe: reportMarkdown(einseiter, now) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6" aria-busy={!allReady || busy}>
      <div className="content">
        <Intro />
      </div>

      {allReady && <Uebersicht einseiter={einseiter} />}

      {!showResult && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" disabled={!allReady || busy} onClick={() => void erstellen()} data-testid="erstellen">
            Einseiter erstellen
          </Button>
          <span className="text-sm text-muted-foreground">Geht auch mit null Bausteinen; dann stehen nur Platzhalter auf der Seite.</span>
        </div>
      )}

      {doc && (
        <ResultCard
          title="Deine Marketingstrategie auf einer Seite"
          headingRef={headingRef}
          actions={
            <>
              <DocumentExport model={doc} />
              <Button type="button" variant="outline" disabled={busy} onClick={() => void erstellen()} data-testid="neu-zusammenstellen">
                Neu zusammenstellen
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground" data-testid="hinweis-offen">
            {einseiter.vorhanden === einseiter.total
              ? "Alle acht Bausteine sind da."
              : "Platzhalter «Noch offen» füllst du über die Links in der Übersicht oben; danach «Neu zusammenstellen»."}
          </p>
          <DocView blocks={doc.blocks} />
        </ResultCard>
      )}
    </div>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <EinseiterFlow />
    </ToolShell>
  );
}
