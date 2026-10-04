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
  | "honeypot"
  | "check_ok"
  | "check_error"
  | "check_blocked"
  | "gate_used";

export function logStatus(route: string, status: number, note: LogNote = "ok"): void {
  console.log(JSON.stringify({ route, status, note }));
}
