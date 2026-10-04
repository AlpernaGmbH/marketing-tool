// Browser-Seite von /api/account: Wer ist angemeldet? Und Abmelden. Keine Funktion wirft.

export type AccountInfo = {
  /** Angebotener Anmeldeweg; null: Anmeldung ist nicht eingerichtet. */
  login: "google" | null;
  account: { name: string; email: string } | null;
};

export async function fetchAccountInfo(fetchImpl: typeof fetch = fetch): Promise<AccountInfo | null> {
  try {
    const res = await fetchImpl("/api/account", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AccountInfo>;
    const a = data.account;
    const account = a && typeof a.name === "string" && typeof a.email === "string" ? { name: a.name, email: a.email } : null;
    return { login: data.login === "google" ? "google" : null, account };
  } catch {
    return null;
  }
}

/** Meldet ab (löscht das Sitzungs-Cookie). Die Bibliothek lädt erst beim Klick. */
export async function signOutAccount(): Promise<boolean> {
  try {
    const { createAuthClient } = await import("better-auth/client");
    const { error } = await createAuthClient().signOut();
    return !error;
  } catch {
    return false;
  }
}

/** Anfangsbuchstabe für das Konto-Symbol. */
export function initialOf(name: string, email: string): string {
  const first = (name.trim() || email.trim()).charAt(0);
  return first ? first.toLocaleUpperCase("de-CH") : "?";
}
