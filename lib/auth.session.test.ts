import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccount, getAuth, resetAuth } from "@/lib/auth";

// Simulierter Google-Login (Token-Austausch gemockt). Belegt, wie lange die Sitzung hält: Ohne session.expiresIn
// wären es 7 Tage, CLAUDE.md und die Datenschutzerklärung nennen 30.

const DAY = 86_400_000;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function cookieJar(setCookies: string[]): Map<string, string> {
  const jar = new Map<string, string>();
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return jar;
}
const header = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function signIn() {
  const auth = getAuth()!;
  const start = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ provider: "google", callbackURL: "/tools/x?konto=ok", errorCallbackURL: "/tools/x?konto=fehler" }),
    }),
  );
  const state = new URL(((await start.json()) as { url: string }).url).searchParams.get("state")!;

  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const now = Math.floor(Date.now() / 1000);
      const idToken = `${b64({ alg: "RS256", kid: "k" })}.${b64({
        iss: "https://accounts.google.com",
        aud: "cid.apps.googleusercontent.com",
        sub: "123",
        email: "Anna@Keller.ch",
        email_verified: true,
        name: "Anna Keller",
        iat: now,
        exp: now + 3600,
      })}.sig`;
      return new Response(JSON.stringify({ access_token: "at", id_token: idToken, token_type: "Bearer", expires_in: 3600, scope: "openid email profile" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  });

  const callback = await auth.handler(
    new Request(`http://localhost:3000/api/auth/callback/google?code=abc&state=${state}`, { headers: { cookie: header(cookieJar(start.headers.getSetCookie())) } }),
  );
  const jar = cookieJar(callback.headers.getSetCookie());
  for (const k of [...jar.keys()]) if (k.includes("state") || k.includes("pkce")) jar.delete(k);
  return { jar, maxAges: callback.headers.getSetCookie().map((c) => ({ name: c.split("=")[0], maxAge: Number(/Max-Age=(\d+)/i.exec(c)?.[1] ?? 0) })) };
}

describe("Sitzung nach der Google-Anmeldung", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-random-secret-with-at-least-32-characters-0123456789");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    resetAuth();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetAuth();
  });

  it("liefert Name und kleingeschriebene E-Mail der bestätigten Person", async () => {
    const { jar } = await signIn();
    expect(await getAccount(new Headers({ cookie: header(jar) }))).toEqual({ email: "anna@keller.ch", name: "Anna Keller" });
  });

  it("hält 30 Tage und nicht nur 7", async () => {
    const { jar, maxAges } = await signIn();
    expect(maxAges.find((c) => c.name.endsWith("session_token"))?.maxAge).toBe(30 * 86_400);
    const headers = new Headers({ cookie: header(jar) });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * DAY);
    expect(await getAccount(headers)).not.toBeNull();
    vi.setSystemTime(Date.now() + 21 * DAY); // 29 Tage nach der Anmeldung
    expect(await getAccount(headers)).not.toBeNull();
    vi.setSystemTime(Date.now() + 2 * DAY); // 31 Tage
    expect(await getAccount(headers)).toBeNull();
  });
});
