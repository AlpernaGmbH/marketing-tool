import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  userId: null as string | null,
  user: null as null | Record<string, unknown>,
  getUser: vi.fn(),
  authThrows: false,
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => {
    if (clerk.authThrows) throw new Error("clerkMiddleware fehlt");
    return { userId: clerk.userId };
  },
  clerkClient: async () => ({ users: { getUser: clerk.getUser } }),
}));

import { authConfigured, getAccount, resetAccountCache } from "@/lib/auth";

const verified = (address: string) => ({ emailAddress: address, verification: { status: "verified" } });
const userOf = (over: Record<string, unknown> = {}) => ({ primaryEmailAddress: verified(" Anna@Keller.ch "), fullName: "Anna Keller", ...over });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  clerk.userId = "user_1";
  clerk.authThrows = false;
  clerk.getUser.mockReset();
  clerk.getUser.mockResolvedValue(userOf());
  resetAccountCache();
});

describe("authConfigured", () => {
  it("braucht den öffentlichen und den geheimen Schlüssel von Clerk", () => {
    expect(authConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk", CLERK_SECRET_KEY: "sk" })).toBe(true);
    expect(authConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk" })).toBe(false);
    expect(authConfigured({ CLERK_SECRET_KEY: "sk" })).toBe(false);
    expect(authConfigured({})).toBe(false);
  });
});

describe("getAccount", () => {
  it("liefert E-Mail (klein, ohne Leerzeichen) und Namen der angemeldeten Person", async () => {
    expect(await getAccount()).toEqual({ email: "anna@keller.ch", name: "Anna Keller" });
  });

  it("nimmt die E-Mail-Adresse als Namen, wenn Clerk keinen Namen kennt", async () => {
    clerk.getUser.mockResolvedValue(userOf({ fullName: null }));
    expect(await getAccount()).toEqual({ email: "anna@keller.ch", name: "anna@keller.ch" });
  });

  it("ist aus, solange Clerk nicht eingerichtet ist, und fragt Clerk dann gar nicht", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(await getAccount()).toBeNull();
    expect(clerk.getUser).not.toHaveBeenCalled();
  });

  it("liefert niemanden ohne Sitzung", async () => {
    clerk.userId = null;
    expect(await getAccount()).toBeNull();
    expect(clerk.getUser).not.toHaveBeenCalled();
  });

  it("verlangt eine bestätigte E-Mail-Adresse: sie ist die Kennung des Kontos", async () => {
    for (const primaryEmailAddress of [
      { emailAddress: "anna@keller.ch", verification: { status: "unverified" } },
      { emailAddress: "anna@keller.ch", verification: null },
      { emailAddress: "anna@keller.ch", verification: { status: "expired" } },
      null,
    ]) {
      resetAccountCache();
      clerk.getUser.mockResolvedValue(userOf({ primaryEmailAddress }));
      expect(await getAccount()).toBeNull();
    }
  });

  it("wirft nie: Fehler von Clerk und eine fehlende Middleware ergeben niemanden", async () => {
    clerk.getUser.mockRejectedValue(new Error("Clerk nicht erreichbar"));
    expect(await getAccount()).toBeNull();
    clerk.authThrows = true;
    expect(await getAccount()).toBeNull();
  });

  it("merkt sich die Person fünf Minuten, damit nicht jede Anfrage Clerk fragt", async () => {
    const t0 = 1_000_000;
    await getAccount(t0);
    await getAccount(t0 + 4 * 60_000);
    expect(clerk.getUser).toHaveBeenCalledTimes(1);
    await getAccount(t0 + 5 * 60_000 + 1);
    expect(clerk.getUser).toHaveBeenCalledTimes(2);
  });

  it("merkt sich Fehler und fehlende Bestätigungen nicht", async () => {
    clerk.getUser.mockRejectedValueOnce(new Error("kurz weg"));
    expect(await getAccount()).toBeNull();
    expect(await getAccount()).toEqual({ email: "anna@keller.ch", name: "Anna Keller" });
    expect(clerk.getUser).toHaveBeenCalledTimes(2);
  });

  it("hält die Personen auseinander", async () => {
    await getAccount();
    clerk.userId = "user_2";
    clerk.getUser.mockResolvedValue(userOf({ primaryEmailAddress: verified("ben@meier.ch"), fullName: "Ben Meier" }));
    expect(await getAccount()).toEqual({ email: "ben@meier.ch", name: "Ben Meier" });
  });
});
