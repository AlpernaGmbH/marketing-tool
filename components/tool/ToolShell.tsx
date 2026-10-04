"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LeadGate, type LeadGateReason } from "@/components/tool/LeadGate";
import { ProfileBanner } from "@/components/tool/ProfileBanner";
import { checkAccess, completeRun as completeRunApi } from "@/lib/access-client";

type ToolContextValue = {
  slug: string;
  /** Freigeschaltet (Formular ausgefüllt): alle Werkzeuge und Downloads offen. */
  unlocked: boolean;
  /**
   * Vor dem Tool-Start aufrufen. true: starten. false: Besucher hat das Formular geschlossen.
   * Ist der freie Durchlauf verbraucht, öffnet sich das LeadGate und die Funktion wartet darauf.
   */
  requestStart: () => Promise<boolean>;
  /** Nach dem sichtbaren Ergebnis aufrufen: zählt den Durchlauf. */
  completeRun: () => Promise<void>;
  /** Download-Knöpfe: führt `action` aus, sobald freigeschaltet. Sonst erst LeadGate, dann `action`. */
  guardDownload: (action: () => void | Promise<void>) => void;
};

const ToolContext = createContext<ToolContextValue | null>(null);

export function useToolContext(): ToolContextValue {
  const ctx = useContext(ToolContext);
  if (!ctx) throw new Error("useToolContext braucht eine ToolShell darüber");
  return ctx;
}

type Props = {
  slug: string;
  name: string;
  /** true bei Tools, die das Firmenprofil lesen (zeigt das ProfileBanner). */
  usesProfile?: boolean;
  children: React.ReactNode;
};

/** Rahmen jedes Tools: Kopf mit Status, Profil-Hinweis, Inhalt und das LeadGate. */
export function ToolShell({ slug, name, usesProfile = false, children }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [gate, setGate] = useState<{ open: boolean; reason: LeadGateReason }>({ open: false, reason: "zweites_tool" });
  const waiting = useRef<((ok: boolean) => void) | null>(null);

  // Status für die Kopfzeile. Schlägt der Aufruf fehl, bleibt «Freier Durchlauf» stehen.
  useEffect(() => {
    let alive = true;
    checkAccess(slug).then((a) => alive && setUnlocked(a.unlocked));
    return () => {
      alive = false;
    };
  }, [slug]);

  const settle = useCallback((ok: boolean) => {
    waiting.current?.(ok);
    waiting.current = null;
  }, []);

  const openGate = useCallback(
    (reason: LeadGateReason) =>
      new Promise<boolean>((resolve) => {
        waiting.current?.(false); // ein früheres, noch offenes Warten beenden
        waiting.current = resolve;
        setGate({ open: true, reason });
      }),
    [],
  );

  const requestStart = useCallback(async () => {
    const access = await checkAccess(slug);
    setUnlocked(access.unlocked);
    return access.allowed ? true : openGate("zweites_tool");
  }, [slug, openGate]);

  const completeRun = useCallback(async () => {
    if (await completeRunApi(slug)) setUnlocked(true);
  }, [slug]);

  const guardDownload = useCallback(
    (action: () => void | Promise<void>) => {
      void (async () => {
        if (unlocked) return void (await action());
        const access = await checkAccess(slug);
        if (access.unlocked) {
          setUnlocked(true);
          return void (await action());
        }
        if (await openGate("download")) await action();
      })();
    },
    [unlocked, slug, openGate],
  );

  const value = useMemo<ToolContextValue>(
    () => ({ slug, unlocked, requestStart, completeRun, guardDownload }),
    [slug, unlocked, requestStart, completeRun, guardDownload],
  );

  return (
    <ToolContext.Provider value={value}>
      <section aria-label={name} className="overflow-hidden rounded-xl border border-line bg-paper">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 text-sm">
          <span className="font-medium">{name}</span>
          <span aria-live="polite" data-testid="access-status" className="text-muted-foreground">
            {unlocked ? "Freigeschaltet" : "Freier Durchlauf"}
          </span>
        </div>
        {usesProfile && <ProfileBanner />}
        <div className="p-5 md:p-8">{children}</div>
      </section>
      <LeadGate
        open={gate.open}
        reason={gate.reason}
        tool={slug}
        onOpenChange={(open) => {
          setGate((g) => ({ ...g, open }));
          if (!open) settle(false);
        }}
        onSuccess={() => {
          setUnlocked(true);
          settle(true);
        }}
      />
    </ToolContext.Provider>
  );
}
