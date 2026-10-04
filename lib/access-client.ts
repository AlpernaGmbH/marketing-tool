// Browser-seitige Helfer für /api/access. Ein Fehler hier blockiert nie einen Besucher:
// Bei jedem technischen Problem gilt «erlaubt».

export type LoginProvider = "clerk";
export type AccessInfo = {
  allowed: boolean;
  unlocked: boolean;
  reason: string;
  /** Angebotener Anmeldeweg; null: nur das Formular. */
  login: LoginProvider | null;
  /** Es gibt eine gültige Sitzung (angemeldet), auch wenn noch nicht freigeschaltet. */
  signedIn: boolean;
};

const FALLBACK: AccessInfo = { allowed: true, unlocked: false, reason: "unreachable", login: null, signedIn: false };

async function postJson(path: string, body: unknown, fetchImpl: typeof fetch): Promise<Response | null> {
  try {
    return await fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return null;
  }
}

/** Darf der Besucher dieses Tool jetzt starten? */
export async function checkAccess(tool: string, fetchImpl: typeof fetch = fetch): Promise<AccessInfo> {
  const res = await postJson("/api/access", { tool }, fetchImpl);
  if (!res || !res.ok) return FALLBACK;
  try {
    const data = (await res.json()) as Partial<AccessInfo>;
    return {
      allowed: data.allowed !== false,
      unlocked: data.unlocked === true,
      reason: typeof data.reason === "string" ? data.reason : "unknown",
      login: data.login === "clerk" ? "clerk" : null,
      signedIn: data.signedIn === true,
    };
  } catch {
    return FALLBACK;
  }
}

/** Meldet einen abgeschlossenen Durchlauf. Gibt zurück, ob der Besucher freigeschaltet ist. */
export async function completeRun(tool: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const res = await postJson("/api/access/complete", { tool }, fetchImpl);
  if (!res || !res.ok) return false;
  try {
    return ((await res.json()) as { unlocked?: boolean }).unlocked === true;
  } catch {
    return false;
  }
}

export type LeadResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "rate_limited" | "network" };

/** Sendet das Lead-Formular. */
export async function submitLead(data: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<LeadResult> {
  const res = await postJson("/api/lead", data, fetchImpl);
  if (!res) return { ok: false, reason: "network" };
  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 400) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "network" };
}

export type AccountResult = "ok" | "not_signed_in" | "failed";

/** Schaltet nach der Anmeldung frei (Name und E-Mail kommen aus dem Konto, nicht aus dem Browser). */
export async function unlockWithAccount(tool: string, firma: string | undefined, fetchImpl: typeof fetch = fetch): Promise<AccountResult> {
  const res = await postJson("/api/lead/account", { tool, consent: true, ...(firma ? { firma } : {}) }, fetchImpl);
  if (!res) return "failed";
  if (res.ok) return "ok";
  return res.status === 401 ? "not_signed_in" : "failed";
}
