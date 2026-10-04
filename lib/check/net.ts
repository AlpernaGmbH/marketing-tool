import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import zlib from "node:zlib";
import { CheckError } from "@/lib/check/types";

// Sicheres Abrufen fremder Seiten. Schutz vor SSRF (Zugriff auf interne Adressen):
// 1. Der Host wird aufgelöst und jede Adresse geprüft.
// 2. Die Verbindung geht genau zu der geprüften Adresse (gepinnter DNS-Eintrag), nicht zu einer zweiten Auflösung.
// 3. Jede Weiterleitung wird erneut geprüft.
// 4. Grösse, Zeit und Anzahl Weiterleitungen sind begrenzt.
// Server-Routen loggen nie die abgerufene Adresse (Harte Regel 1); diese Datei loggt nichts.

export const USER_AGENT = "Mozilla/5.0 (compatible; AlpernaCheck/1.0; +https://tools.alperna.ch)";
export const MAX_BYTES = 2_500_000;
export const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

export type FetchOptions = {
  method?: "GET" | "HEAD";
  maxBytes?: number;
  timeout?: number;
  /** Nur für Tests gegen einen lokalen Server. Nie aus Eingaben ableiten. */
  allowPrivate?: boolean;
};

export type FetchResult = {
  url: URL;
  status: number;
  ok: boolean;
  /** Kleingeschriebene Namen. */
  headers: Record<string, string>;
  body: string;
  ms: number;
};

/** Abruffunktion, austauschbar für Tests. */
export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchResult>;

function ipv4Private(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // Carrier-Grade NAT
    (a === 169 && b === 254) || // Link-Local, Cloud-Metadaten
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // Multicast und reserviert
  );
}

/** true für Adressen, die nicht im öffentlichen Internet liegen. Unlesbare Adressen gelten als privat. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind !== 6) return true;
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  // IPv4 in IPv6: ::ffff:a.b.c.d oder ::ffff:7f00:1
  const mapped = v6.match(/^(?:0:0:0:0:0:ffff:|::ffff:)(.+)$/);
  if (mapped) {
    const rest = mapped[1];
    if (rest.includes(".")) return isPrivateAddress(rest);
    const parts = rest.split(":").map((h) => parseInt(h, 16));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      const [hi, lo] = parts;
      return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return true;
  }
  const first = parseInt(v6.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 Unique Local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 Link-Local
    v6.startsWith("2001:db8") || // Dokumentation
    (first & 0xff00) === 0xff00 // Multicast
  );
}

/** Prüft Protokoll, Port, Zugangsdaten und Host. Gibt die geprüfte Adresse zurück. */
export async function assertPublicUrl(url: URL, allowPrivate = false): Promise<{ address: string; family: 4 | 6 }> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CheckError("Nur http- und https-Adressen sind erlaubt.", "blocked");
  }
  if (!allowPrivate && url.port && url.port !== "80" && url.port !== "443") {
    throw new CheckError("Diese Adresse ist nicht erlaubt.", "blocked");
  }
  if (url.username || url.password) throw new CheckError("Diese Adresse ist nicht erlaubt.", "blocked");

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!allowPrivate && (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))) {
    throw new CheckError("Interne Adressen sind nicht erlaubt.", "blocked");
  }

  let addrs: { address: string; family: number }[];
  if (isIP(host)) {
    addrs = [{ address: host, family: isIP(host) }];
  } else {
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      throw new CheckError("Die Adresse konnte nicht aufgelöst werden.", "unreachable");
    }
  }
  if (addrs.length === 0) throw new CheckError("Die Adresse konnte nicht aufgelöst werden.", "unreachable");
  if (!allowPrivate && addrs.some((a) => isPrivateAddress(a.address))) {
    throw new CheckError("Interne Adressen sind nicht erlaubt.", "blocked");
  }
  const pick = addrs[0];
  return { address: pick.address, family: pick.family === 6 ? 6 : 4 };
}

function charsetOf(contentType: string, head: Buffer): string {
  const fromHeader = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const fromMeta = head.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  return (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
}

function decodeBody(buf: Buffer, contentType: string): string {
  const cs = charsetOf(contentType, buf);
  if (cs === "iso-8859-1" || cs === "latin1" || cs === "windows-1252" || cs === "iso-8859-15") {
    return new TextDecoder("windows-1252").decode(buf);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

type Hop = { status: number; headers: Record<string, string>; body: Buffer };

function requestOnce(url: URL, target: { address: string; family: 4 | 6 }, opts: Required<FetchOptions>): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    let settled = false;
    const done = (err: Error | null, hop?: Hop) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(hop as Hop);
    };

    const req = mod.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: opts.method,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-language": "de-CH,de;q=0.9,en;q=0.6",
          "accept-encoding": "gzip, deflate, br",
        },
        // Gepinnte Auflösung: die Verbindung geht zur geprüften Adresse. SNI und Zertifikat nutzen weiter den Hostnamen.
        lookup: (_host, options, cb) => {
          const wantsAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
          if (wantsAll) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: target.address, family: target.family }]);
          else cb(null, target.address, target.family);
        },
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
        const status = res.statusCode ?? 0;
        if (opts.method === "HEAD" || (status >= 300 && status < 400)) {
          res.resume();
          return done(null, { status, headers, body: Buffer.alloc(0) });
        }

        const enc = (headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        stream.on("error", () => done(new CheckError("Die Antwort der Website war nicht lesbar.", "unreachable")));

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          if (size > opts.maxBytes) {
            // Genug gelesen: der Rest der Seite zählt für den Check nicht.
            done(null, { status, headers, body: Buffer.concat(chunks).subarray(0, opts.maxBytes) });
            res.destroy();
          }
        });
        stream.on("end", () => done(null, { status, headers, body: Buffer.concat(chunks) }));
        res.on("error", () => done(new CheckError("Die Verbindung wurde unterbrochen.", "unreachable")));
        res.on("aborted", () => done(null, { status, headers, body: Buffer.concat(chunks) }));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      done(new CheckError("Die Website hat zu lange nicht geantwortet.", "unreachable"));
    }, opts.timeout);
    req.on("error", () => done(new CheckError("Die Website konnte nicht geladen werden.", "unreachable")));
    req.end();
  });
}

/** Ruft eine Adresse ab, folgt Weiterleitungen und prüft jede Station. */
export async function safeFetch(rawUrl: string, options: FetchOptions = {}): Promise<FetchResult> {
  const opts: Required<FetchOptions> = {
    method: options.method ?? "GET",
    maxBytes: options.maxBytes ?? MAX_BYTES,
    timeout: options.timeout ?? TIMEOUT_MS,
    allowPrivate: options.allowPrivate ?? false,
  };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CheckError("Das ist keine gültige Adresse.", "invalid");
  }
  const started = Date.now();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await assertPublicUrl(url, opts.allowPrivate);
    const res = await requestOnce(url, target, opts);
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location) {
      try {
        url = new URL(location, url);
      } catch {
        throw new CheckError("Die Weiterleitung der Website ist ungültig.", "unreachable");
      }
      continue;
    }
    return {
      url,
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      headers: res.headers,
      body: decodeBody(res.body, res.headers["content-type"] ?? ""),
      ms: Date.now() - started,
    };
  }
  throw new CheckError("Die Website leitet zu oft weiter.", "unreachable");
}
