import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accountHash, clientIp, ipHash, signGate, verifyGate, type GateState } from "@/lib/access";
import { SECRET } from "@/tests/helpers";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const iat = Math.floor(NOW / 1000);
const cookie = (over: Partial<GateState> = {}): GateState => ({ email: "anna@keller.ch", iat, consent: true, ...over });

describe("ipHash", () => {
  it("liefert 16 Byte als 32 Hex-Zeichen und enthält die IP nicht im Klartext", () => {
    const h = ipHash("203.0.113.7", SECRET);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain("203");
  });
  it("ist pro IP und pro Secret verschieden, aber stabil", () => {
    expect(ipHash("203.0.113.7", SECRET)).toBe(ipHash("203.0.113.7", SECRET));
    expect(ipHash("203.0.113.7", SECRET)).not.toBe(ipHash("203.0.113.8", SECRET));
    expect(ipHash("203.0.113.7", SECRET)).not.toBe(ipHash("203.0.113.7", `${SECRET}x`));
  });
});

describe("accountHash", () => {
  it("hängt an der klein geschriebenen Adresse, nie an der Schreibweise, und verrät sie nicht", () => {
    expect(accountHash("Anna@Keller.ch ", SECRET)).toBe(accountHash("anna@keller.ch", SECRET));
    expect(accountHash("anna@keller.ch", SECRET)).not.toContain("anna");
    expect(accountHash("anna@keller.ch", SECRET)).not.toBe(ipHash("anna@keller.ch", SECRET));
  });
});

describe("clientIp", () => {
  it("nimmt das erste Element von x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.2, 10.0.0.3" });
    expect(clientIp(h)).toBe("198.51.100.1");
  });
  it("fällt auf x-real-ip und dann auf «unknown» zurück", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("Cookie mt_gate (Zugang v3: die Adresse der Person)", () => {
  it("überlebt Signieren und Prüfen", () => {
    const s = cookie();
    expect(verifyGate(signGate(s, SECRET), SECRET, NOW)).toEqual(s);
  });
  it("ist ungültig bei falschem Secret", () => {
    expect(verifyGate(signGate(cookie(), SECRET), `${SECRET}x`, NOW)).toBeNull();
  });
  it("ist ungültig bei verändertem Inhalt (andere Adresse von Hand gesetzt)", () => {
    const [, sig] = signGate(cookie(), SECRET).split(".");
    const forged = `${Buffer.from(JSON.stringify(cookie({ email: "chef@konkurrenz.ch" }))).toString("base64url")}.${sig}`;
    expect(verifyGate(forged, SECRET, NOW)).toBeNull();
  });
  it("ist ungültig ohne Adresse, mit Müll statt Adresse oder nach 365 Tagen", () => {
    const sign = (state: unknown) => {
      const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
      return `${payload}.${signGate(cookie(), SECRET).split(".")[1]}`;
    };
    expect(verifyGate(sign({ iat }), SECRET, NOW)).toBeNull();
    expect(verifyGate(signGate({ email: "kein-mail", iat, consent: true }, SECRET), SECRET, NOW)).toBeNull();
    expect(verifyGate(signGate(cookie(), SECRET), SECRET, NOW + 366 * 24 * 60 * 60 * 1000)).toBeNull();
  });
  it("trägt die Einwilligung mit; Cookies aus der Zeit des Pflicht-Häkchens ohne Feld gelten als «ja»", () => {
    expect(verifyGate(signGate(cookie({ consent: false }), SECRET), SECRET, NOW)).toEqual({ email: "anna@keller.ch", iat, consent: false });
    expect(verifyGate(signGate(cookie({ consent: true }), SECRET), SECRET, NOW)?.consent).toBe(true);
    const legacy = Buffer.from(JSON.stringify({ email: "anna@keller.ch", iat })).toString("base64url");
    // ein altes Cookie trägt seine eigene Signatur über den alten Inhalt
    const legacySig = createHmac("sha256", SECRET).update(legacy).digest("base64url");
    expect(verifyGate(`${legacy}.${legacySig}`, SECRET, NOW)).toEqual({ email: "anna@keller.ch", iat, consent: true });
  });
  it("verträgt leere, fremde und kaputte Werte", () => {
    for (const v of [undefined, "", "a.b.c", "nur-ein-teil", `${"x".repeat(10)}.${"y".repeat(10)}`]) {
      expect(verifyGate(v, SECRET, NOW)).toBeNull();
    }
  });
});
