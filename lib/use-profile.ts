"use client";

import { useCallback } from "react";
import {
  PROFILE_KEY,
  exportFilename,
  exportProfile,
  importProfile,
  mergeProfile,
  sanitizeProfile,
  type ImportResult,
  type Profile,
  type ProfileKey,
} from "@/lib/profile";
import { clearAllLocal, readLocal, removeLocal } from "@/lib/storage";
import { useLocalJson } from "@/lib/use-local";

/** Firmenprofil aus dem Browser. `ready` ist erst nach der Hydrierung wahr; davor ist das Profil leer. */
export function useProfile() {
  const { value: profile, ready, set } = useLocalJson<Profile>(PROFILE_KEY, sanitizeProfile);

  const update = useCallback(
    (patch: Partial<Record<ProfileKey, unknown>>) => {
      // Aktuellen Stand frisch lesen, damit schnelle Folge-Änderungen sich nicht überschreiben.
      let current: Profile = {};
      try {
        current = sanitizeProfile(JSON.parse(readLocal(PROFILE_KEY) ?? "null"));
      } catch {
        current = {};
      }
      set(mergeProfile(current, patch));
    },
    [set],
  );

  const replace = useCallback((next: Profile) => set(sanitizeProfile(next)), [set]);
  const clearProfile = useCallback(() => removeLocal(PROFILE_KEY), []);
  /** Löscht Profil, Zwischenstände und Merkliste dieses Browsers. */
  const clearEverything = useCallback(() => clearAllLocal(), []);
  const exportJson = useCallback(() => ({ text: exportProfile(profile), filename: exportFilename() }), [profile]);
  const importFrom = useCallback(
    (text: string): ImportResult => {
      const result = importProfile(text);
      if (result.ok) set(result.profile);
      return result;
    },
    [set],
  );

  return { profile, ready, update, replace, clearProfile, clearEverything, exportJson, importFrom };
}
