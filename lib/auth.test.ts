import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authConfigured, getAccount, getAuth, resetAuth } from "@/lib/auth";

const ENV = {
  GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "secret",
  BETTER_AUTH_SECRET: "a-random-secret-with-at-least-32-characters-0123456789",
};

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
}

beforeEach(() => {
  vi.unstubAllEnvs();
  setEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, BETTER_AUTH_SECRET: undefined, BETTER_AUTH_URL: "http://localhost:3000" });
  resetAuth();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetAuth();
});

describe("authConfigured", () => {
  it("braucht Client-ID, Client-Secret und ein Sitzungs-Secret von mindestens 32 Zeichen", () => {
    expect(authConfigured(ENV)).toBe(true);
    expect(authConfigured({})).toBe(false);
    for (const key of Object.keys(ENV)) expect(authConfigured({ ...ENV, [key]: "" })).toBe(false);
    expect(authConfigured({ ...ENV, BETTER_AUTH_SECRET: "zu-kurz" })).toBe(false);
  });
});

describe("getAuth und getAccount", () => {
  it("sind aus, solange nichts eingerichtet ist", async () => {
    expect(getAuth()).toBeNull();
    expect(await getAccount(new Headers({ cookie: "better-auth.session_token=x" }))).toBeNull();
  });

  it("liefern ohne gültiges Sitzungs-Cookie keine Person, auch nicht mit einem gefälschten", async () => {
    setEnv(ENV);
    expect(getAuth()).not.toBeNull();
    expect(await getAccount(new Headers())).toBeNull();
    expect(await getAccount(new Headers({ cookie: "better-auth.session_token=gefaelscht.abc; better-auth.session_data=eyJ4Ijox" }))).toBeNull();
  });

  it("antworten über den Handler auf Anfragen ohne Sitzung mit «keine Sitzung»", async () => {
    setEnv(ENV);
    const res = await getAuth()!.handler(new Request("http://localhost:3000/api/auth/get-session"));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("starten die Google-Anmeldung mit der Weiterleitung zu Google", async () => {
    setEnv(ENV);
    const res = await getAuth()!.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ provider: "google", callbackURL: "/tools/digitaler-auftritt-check?konto=ok" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { url?: string; redirect?: boolean };
    expect(data.url).toContain("accounts.google.com");
    expect(data.url).toContain("client_id=id.apps.googleusercontent.com");
    expect(data.url).toContain(encodeURIComponent("http://localhost:3000/api/auth/callback/google"));
    expect(data.url).toContain("prompt=select_account");
  });
});
