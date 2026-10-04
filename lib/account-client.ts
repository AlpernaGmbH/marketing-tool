import { signOut } from "@/lib/clerk-bridge";

// Browser-Seite von /api/account: Wer ist angemeldet? Und Abmelden. Keine Funktion wirft.

export type AccountInfo = {
  /** Angebotener Anmeldeweg; null: Anmeldung ist nicht eingerichtet. */
  login: "clerk" | null;
  account: { name: string; email: string } | null;
  /** Die Daten (Profil, Merkliste, Zwischenstände) können beim Konto liegen. Sonst bleiben sie im Browser. */
  storage: boolean;
};

export async function fetchAccountInfo(fetchImpl: typeof fetch = fetch): Promise<AccountInfo | null> {
  try {
    const res = await fetchImpl("/api/account", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AccountInfo>;
    const a = data.account;
    const account = a && typeof a.name === "string" && typeof a.email === "string" ? { name: a.name, email: a.email } : null;
    return { login: data.login === "clerk" ? "clerk" : null, account, storage: data.storage === true };
  } catch {
    return null;
  }
}

/** Meldet ab (Sitzung bei Clerk beenden, Cookies entfernen). Clerk lädt dafür bei Bedarf. */
export async function signOutAccount(): Promise<boolean> {
  const here = typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
  return signOut(here);
}

/** Anfangsbuchstabe für das Konto-Symbol. */
export function initialOf(name: string, email: string): string {
  const first = (name.trim() || email.trim()).charAt(0);
  return first ? first.toLocaleUpperCase("de-CH") : "?";
}
