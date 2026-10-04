import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckResult } from "@/lib/check/types";

// Der Server signiert jedes Ergebnis, das /api/check liefert. So kann /api/ai prüfen, dass ein Ergebnis echt ist,
// und nimmt keinen frei erfundenen Text an (sonst wäre die KI-Schnittstelle ein offener Gratis-Zugang).

/** JSON mit sortierten Schlüsseln, damit die Signatur nicht von der Reihenfolge abhängt. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function mac(result: Omit<CheckResult, "sig">, secret: string): Buffer {
  return createHmac("sha256", secret).update(`check-result:${canonical(result)}`).digest();
}

/** Das Ergebnis mit Signatur. */
export function signResult(result: CheckResult, secret: string): CheckResult {
  const { sig: _old, ...rest } = result;
  void _old;
  return { ...rest, sig: mac(rest, secret).toString("base64url") };
}

/** Stimmt die Signatur mit dem Inhalt überein? Fehlende oder falsche Signaturen gelten als ungültig. */
export function verifyResult(result: CheckResult, secret: string): boolean {
  const { sig, ...rest } = result;
  if (typeof sig !== "string" || sig.length === 0) return false;
  const given = Buffer.from(sig, "base64url");
  const expected = mac(rest, secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
