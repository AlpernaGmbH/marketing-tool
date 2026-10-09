"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LeadGate } from "@/components/tool/LeadGate";
import { ProfileBanner } from "@/components/tool/ProfileBanner";
import { DEFAULT_LOADING_STEPS, ToolLoading } from "@/components/tool/ToolLoading";
import { LEAD_KEY, fetchGateEmail, sendResult as sendResultApi } from "@/lib/access-client";
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
  /**
   * Zeigt die Ladeanzeige statt des Werkzeugs (die Eingaben bleiben erhalten) und gibt die Funktion zurück, die sie wieder beendet.
   * Läuft schon eine Anzeige, gilt die erste; die zweite Beendigung tut nichts. Immer im `finally` beenden.
   */
  startLoading: (steps?: string[]) => () => void;
};

const ToolContext = createContext<ToolContextValue | null>(null);

export function useToolContext(): ToolContextValue {
  const ctx = useContext(ToolContext);
  if (!ctx) throw new Error("useToolContext braucht eine ToolShell darüber");
  return ctx;
}

/** Wie useToolContext, aber null ausserhalb einer ToolShell (Bausteine, die auch ohne E-Mail-Fenster eine Seite tragen). */
export function useOptionalToolContext(): ToolContextValue | null {
  return useContext(ToolContext);
}

type Props = {
  slug: string;
  name: string;
  /** true bei Tools, die das Firmenprofil lesen (zeigt das ProfileBanner). */
  usesProfile?: boolean;
  /** Ohne Rahmen und Kopf: nur der Kontext (E-Mail-Fenster, Ladeanzeige) für eine Seite wie das Firmenprofil. */
  bare?: boolean;
  children: React.ReactNode;
};

/** Rahmen jedes Tools: Kopf mit der Adresse, Profil-Hinweis, Inhalt und das E-Mail-Fenster. */
export function ToolShell({ slug, name, usesProfile = false, bare = false, children }: Props) {
  const raw = useLocalRaw(LEAD_KEY);
  const email = raw && raw.includes("@") ? raw : null;
  // Die bekannte Adresse zusätzlich als Ref: Ein Handler, der vor dem Fenster erzeugt wurde (alte Closure), fragt sonst
  // nach dem Absenden ein zweites Mal (zum Beispiel ensureEmail() im Werkzeug und gleich danach in useGenerator).
  const known = useRef<string | null>(email);
  useEffect(() => {
    known.current = email;
  }, [email]);
  // Der lokale Merker kann fehlen, obwohl das Cookie noch gilt (Safari räumt Speicher ab, «Alles löschen» im Profil, anderer Browserbereich):
  // Dann fragt der Browser den Server, welche Adresse er kennt, statt das Fenster erneut zu zeigen.
  useEffect(() => {
    if (raw !== null) return; // noch nicht hydriert (undefined) oder schon eine Adresse da
    let cancelled = false;
    void fetchGateEmail().then((address) => {
      if (!cancelled && address && !known.current) writeLocal(LEAD_KEY, address);
    });
    return () => {
      cancelled = true;
    };
  }, [raw]);
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

  const ensureEmail = useCallback(async () => (known.current ? true : openGate()), [openGate]);

  const renewEmail = useCallback(async () => {
    known.current = null;
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

  const [loading, setLoading] = useState<string[] | null>(null);
  const loadingId = useRef<number | null>(null);
  const loadingSeq = useRef(0);
  const startLoading = useCallback((steps?: string[]) => {
    if (loadingId.current !== null) return () => {};
    const id = ++loadingSeq.current;
    loadingId.current = id;
    setLoading(steps && steps.length >= 2 ? steps : DEFAULT_LOADING_STEPS);
    return () => {
      if (loadingId.current !== id) return;
      loadingId.current = null;
      setLoading(null);
    };
  }, []);

  const value = useMemo<ToolContextValue>(
    () => ({ slug, email, ensureEmail, renewEmail, sendResult, guardDownload, changeEmail, startLoading }),
    [slug, email, ensureEmail, renewEmail, sendResult, guardDownload, changeEmail, startLoading],
  );

  const content = bare ? (
    <>
      {loading && <ToolLoading steps={loading} />}
      <div hidden={loading !== null}>{children}</div>
    </>
  ) : (
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
        <div className="p-5 md:p-8">
          {loading && <ToolLoading steps={loading} />}
          {/* Beim Laden nur ausgeblendet, nicht entfernt: Eingaben und Zwischenstand bleiben erhalten. */}
          <div hidden={loading !== null}>{children}</div>
        </div>
    </section>
  );

  return (
    <ToolContext.Provider value={value}>
      {content}
      <LeadGate
        open={gateOpen}
        tool={slug}
        email={email}
        onOpenChange={(open) => {
          setGateOpen(open);
          if (!open) settle(false);
        }}
        onSuccess={(address) => {
          known.current = address;
          writeLocal(LEAD_KEY, address);
          settle(true);
        }}
      />
    </ToolContext.Provider>
  );
}
