// Sicherheits-Kopfzeilen für alle Antworten (next.config.ts). Bewusst ohne Content-Security-Policy: Next.js setzt eigene Inline-Skripte,
// und die Seite lädt keine fremden Skripte; eine Policy ohne Nonce würde mehr brechen als schützen.
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];
