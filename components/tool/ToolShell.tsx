"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { LeadGate } from "@/components/tool/LeadGate";
import { ProfileBanner } from "@/components/tool/ProfileBanner";
import { LEAD_KEY, sendResult as sendResultApi } from "@/lib/access-client";
import { removeLocal, writeLocal } from "@/lib/storage";
import { useLocalRaw } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";

export type ResultInput = { eingabe: string; ausgabe: string };

type ToolContextValue = {
  slug: string;
  /** Adresse, an die Ergebnisse gehen; null, solange keine angegeben ist. */
  email: string | null;
  /**
   * Vor dem ersten Ergebnis und vor jedem Aufruf einer Server-Route aufrufen. true: Adresse bekannt (oder gerade angegeben).
   * false: Besucher hat das Fenster geschlossen.
   */
  ensureEmail: () => Promise<boolean>;
  /**
   * Der Server kennt keine Adresse mehr (403 «gate»: Cookie fehlt oder abgelaufen), obwohl der Browser eine gemerkt hat.
   * Vergisst den lokalen Merker und zeigt das Fenster. true: neue Adresse angegeben, Aufruf wiederholen.
   */
  renewEmail: () => Promise<boolean>;
  /** Nach dem sichtbaren Ergebnis aufrufen: schickt Werkzeug, Eingabe und Ausgabe mit der Adresse an Alperna (CRM). */
  sendResult: (r: ResultInput) => Promise<void>;
  /** Download-Knöpfe: führt `action` aus, sobald eine Adresse bekannt ist. Sonst erst das Fenster, dann `action`. */
  guardDownload: (action: () => void | Promise<void>) => void;
  /** Öffnet das Fenster, um die Adresse zu ändern. */
  changeEmail: () => void;
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

/** Rahmen jedes Tools: Kopf mit der Adresse, Profil-Hinweis, Inhalt und das E-Mail-Fenster. */
export function ToolShell({ slug, name, usesProfile = false, children }: Props) {
  const raw = useLocalRaw(LEAD_KEY);
  const email = raw && raw.includes("@") ? raw : null;
  const { profile } = useProfile();
  const [gateOpen, setGateOpen] = useState(false);
  const waiting = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    waiting.current?.(ok);
    waiting.current = null;
  }, []);

  const openGate = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        waiting.current?.(false); // ein früheres, noch offenes Warten beenden
        waiting.current = resolve;
        setGateOpen(true);
      }),
    [],
  );

  const ensureEmail = useCallback(async () => (email ? true : openGate()), [email, openGate]);

  const renewEmail = useCallback(async () => {
    removeLocal(LEAD_KEY);
    return openGate();
  }, [openGate]);

  const sendResult = useCallback(
    async (r: ResultInput) => {
      const body = { ...r, tool: slug, firma: profile.firma?.trim() || undefined };
      const first = await sendResultApi(body);
      if (first !== "gate") return;
      if (await renewEmail()) await sendResultApi(body);
    },
    [slug, profile.firma, renewEmail],
  );

  const guardDownload = useCallback(
    (action: () => void | Promise<void>) => {
      void (async () => {
        if (await ensureEmail()) await action();
      })();
    },
    [ensureEmail],
  );

  const changeEmail = useCallback(() => void openGate(), [openGate]);

  const value = useMemo<ToolContextValue>(
    () => ({ slug, email, ensureEmail, renewEmail, sendResult, guardDownload, changeEmail }),
    [slug, email, ensureEmail, renewEmail, sendResult, guardDownload, changeEmail],
  );

  return (
    <ToolContext.Provider value={value}>
      <section aria-label={name} className="overflow-hidden rounded-xl border border-line bg-paper">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 text-sm">
          <span className="font-medium">{name}</span>
          <span aria-live="polite" data-testid="access-status" className="text-right text-muted-foreground">
            {email ? (
              <>
                Ergebnisse gehen an <span className="text-foreground">{email}</span>
                {" · "}
                <button type="button" onClick={changeEmail} className="underline underline-offset-4">
                  ändern
                </button>
              </>
            ) : (
              "Ergebnis gegen E-Mail-Adresse"
            )}
          </span>
        </div>
        {usesProfile && <ProfileBanner />}
        <div className="p-5 md:p-8">{children}</div>
      </section>
      <LeadGate
        open={gateOpen}
        tool={slug}
        email={email}
        onOpenChange={(open) => {
          setGateOpen(open);
          if (!open) settle(false);
        }}
        onSuccess={(address) => {
          writeLocal(LEAD_KEY, address);
          settle(true);
        }}
      />
    </ToolContext.Provider>
  );
}
