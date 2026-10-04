// Server-Logs enthalten nur Route, Statuscode und ein festes Stichwort, bei Fehlern der KI zusätzlich den Namen der
// Fehlerart (zum Beispiel «GatewayRateLimitError:429»). Nie Eingaben, nie Klartext-IPs, nie E-Mail-Adressen.
export type LogNote =
  | "ok"
  | "invalid_body"
  | "invalid_tool"
  | "rate_limited"
  | "redis_unavailable"
  | "gate_unconfigured"
  | "webhook_failed"
  | "lead_queued"
  | "lead_lost"
  | "lead_drained"
  | "honeypot"
  | "check_ok"
  | "check_error"
  | "check_blocked"
  | "gate_used"
  | "auth_disabled"
  | "auth_error"
  | "account_unlocked"
  | "ai_ok"
  | "ai_cached"
  | "ai_failed"
  | "ai_limit"
  | "ai_capacity"
  | "read_ok"
  | "read_error";

/** Nur Buchstaben, Ziffern und `_ . : > -`, höchstens 80 Zeichen: Eine Fehlerart, nie ein Text. */
export function safeDetail(detail: string): string {
  return detail.replace(/[^A-Za-z0-9_.:>-]/g, "").slice(0, 80);
}

export function logStatus(route: string, status: number, note: LogNote = "ok", detail?: string): void {
  console.log(JSON.stringify(detail ? { route, status, note, detail: safeDetail(detail) } : { route, status, note }));
}
