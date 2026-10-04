import { betterAuth } from "better-auth";

// Konto-Anmeldung (Zugang v2). Better Auth im Stateless-Modus: keine Datenbank, die Sitzung steckt in einem
// verschlüsselten Cookie (JWE). Serverseitig liegen nur Freischaltung und Kontingente in Redis (lib/access.ts).
// Ohne Google-Zugang und Secret ist die Anmeldung aus; Besucher sehen dann weiter das Formular.

export type Account = { email: string; name: string };

type Env = Record<string, string | undefined>;

/** Sind Google-Zugang und Sitzungs-Secret gesetzt? */
export function authConfigured(env: Env = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length >= 32);
}

function create(env: Env) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
        // Konto wählen lassen: Wer mehrere Google-Konten hat, soll nicht still mit dem falschen angemeldet werden.
        prompt: "select_account",
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 30 * 24 * 60 * 60, strategy: "jwe", refreshCache: true },
    },
    account: { storeStateStrategy: "cookie", storeAccountCookie: true },
    // Harte Regel 1: Server loggen nie Inhalte. Die Route /api/auth loggt Statuscodes selbst.
    logger: { disabled: true },
  });
}

type Auth = ReturnType<typeof create>;
let instance: Auth | null | undefined;

/** Die Auth-Instanz oder null, wenn die Anmeldung nicht eingerichtet ist. */
export function getAuth(): Auth | null {
  if (instance === undefined) instance = authConfigured() ? create(process.env) : null;
  return instance;
}

/** Nur für Tests. */
export function resetAuth(): void {
  instance = undefined;
}

/** Angemeldete Person aus dem Sitzungs-Cookie. null ohne gültige Sitzung oder wenn die Anmeldung aus ist. */
export async function getAccount(headers: Headers): Promise<Account | null> {
  const auth = getAuth();
  if (!auth) return null;
  try {
    const session = await auth.api.getSession({ headers });
    const email = session?.user?.email?.trim().toLowerCase();
    if (!session || !email || session.user.emailVerified === false) return null;
    return { email, name: session.user.name?.trim() || email };
  } catch {
    return null;
  }
}
