import { NextRequest } from "next/server";
import { signGate, type AccessStore } from "@/lib/access";

export const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

/** In-Memory-Ersatz für Redis. `failing` simuliert einen Ausfall. */
export class MemoryStore implements AccessStore {
  popular = new Map<string, number>();
  leads: string[] = [];
  failing = false;

  private guard() {
    if (this.failing) throw new Error("redis down");
  }
  async recordResult(slug: string) {
    this.guard();
    this.popular.set(slug, (this.popular.get(slug) ?? 0) + 1);
  }
  async pushLead(json: string) {
    this.guard();
    this.leads.push(json);
  }
  async peekLeads(max: number) {
    this.guard();
    return this.leads.slice(0, max);
  }
  async dropLeads(count: number) {
    this.guard();
    this.leads.splice(0, count);
  }
}

export function post(path: string, body: unknown, init: { ip?: string; cookie?: string } = {}): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.ip) headers["x-forwarded-for"] = init.ip;
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function put(path: string, body: unknown, init: { ip?: string; cookie?: string } = {}): NextRequest {
  return method("PUT", path, body, init);
}

export function method(verb: string, path: string, body: unknown, init: { ip?: string; cookie?: string } = {}): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.ip) headers["x-forwarded-for"] = init.ip;
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`http://localhost${path}`, {
    method: verb,
    headers,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

/** Cookie-Header mit einer gültig signierten Adresse (Zugang v3). */
export function gateCookie(email = "anna@keller.ch", secret = SECRET, now = Date.now()): string {
  return `mt_gate=${signGate({ email, iat: Math.floor(now / 1000) }, secret)}`;
}
