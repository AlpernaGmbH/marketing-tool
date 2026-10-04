// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clerkEnabled,
  hasSessionHint,
  isWanted,
  loadClerk,
  openSignIn,
  registerClerk,
  resetClerkBridge,
  signOut,
  subscribeWanted,
  whenSessionReady,
  type ClerkApi,
} from "@/lib/clerk-bridge";

function fakeClerk(over: Partial<ClerkApi> = {}) {
  const loadedCallbacks: Array<() => void> = [];
  const listeners: Array<(r: { user?: unknown }) => void> = [];
  const clerk = {
    loaded: false,
    addOnLoaded: (cb: () => void) => void loadedCallbacks.push(cb),
    openSignIn: vi.fn(),
    openSignUp: vi.fn(),
    signOut: vi.fn(async () => {}),
    session: { getToken: vi.fn(async () => "token") },
    addListener: (cb: (r: { user?: unknown }) => void, _options?: { skipInitialEmit?: boolean }) => {
      listeners.push(cb);
      return () => void listeners.splice(listeners.indexOf(cb), 1);
    },
    ...over,
  };
  return {
    clerk: clerk as unknown as ClerkApi & typeof clerk,
    becomeLoaded() {
      clerk.loaded = true;
      loadedCallbacks.splice(0).forEach((cb) => cb());
    },
    emit: (user: unknown) => [...listeners].forEach((l) => l({ user })),
  };
}

