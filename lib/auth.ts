import { auth, clerkClient } from "@clerk/nextjs/server";

// Konto-Anmeldung (Zugang v2). Die Anmeldung selbst macht Clerk (Google, Microsoft, Apple, E-Mail-Code).
// Wir halten keine Passwörter und keine Benutzerliste. Serverseitig fragen wir nur: Wer ist das, und ist die
// E-Mail-Adresse bestätigt? Die Kennung eines Kontos bleibt der HMAC dieser Adresse (lib/access.ts), egal über
// welchen Anbieter sich die Person anmeldet. Freischaltung und Daten gehören so zur Person, nicht zum Anbieter.
// Ohne Clerk-Schlüssel ist die Anmeldung aus; Besucher sehen dann weiter das Formular.

export type Account = { email: string; name: string };

type Env = Record<string, string | undefined>;

/** Sind beide Clerk-Schlüssel gesetzt? */
export function authConfigured(env: Env = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY);
}

// Die Adresse und der Name kommen von der Backend-Schnittstelle von Clerk (eine Anfrage). Damit nicht jeder Abgleich der
// Daten eine solche Anfrage auslöst, merkt sich die Funktion das Ergebnis kurz im Arbeitsspeicher der Instanz.
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; account: Account }>();

/** Nur für Tests. */
export function resetAccountCache(): void {
  cache.clear();
}

function remember(userId: string, account: Account, now: number): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(userId, { at: now, account });
}

/**
 * Angemeldete Person aus der Sitzung von Clerk (Cookie `__session`, geprüft in `clerkMiddleware`).
 * null ohne gültige Sitzung, ohne bestätigte E-Mail-Adresse oder wenn die Anmeldung aus ist. Wirft nie.
 */
export async function getAccount(now = Date.now()): Promise<Account | null> {
  if (!authConfigured()) return null;
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const hit = cache.get(userId);
    if (hit && now - hit.at < CACHE_MS) return hit.account;
    const user = await (await clerkClient()).users.getUser(userId);
    const primary = user.primaryEmailAddress;
    // Nur bestätigte Adressen: Sie sind die Kennung des Kontos. Eine unbestätigte Adresse könnte jemand anderem gehören.
    const email = primary?.verification?.status === "verified" ? primary.emailAddress.trim().toLowerCase() : "";
    if (!email) return null;
    const account = { email, name: user.fullName?.trim() || email };
    remember(userId, account, now);
    return account;
  } catch {
    return null;
  }
}
