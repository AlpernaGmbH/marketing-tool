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

/** HMAC-SHA256 in base64url ohne Auffüllung: genau 43 Zeichen. Jede andere Schreibweise gilt als ungültig. */
const SIG_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** Stimmt die Signatur mit dem Inhalt überein? Fehlende oder falsche Signaturen gelten als ungültig. */
export function verifyResult(result: CheckResult, secret: string): boolean {
  const { sig, ...rest } = result;
  // Streng prüfen: Buffer.from(…, "base64url") überliest Fremdzeichen, dann würden verschiedene Schreibweisen
  // derselben Signatur gelten (und im Zwischenspeicher je einen eigenen Schlüssel bekommen).
  if (typeof sig !== "string" || !SIG_FORMAT.test(sig)) return false;
  const given = Buffer.from(sig, "base64url");
  if (given.toString("base64url") !== sig) return false; // das letzte Zeichen trägt zwei ungenutzte Bits; nur die Normalform gilt
  const expected = mac(rest, secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