beforeEach(() => {
  resetClerkBridge();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  document.cookie.split(";").forEach((c) => (document.cookie = `${c.split("=")[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("hasSessionHint", () => {
  it("erkennt das Sitzungs-Zeichen von Clerk (auch mit Suffix) und ignoriert 0 und Fremdes", () => {
    expect(hasSessionHint("__client_uat=1700000000")).toBe(true);
    expect(hasSessionHint("a=b; __client_uat_x1y2=1700000000; c=d")).toBe(true);
    expect(hasSessionHint("__client_uat=0")).toBe(false);
    expect(hasSessionHint("__client_uat_x1y2=0")).toBe(false);
    expect(hasSessionHint("__session=abc; other=1")).toBe(false);
    expect(hasSessionHint("x__client_uat=5")).toBe(false);
    expect(hasSessionHint("")).toBe(false);
  });
});

describe("clerkEnabled", () => {
  it("hängt am öffentlichen Schlüssel", () => {
    expect(clerkEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    expect(clerkEnabled()).toBe(false);
  });
});

describe("loadClerk", () => {
  it("lädt nichts, wenn Clerk nicht eingerichtet ist", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    expect(await loadClerk()).toBeNull();
    expect(isWanted()).toBe(false);
  });

  it("verlangt das Laden, meldet es den Beobachtern und wartet, bis Clerk bereit ist", async () => {
    const seen = vi.fn();
    subscribeWanted(seen);
    const p = loadClerk();
    expect(isWanted()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    const { clerk, becomeLoaded } = fakeClerk();
    registerClerk(clerk);
    becomeLoaded();
    expect(await p).toBe(clerk);
  });

  it("gibt eine schon bereite Instanz sofort zurück", async () => {
    const { clerk } = fakeClerk({ loaded: true });
    registerClerk(clerk);
    expect(await loadClerk()).toBe(clerk);
  });

  it("gibt nach der Frist null zurück, wenn Clerk nicht kommt", async () => {
    vi.useFakeTimers();
    const p = loadClerk(5000);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await p).toBeNull();
  });
});

describe("whenSessionReady", () => {
  it("kehrt ohne Sitzungs-Zeichen sofort zurück und lädt Clerk nicht", async () => {
    await whenSessionReady();
    expect(isWanted()).toBe(false);
  });

  it("lädt mit Sitzungs-Zeichen Clerk und holt einen frischen Token", async () => {
    document.cookie = "__client_uat=1700000000";
    const { clerk, becomeLoaded } = fakeClerk();
    const p = whenSessionReady();
    expect(isWanted()).toBe(true);
    registerClerk(clerk);
    becomeLoaded();
    await p;
    expect(clerk.session!.getToken).toHaveBeenCalledTimes(1);
  });

  it("wirft nie und wartet höchstens bis zur Frist", async () => {
    document.cookie = "__client_uat=1700000000";
    vi.useFakeTimers();
    const p = whenSessionReady(100);
    await vi.advanceTimersByTimeAsync(101);
    await expect(p).resolves.toBeUndefined();
  });
});

describe("openSignIn", () => {
  async function ready() {
    const f = fakeClerk({ loaded: true });
    registerClerk(f.clerk);
    return f;
  }

  it("öffnet die Anmeldung mit Rückkehradresse", async () => {
    const { clerk } = await ready();
    expect(await openSignIn("anmelden", "/tools/x?konto=ok")).toBe(true);
    expect(clerk.openSignIn).toHaveBeenCalledWith({ forceRedirectUrl: "/tools/x?konto=ok", signUpForceRedirectUrl: "/tools/x?konto=ok", withSignUp: true });
    expect(clerk.openSignUp).not.toHaveBeenCalled();
  });

  it("öffnet für «registrieren» das Fenster zum Konto erstellen", async () => {
    const { clerk } = await ready();
    expect(await openSignIn("registrieren", "/profil?anmeldung=ok")).toBe(true);
    expect(clerk.openSignUp).toHaveBeenCalledWith({ forceRedirectUrl: "/profil?anmeldung=ok", signInForceRedirectUrl: "/profil?anmeldung=ok" });
  });

  it("lädt die Zielseite ganz neu, sobald sich die Person im Fenster angemeldet hat, und nur einmal", async () => {
    const { emit } = await ready();
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign } as unknown as Location);
    await openSignIn("anmelden", "/tools/x?konto=ok");
    emit(null); // z. B. ein Fehlversuch im Fenster: noch niemand angemeldet
    expect(assign).not.toHaveBeenCalled();
    emit({ id: "user_1" });
    expect(assign).toHaveBeenCalledWith("/tools/x?konto=ok");
    emit({ id: "user_1" });
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("verlangt keine Meldung für den Zustand von vorher (skipInitialEmit)", async () => {
    const addListener = vi.fn(() => () => {});
    const f = fakeClerk({ loaded: true, addListener });
    registerClerk(f.clerk);
    await openSignIn("anmelden", "/x?konto=ok");
    expect(addListener).toHaveBeenCalledWith(expect.any(Function), { skipInitialEmit: true });
  });

  it("richtet keinen Listener ein, wenn die Person schon angemeldet ist", async () => {
    const addListener = vi.fn(() => () => {});
    const f = fakeClerk({ loaded: true, user: { id: "user_1" }, addListener });
    registerClerk(f.clerk);
    await openSignIn("anmelden", "/x?konto=ok");
    expect(addListener).not.toHaveBeenCalled();
  });

  it("gibt false zurück, wenn Clerk nicht bereit ist oder abstürzt", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    expect(await openSignIn("anmelden", "/x")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    const f = fakeClerk({
      loaded: true,
      openSignIn: vi.fn(() => {
        throw new Error("kaputt");
      }),
    });
    registerClerk(f.clerk);
    expect(await openSignIn("anmelden", "/x")).toBe(false);
  });
});

describe("signOut", () => {
  it("meldet bei Clerk ab und kehrt zur Seite zurück", async () => {
    const { clerk } = fakeClerk({ loaded: true });
    registerClerk(clerk);
    expect(await signOut("/profil")).toBe(true);
    expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: "/profil" });
  });

  it("gibt false zurück, wenn Clerk nicht bereit ist oder das Abmelden scheitert", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    expect(await signOut("/")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    const { clerk } = fakeClerk({ loaded: true, signOut: vi.fn(async () => Promise.reject(new Error("offline"))) });
    registerClerk(clerk);
    expect(await signOut("/")).toBe(false);
  });
});
