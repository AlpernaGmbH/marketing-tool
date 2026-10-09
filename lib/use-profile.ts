"use client";

import { useCallback, useEffect } from "react";
import {
  PROFILE_AT_KEY,
  PROFILE_EXPIRED_KEY,
  PROFILE_KEY,
  PROFILE_TOUCH_MS,
  exportFilename,
  exportProfile,
  importProfile,
  isProfileEmpty,
  mergeProfile,
  parseSavedAt,
  profileExpired,
  sanitizeProfile,
  type ImportResult,
  type Profile,
  type ProfileKey,
} from "@/lib/profile";
import { clearAllLocal, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import { useLocalJson, useLocalRaw } from "@/lib/use-local";

/**
 * Firmenprofil aus dem Browser. `ready` ist erst nach der Hydrierung wahr; davor ist das Profil leer.
 * Es lebt zwölf Monate ab der letzten Nutzung (PROFILE_AT_KEY): Jede Änderung und jede Nutzung (höchstens einmal am Tag) setzt die Frist neu,
 * ein älteres Profil wird gelöscht. Profile von vor dieser Regel tragen noch keinen Zeitpunkt und bekommen ihn bei der ersten Nutzung.
 * Hinweis: Safari kann lokale Daten schon nach etwa sieben Tagen ohne Besuch entfernen, das lässt sich von hier nicht verhindern;
 * deshalb gibt es auf der Profilseite die Sicherung als Datei.
 */
export function useProfile() {
  const { value: stored, ready, set: rawSet } = useLocalJson<Profile>(PROFILE_KEY, sanitizeProfile);
  const savedAt = parseSavedAt(useLocalRaw(PROFILE_AT_KEY));
  const expired = ready && profileExpired(savedAt);
  const profile = expired ? {} : stored;

  /** Schreibt das Profil und vermerkt den Zeitpunkt. */
  const set = useCallback(
    (next: Profile) => {
      rawSet(next);
      writeLocal(PROFILE_AT_KEY, String(Date.now()));
    },
    [rawSet],
  );

  useEffect(() => {
    if (!ready) return;
    if (expired) {
      removeLocal(PROFILE_KEY);
      removeLocal(PROFILE_AT_KEY);
      writeLocal(PROFILE_EXPIRED_KEY, "1");
      return;
    }
    if (isProfileEmpty(stored)) return;
    if (savedAt === null || Date.now() - savedAt > PROFILE_TOUCH_MS) writeLocal(PROFILE_AT_KEY, String(Date.now()));
  }, [ready, expired, savedAt, stored]);

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
  const clearProfile = useCallback(() => {
    removeLocal(PROFILE_KEY);
    removeLocal(PROFILE_AT_KEY);
  }, []);
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

  return { profile, ready, savedAt, update, replace, clearProfile, clearEverything, exportJson, importFrom };
}
