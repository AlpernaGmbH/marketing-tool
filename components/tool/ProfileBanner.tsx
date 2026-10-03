"use client";

import Link from "next/link";
import { profileLabel } from "@/lib/profile";
import { useProfile } from "@/lib/use-profile";

/** Zeigt, welches Firmenprofil ein Tool liest, und führt zu /profil. */
export function ProfileBanner() {
  const { profile, ready } = useProfile();
  const label = profileLabel(profile);

  return (
    <div className="border-b border-line bg-surface px-5 py-3 text-sm" data-testid="profile-banner">
      {!ready ? (
        <span className="invisible">Dein Firmenprofil</span>
      ) : label ? (
        <>
          Dein Firmenprofil: <strong className="font-semibold">{label}</strong> –{" "}
          <Link href="/profil" className="underline underline-offset-4">
            bearbeiten
          </Link>
        </>
      ) : (
        <>
          Dein Firmenprofil ist noch leer.{" "}
          <Link href="/profil" className="underline underline-offset-4">
            Ausfüllen
          </Link>{" "}
          spart dir Eingaben in allen Werkzeugen.
        </>
      )}
    </div>
  );
}
