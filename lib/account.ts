import { accountHash } from "@/lib/access";
import { getAccount, type Account } from "@/lib/auth";

/** Angemeldete Person samt Kennung für Redis. null ohne Sitzung, ohne Anmeldung oder ohne GATE_SECRET. */
export async function requestAccount(secret: string | null): Promise<{ account: Account; acchash: string } | null> {
  if (!secret) return null;
  const account = await getAccount();
  return account ? { account, acchash: accountHash(account.email, secret) } : null;
}
