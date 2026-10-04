import { NextRequest } from "next/server";
import type { AccessStore, StoredState } from "@/lib/access";

export const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

/** In-Memory-Ersatz für Redis. `failing` simuliert einen Ausfall. */
export class MemoryStore implements AccessStore {
  runs = new Map<string, number>();
  unlockedSet = new Set<string>();
  accounts = new Set<string>();
  popular = new Map<string, number>();
  leads: string[] = [];
  failing = false;

  private guard() {
    if (this.failing) throw new Error("redis down");
  }
  async getState(iphash: string, acchash?: string | null): Promise<StoredState> {
    this.guard();
    return {
      runs: this.runs.get(iphash) ?? 0,
      unlocked: this.unlockedSet.has(iphash) || Boolean(acchash && this.accounts.has(acchash)),
    };
  }
  async isAccountUnlocked(acchash: string) {
    this.guard();
    return this.accounts.has(acchash);
  }
  async claimAccount(acchash: string) {
    this.guard();
    if (this.accounts.has(acchash)) return false;
    this.accounts.add(acchash);
    return true;
  }
  async recordCompletion(iphash: string, slug: string, countRun: boolean) {
    this.guard();
    this.popular.set(slug, (this.popular.get(slug) ?? 0) + 1);
    if (countRun) this.runs.set(iphash, (this.runs.get(iphash) ?? 0) + 1);
  }
  async setUnlocked(iphash: string, acchash?: string | null) {
    this.guard();
    this.unlockedSet.add(iphash);
    if (acchash) this.accounts.add(acchash);
  }
  async pushLead(json: string) {
    this.guard();
    this.leads.push(json);
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
