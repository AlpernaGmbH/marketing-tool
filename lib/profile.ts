import { z } from "zod";
import { dateCH } from "@/lib/ch";

// Firmenprofil: lebt nur im Browser (localStorage, Schlüssel mt:profile).
// Reine Typen und Funktionen, damit Tools und Tests sie ohne React nutzen können.
// Der Hook dazu steht in lib/use-profile.ts.

export const PROFILE_KEY = "mt:profile";
export const PROFILE_VERSION = 1;
/** Obergrenze für importierte Dateien. */
export const MAX_IMPORT_BYTES = 256 * 1024;

export const GROESSEN = {
  kmu: [
    { value: "1-9", label: "1 bis 9 Mitarbeitende" },
    { value: "10-49", label: "10 bis 49 Mitarbeitende" },
    { value: "50-249", label: "50 bis 249 Mitarbeitende" },
    { value: "250+", label: "250 und mehr Mitarbeitende" },
  ],
  verein: [
    { value: "bis-50", label: "bis 50 Mitglieder" },
    { value: "51-200", label: "51 bis 200 Mitglieder" },
    { value: "201-1000", label: "201 bis 1'000 Mitglieder" },
    { value: "ueber-1000", label: "über 1'000 Mitglieder" },
  ],
} as const;

export const RECHTSFORMEN = [
  "Einzelfirma",
  "Kollektivgesellschaft",
  "GmbH",
  "AG",
  "Genossenschaft",
  "Verein",
  "Stiftung",
  "Andere",
] as const;

const text = z.string().max(2000);
const shortText = z.string().max(200);
const looseObject = z.object({}).passthrough();

/** Jedes Feld wird einzeln geprüft; ein kaputtes Feld löscht nicht das ganze Profil. */
export const profileFields = {
  organisationstyp: z.enum(["kmu", "verein"]),
  firma: shortText,
  branche: shortText,
  rechtsform: shortText,
  ort: shortText,
  website: shortText,
  kanton: z.string().regex(/^[A-Z]{2}$/),
  groesse: shortText,
  zielgruppen: z.array(looseObject.extend({ name: shortText })).max(10),
  primaersegment: shortText,
  personas: z.array(looseObject.extend({ name: shortText })).max(10),
  positionierung: text,
  marke: looseObject.extend({
    werte: z.array(shortText).max(10).optional(),
    persoenlichkeit: looseObject.optional(),
    tonalitaet: looseObject.optional(),
    woerter: looseObject.optional(),
    bewertungsregeln: z.array(text).max(10).optional(),
  }),
  kanaele: z.array(looseObject).max(20),
  budgetJahr: z.number().finite().nonnegative(),
  contentSaeulen: z.array(looseObject).max(10),
} as const;

export type Profile = {
  [K in keyof typeof profileFields]?: z.infer<(typeof profileFields)[K]>;
};
export type ProfileKey = keyof Profile;

const KEYS = Object.keys(profileFields) as ProfileKey[];

/** Liest ein Profil aus beliebigen Daten. Ungültige Felder fallen weg, der Rest bleibt. */
export function sanitizeProfile(data: unknown): Profile {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  const src = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of KEYS) {
    if (!(key in src)) continue;
    const parsed = profileFields[key].safeParse(src[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as Profile;
}

export function isProfileEmpty(profile: Profile): boolean {
  return KEYS.every((k) => {
    const v = profile[k];
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v).length === 0;
    return false;
  });
}

/** Ändert Felder; `undefined` entfernt ein Feld. */
export function mergeProfile(profile: Profile, patch: Partial<Record<ProfileKey, unknown>>): Profile {
  const next: Record<string, unknown> = { ...profile };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return sanitizeProfile(next);
}

/** Export als JSON-Text: { version, exportedAt, profile }. */
export function exportProfile(profile: Profile, now = new Date()): string {
  return JSON.stringify({ version: PROFILE_VERSION, exportedAt: now.toISOString(), profile }, null, 2);
}

export function exportFilename(now = new Date()): string {
  const [d, m, y] = dateCH(now).split(".");
  return `alperna-firmenprofil-${y}-${m}-${d}.json`;
}

export type ImportResult =
  | { ok: true; profile: Profile; ignored: number }
  | { ok: false; error: string };

/** Liest einen Export oder ein nacktes Profil-JSON. Gibt eine verständliche Fehlermeldung zurück. */
export function importProfile(textInput: string): ImportResult {
  if (textInput.length > MAX_IMPORT_BYTES) return { ok: false, error: "Die Datei ist zu gross für ein Firmenprofil." };
  let data: unknown;
  try {
    data = JSON.parse(textInput);
  } catch {
    return { ok: false, error: "Das ist keine gültige JSON-Datei." };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "In der Datei steht kein Firmenprofil." };
  }
  const obj = data as Record<string, unknown>;
  const candidate = "profile" in obj && typeof obj.profile === "object" ? obj.profile : obj;
  const profile = sanitizeProfile(candidate);
  if (isProfileEmpty(profile)) return { ok: false, error: "In der Datei steht kein Firmenprofil." };
  const given = Object.keys((candidate ?? {}) as Record<string, unknown>).length;
  return { ok: true, profile, ignored: Math.max(0, given - Object.keys(profile).length) };
}

/** «Malerei Keller, Gossau» für das ProfileBanner; null, wenn noch nichts da ist. */
export function profileLabel(profile: Profile): string | null {
  const firma = profile.firma?.trim();
  if (!firma) return null;
  const ort = profile.ort?.trim();
  return ort ? `${firma}, ${ort}` : firma;
}
