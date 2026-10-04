// Server-Logs enthalten nur Route, Statuscode und ein festes Stichwort.
// Nie Eingaben, nie Klartext-IPs, nie E-Mail-Adressen.
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
  | "ai_capacity";

export function logStatus(route: string, status: number, note: LogNote = "ok"): void {
  console.log(JSON.stringify({ route, status, note }));
}
