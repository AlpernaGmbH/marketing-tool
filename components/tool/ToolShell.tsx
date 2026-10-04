"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LeadGate, type LeadGateReason } from "@/components/tool/LeadGate";
import { ProfileBanner } from "@/components/tool/ProfileBanner";
import { checkAccess, completeRun as completeRunApi, unlockWithAccount, type LoginProvider } from "@/lib/access-client";
import { clearPending, readPending } from "@/lib/konto-client";

type ToolContextValue = {
  slug: string;
  /** Freigeschaltet (Formular ausgefüllt): alle Werkzeuge und Downloads offen. */
  unlocked: boolean;
  /** Angemeldet mit einem Konto (Google). Nur dann gibt es die KI-Einordnung. */
  signedIn: boolean;
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
  const [login, setLogin] = useState<LoginProvider | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [gate, setGate] = useState<{ open: boolean; reason: LeadGateReason }>({ open: false, reason: "zweites_tool" });
  const waiting = useRef<((ok: boolean) => void) | null>(null);

  // Status für die Kopfzeile. Schlägt der Aufruf fehl, bleibt «Freier Durchlauf» stehen.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Rückkehr von Google (?konto=ok oder ?konto=fehler): erst abschliessen, dann den Status lesen.
      const params = new URLSearchParams(window.location.search);
      const konto = params.get("konto");
      if (konto === "ok" || konto === "fehler") {
        const pending = readPending();
        params.delete("konto");
        const query = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
        if (konto === "fehler") {
          clearPending();
          if (alive) setNotice("Die Anmeldung hat nicht geklappt oder wurde abgebrochen. Du kannst es noch einmal versuchen.");
        } else if (pending && pending.tool === slug) {
          const result = await unlockWithAccount(slug, pending.firma);
          if (result === "ok") {
            clearPending();
            if (alive) setNotice("Du bist angemeldet, alle Werkzeuge und Downloads sind offen.");
          } else if (result === "not_signed_in") {
            clearPending();
            if (alive) setNotice("Die Anmeldung ist nicht angekommen. Du kannst es noch einmal versuchen.");
          } else if (alive) {
            setNotice("Das Freischalten hat nicht geklappt. Bitte versuch es noch einmal.");
          }
        }
      }
      const a = await checkAccess(slug);
      if (alive) {
        setUnlocked(a.unlocked);
        setLogin(a.login);
        setSignedIn(a.signedIn);
      }
    })();
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
    setLogin(access.login);
    setSignedIn(access.signedIn);
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
        setLogin(access.login);
        setSignedIn(access.signedIn);
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
    () => ({ slug, unlocked, signedIn, requestStart, completeRun, guardDownload }),
    [slug, unlocked, signedIn, requestStart, completeRun, guardDownload],
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
        {notice && (
          <p role="status" className="border-b border-line bg-surface px-5 py-3 text-sm">
            {notice}
          </p>
        )}
        {usesProfile && <ProfileBanner />}
        <div className="p-5 md:p-8">{children}</div>
      </section>
      <LeadGate
        open={gate.open}
        reason={gate.reason}
        tool={slug}
        login={login}
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
