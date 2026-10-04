// Brücke zur Anmeldung von Clerk im Browser.
//
// Clerk (clerk-js, von der Clerk-Domain geladen) soll nur laden, wenn es gebraucht wird:
//  - jemand klickt «Anmelden» oder «Registrieren»,
//  - der Browser trägt ein Sitzungs-Zeichen von Clerk (Cookie `__client_uat`): Dann hält clerk-js die Sitzung frisch.
// Besucher ohne Konto, also fast alle Aufrufe aus der Suche, laden Clerk nie und nehmen nie Kontakt zu Clerk auf.
//
// Die Komponenten der App kennen Clerk nicht. Sie rufen die Funktionen hier auf. `ClerkRoot` (lazy geladen) meldet
// sich mit `registerClerk` an, sobald Clerk bereit ist.

/** Der Teil von Clerk, den wir brauchen. */
export type ClerkApi = {
  loaded: boolean;
  addOnLoaded(callback: () => void): void;
  openSignIn(props?: Record<string, unknown>): void;
  openSignUp(props?: Record<string, unknown>): void;
  signOut(options?: { redirectUrl?: string }): Promise<void>;
  session?: { getToken(): Promise<string | null> } | null;
  /** Ist jemand angemeldet? (`undefined`: noch unbekannt) */
  user?: unknown;
  addListener?(callback: (resources: { user?: unknown }) => void, options?: { skipInitialEmit?: boolean }): () => void;
};

let api: ClerkApi | null = null;
let wanted = false;
const wantedListeners = new Set<() => void>();
let waiters: Array<(value: ClerkApi | null) => void> = [];

/** Ist Clerk in diesem Build eingerichtet? Der Schlüssel ist öffentlich und wird beim Bauen eingesetzt. */
export function clerkEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/** Trägt der Browser ein Sitzungs-Zeichen von Clerk? (`__client_uat` ist 0, solange niemand angemeldet ist.) */
export function hasSessionHint(cookie: string = typeof document === "undefined" ? "" : document.cookie): boolean {
  return cookie.split(";").some((part) => {
    const [name, value] = part.trim().split("=");
    return /^__client_uat(_.+)?$/.test(name ?? "") && /^\d+$/.test(value ?? "") && Number(value) > 0;
  });
}

export function isWanted(): boolean {
  return wanted;
}

export function subscribeWanted(callback: () => void): () => void {
  wantedListeners.add(callback);
  return () => wantedListeners.delete(callback);
}

function wantClerk(): void {
  if (wanted) return;
  wanted = true;
  wantedListeners.forEach((cb) => cb());
}

function settle(value: ClerkApi | null): void {
  const pending = waiters;
  waiters = [];
  pending.forEach((resolve) => resolve(value));
}

/** `ClerkRoot` meldet hier die Clerk-Instanz an (und beim Abbau null). */
export function registerClerk(clerk: ClerkApi | null): void {
  api = clerk;
  if (!clerk) return;
  if (clerk.loaded) settle(clerk);
  else clerk.addOnLoaded(() => settle(clerk));
}

/** Nur für Tests. */
export function resetClerkBridge(): void {
  api = null;
  wanted = false;
  waiters = [];
  wantedListeners.clear();
}

/** Lädt Clerk (falls nötig) und wartet, bis es bereit ist. null: nicht eingerichtet, nicht erreichbar oder zu langsam. */
export function loadClerk(timeoutMs = 10_000): Promise<ClerkApi | null> {
  if (!clerkEnabled()) return Promise.resolve(null);
  if (api?.loaded) return Promise.resolve(api);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== done);
      resolve(null);
    }, timeoutMs);
    const done = (value: ClerkApi | null) => {
      clearTimeout(timer);
      resolve(value);
    };
    waiters.push(done);
    wantClerk();
  });
}

/**
 * Wer ein Sitzungs-Zeichen trägt, wartet, bis Clerk die Sitzung aufgefrischt hat. Das Sitzungs-Cookie von Clerk gilt nur
 * eine Minute und wird vom Browser-Teil erneuert; ohne das sähe der Server die Person als abgemeldet.
 * Ohne Zeichen kehrt die Funktion sofort zurück. Wirft nie.
 */
export async function whenSessionReady(timeoutMs = 8_000): Promise<void> {
  if (!clerkEnabled() || !hasSessionHint()) return;
  try {
    const clerk = await loadClerk(timeoutMs);
    await clerk?.session?.getToken();
  } catch {
    /* ohne frische Sitzung gilt die Person als abgemeldet, mehr nicht */
  }
}

export type SignInMode = "anmelden" | "registrieren";

/** Öffnet das Fenster von Clerk. Danach kehrt die Person zu `returnUrl` zurück. false: Clerk war nicht bereit. */
export async function openSignIn(mode: SignInMode, returnUrl: string): Promise<boolean> {
  const clerk = await loadClerk();
  if (!clerk) return false;
  try {
    // Meldet sich die Person im Fenster an (E-Mail-Code, ohne die Seite zu verlassen), wechselt Clerk die Seite nur sanft.
    // Wir laden die Zielseite ganz neu: Dann lesen Kopfzeile und Werkzeug den neuen Stand und werten `?konto=ok` aus.
    // Wer schon angemeldet ist, braucht das nicht; sonst gilt jede Meldung mit einer Person als «hat sich angemeldet».
    if (!clerk.user) {
      const off = clerk.addListener?.(
        ({ user }) => {
          if (!user) return;
          off?.();
          window.location.assign(returnUrl);
        },
        { skipInitialEmit: true },
      );
    }
    if (mode === "registrieren") {
      clerk.openSignUp({ forceRedirectUrl: returnUrl, signInForceRedirectUrl: returnUrl });
    } else {
      clerk.openSignIn({ forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl, withSignUp: true });
    }
    return true;
  } catch {
    return false;
  }
}

/** Meldet bei Clerk ab (Sitzung beenden, Cookies entfernen). false: es hat nicht geklappt. */
export async function signOut(redirectUrl: string): Promise<boolean> {
  const clerk = await loadClerk();
  if (!clerk) return false;
  try {
    await clerk.signOut({ redirectUrl });
    return true;
  } catch {
    return false;
  }
}
