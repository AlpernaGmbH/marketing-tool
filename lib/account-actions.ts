import { signOutAccount } from "@/lib/account-client";
import { flushAndClear } from "@/lib/sync";

/**
 * Meldet ab. Liegen die Daten beim Konto (`storage`), gehen sie vorher dorthin und die lokale Kopie wird entfernt, damit die
 * nächste Person an diesem Gerät nichts davon sieht. Klappt das Hinaufschicken nicht, bleibt die lokale Kopie.
 */
export async function signOutAndForget(storage: boolean): Promise<boolean> {
  if (storage) await flushAndClear();
  return signOutAccount();
}
