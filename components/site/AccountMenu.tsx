"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { SignInMode } from "@/components/site/SignInDialog";
import { Button } from "@/components/ui/button";
import { initialOf, signOutAccount } from "@/lib/account-client";
import { useAccount } from "@/lib/use-account";

// Das Fenster (Dialog-Bibliothek) wird erst geladen, wenn jemand «Anmelden» anklickt: Es soll keine Seite verlangsamen.
const SignInDialog = dynamic(() => import("@/components/site/SignInDialog").then((m) => m.SignInDialog), { ssr: false });

type Banner = { kind: "ok" | "fehler"; text: string } | null;

const BANNER_TEXT = {
  ok: "Du bist angemeldet.",
  fehler: "Die Anmeldung hat nicht geklappt oder wurde abgebrochen. Du kannst es noch einmal versuchen.",
} as const;

/**
 * Konto in der Kopfzeile. Ist die Anmeldung nicht eingerichtet, bleibt der Link «Mein Profil» wie bisher.
 * Sonst: Besucher sehen «Anmelden» und «Registrieren», Angemeldete ein Menü mit «Mein Profil» und «Abmelden».
 */
export function AccountMenu() {
  const info = useAccount();
  const pathname = usePathname();
  const [dialog, setDialog] = useState<{ open: boolean; mode: SignInMode }>({ open: false, mode: "anmelden" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [signOutError, setSignOutError] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Rückkehr von Google: Parameter aus der Adresse nehmen und eine Meldung zeigen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("anmeldung");
    if (value !== "ok" && value !== "fehler") return;
    params.delete("anmeldung");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    setBanner({ kind: value, text: BANNER_TEXT[value] });
  }, []);

  useEffect(() => {
    if (banner?.kind !== "ok") return;
    const t = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(t);
  }, [banner]);

  // Menü schliessen: Seitenwechsel, Escape, Klick daneben.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  async function signOut() {
    setSignOutError(false);
    if (await signOutAccount()) window.location.reload();
    else setSignOutError(true);
  }

  const [dialogUsed, setDialogUsed] = useState(false);
  const open = (mode: SignInMode) => {
    setDialogUsed(true);
    setDialog({ open: true, mode });
  };

  let content: React.ReactNode;
  if (info === undefined) {
    content = <span aria-hidden className="inline-block h-11 w-11" />;
  } else if (info === null || info.login === null) {
    content = (
      <Link
        href="/profil"
        className="inline-flex h-11 items-center whitespace-nowrap rounded-full border border-line-strong px-4 text-[0.95rem] font-medium transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-page sm:px-5"
      >
        Mein Profil
      </Link>
    );
  } else if (!info.account) {
    content = (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" className="px-4 sm:px-5" onClick={() => open("anmelden")}>
          Anmelden
        </Button>
        <Button type="button" className="hidden sm:inline-flex" onClick={() => open("registrieren")}>
          Registrieren
        </Button>
      </div>
    );
  } else {
    const { name, email } = info.account;
    content = (
      <div ref={box} className="relative">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="account-menu"
          aria-label={`Konto von ${name}`}
          data-testid="account-button"
          onClick={() => setMenuOpen((o) => !o)}
          className="grid size-11 place-items-center rounded-full bg-ink text-base font-medium text-page outline-none transition-colors duration-300 hover:bg-navy-2 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {initialOf(name, email)}
        </button>
        {menuOpen && (
          <div id="account-menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-paper p-2 shadow-[0_2px_4px_rgb(0_0_0/0.06)]">
            <div className="border-b border-line px-3 pb-3 pt-2">
              <p className="truncate font-medium">{name}</p>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            </div>
            <ul className="grid pt-1">
              <li>
                <Link href="/profil" className="block rounded-lg px-3 py-3 hover:bg-surface">
                  Mein Profil
                </Link>
              </li>
              <li>
                <button type="button" onClick={() => void signOut()} className="block w-full rounded-lg px-3 py-3 text-left hover:bg-surface">
                  Abmelden
                </button>
              </li>
            </ul>
            {signOutError && (
              <p role="alert" className="px-3 pb-2 text-sm text-destructive">
                Das Abmelden hat nicht geklappt. Bitte versuch es noch einmal.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {content}
      {dialogUsed && <SignInDialog open={dialog.open} mode={dialog.mode} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />}
      {banner && (
        <div
          role="status"
          className={`fixed inset-x-0 top-[4.5rem] z-30 border-b border-line px-5 py-3 text-center text-sm ${banner.kind === "fehler" ? "bg-paper text-destructive" : "bg-surface"}`}
        >
          {banner.text}{" "}
          <button type="button" onClick={() => setBanner(null)} className="ml-2 underline underline-offset-4">
            Schliessen
          </button>
        </div>
      )}
    </>
  );
}
