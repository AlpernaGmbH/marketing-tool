import { dateCH } from "@/lib/ch";
import { guessIndustry, isIndustryKey } from "@/lib/check/industries";
import {
  INDUSTRY_LABELS,
  SOCIAL_NETWORKS,
  checkInputSchema,
  type CheckInput,
  type CheckResult,
  type IndustryKey,
  type PostingFrequency,
  type SocialNetwork,
} from "@/lib/check/types";
import { safeFilename, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { scoreBand } from "@/lib/score";

// Reine Funktionen, kein React, kein DOM. Spec: specs/digitaler-auftritt-check.md
// Die Prüfung selbst steht in lib/check/ (läuft auf dem Server, Route /api/check).

export const SLUG = "digitaler-auftritt-check";

// ---- Formular und Zwischenstand -------------------------------------------------------------------

export type SocialForm = Record<SocialNetwork, { url: string; freq: "" | PostingFrequency }>;
export type FormState = { industry: IndustryKey | ""; socials: SocialForm };

export const EMPTY_SOCIALS: SocialForm = {
  instagram: { url: "", freq: "" },
  facebook: { url: "", freq: "" },
  linkedin: { url: "", freq: "" },
  tiktok: { url: "", freq: "" },
  youtube: { url: "", freq: "" },
};
export const EMPTY_FORM: FormState = { industry: "", socials: EMPTY_SOCIALS };

/**
 * Zwischenstand unter mt:<slug>. `phase`, `step`, `answers` und `counted` entsprechen dem Format der
 * Fragebogen-Tools, damit der Fortschritt im Pfad («phase» = «result») unverändert funktioniert.
 */
export type SavedCheck = {
  v: 1;
  phase: "intro" | "result";
  step: 0;
  answers: Record<string, never>;
  counted: boolean;
  form: FormState;
  result?: CheckResult;
};

export const EMPTY_SAVED: SavedCheck = { v: 1, phase: "intro", step: 0, answers: {}, counted: false, form: EMPTY_FORM };

const FREQS: readonly string[] = ["none", "rare", "monthly", "weekly", "several"];

function parseForm(raw: unknown): FormState {
  if (typeof raw !== "object" || raw === null) return EMPTY_FORM;
  const r = raw as { industry?: unknown; socials?: unknown };
  const socials = { ...EMPTY_SOCIALS };
  if (typeof r.socials === "object" && r.socials !== null) {
    for (const { key } of SOCIAL_NETWORKS) {
      const e = (r.socials as Record<string, unknown>)[key];
      if (typeof e !== "object" || e === null) continue;
      const { url, freq } = e as { url?: unknown; freq?: unknown };
      socials[key] = {
        url: typeof url === "string" ? url.slice(0, 300) : "",
        freq: typeof freq === "string" && FREQS.includes(freq) ? (freq as PostingFrequency) : "",
      };
    }
  }
  return { industry: isIndustryKey(r.industry) ? r.industry : "", socials };
}

function isResult(v: unknown): v is CheckResult {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<CheckResult>;
  return (
    r.v === 1 &&
    typeof r.score === "number" &&
    typeof r.company === "string" &&
    typeof r.url === "string" &&
    typeof r.checkedAt === "string" &&
    Array.isArray(r.categories) &&
    Array.isArray(r.massnahmen) &&
    typeof r.facts === "object" &&
    r.facts !== null
  );
}

/** Liest den Zwischenstand. Kaputte oder alte Daten (Fragebogen-Version) fallen auf den Start zurück. */
export function parseCheckState(raw: unknown): SavedCheck {
  if (typeof raw !== "object" || raw === null) return EMPTY_SAVED;
  const r = raw as { phase?: unknown; counted?: unknown; form?: unknown; result?: unknown };
  const form = parseForm(r.form);
  if (r.phase === "result" && isResult(r.result)) {
    return { ...EMPTY_SAVED, phase: "result", counted: true, form, result: r.result };
  }
  return { ...EMPTY_SAVED, counted: r.counted === true, form };
}

// ---- Eingabe -----------------------------------------------------------------------------------

/** Branche für die Bewertung: Wahl des Besuchers, sonst Vorschlag aus der Branche im Firmenprofil. */
export function industryFor(profile: Profile, form: FormState): IndustryKey | "" {
  if (form.industry) return form.industry;
  return profile.branche?.trim() ? guessIndustry(profile.branche) : "";
}

export function buildInput(profile: Profile, form: FormState): CheckInput {
  const socials: NonNullable<CheckInput["socials"]> = {};
  for (const { key } of SOCIAL_NETWORKS) {
    const e = form.socials[key];
    if (e.url.trim()) socials[key] = { url: e.url.trim(), ...(e.freq ? { freq: e.freq } : {}) };
  }
  return {
    company: profile.firma?.trim() ?? "",
    city: profile.ort?.trim() || undefined,
    industry: industryFor(profile, form) || undefined,
    website: profile.website?.trim() ?? "",
    socials: Object.keys(socials).length > 0 ? socials : undefined,
  };
}

/** Erste Rückmeldung zu den Angaben oder null. Der Server prüft dieselbe Eingabe noch einmal. */
export function formProblem(input: CheckInput): string | null {
  const parsed = checkInputSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Bitte prüfe deine Angaben.";
  if (!input.industry) return "Bitte wähle deine Branche. Sie entscheidet, ob Online-Shop und Online-Buchung für dich zählen.";
  return null;
}

/** Was der Check ins Firmenprofil schreibt. Vorhandene Angaben bleiben, es wird nur ergänzt. */
export type ProfilePatch = { branche?: string; kanaele?: { name: string; url?: string }[] };

export function profilePatch(profile: Profile, result: CheckResult): ProfilePatch {
  const patch: ProfilePatch = {};
  if (!profile.branche?.trim()) patch.branche = INDUSTRY_LABELS[result.industry];
  const channels = result.categories.find((c) => c.id === "social")?.channels ?? [];
  if (!profile.kanaele?.length && channels.length > 0) {
    patch.kanaele = channels.map((c) => ({ name: c.label, ...(c.url ? { url: c.url } : {}) }));
  }
  return patch;
}

// ---- Auswertung --------------------------------------------------------------------------------

export const stufe = (score: number): string => scoreBand(score / 100).text;

export const percent = (score: number): number => Math.round(score * 100);

export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Anzahl erfüllter und gewerteter Prüfpunkte. Hinweise ohne Wertung zählen nicht mit. */
export function countItems(result: CheckResult): { ok: number; total: number } {
  let ok = 0;
  let total = 0;
  for (const c of result.categories) {
    if (c.weight === 0) continue;
    for (const i of c.items) {
      if (i.info && !i.ok) continue;
      total++;
      if (i.ok) ok++;
    }
  }
  return { ok, total };
}

/** Hinweise, was gemessen ist und was nicht. Stehen im Ergebnis und im Export. */
export function measurementNotes(result: CheckResult): string[] {
  const notes = [
    `Geprüft wurde die öffentliche Startseite von ${host(result.url)} am ${dateCH(result.checkedAt)}. Der Check liest nur, was jede Besucherin und jeder Besucher auch sieht.`,
  ];
  const gbp = result.categories.find((c) => c.id === "gbp");
  if (gbp && !gbp.verified) {
    notes.push("Das Google-Business-Profil konnte nicht automatisch bestätigt werden. Die Punktzahl dieses Bereichs ist eine Annahme, keine Messung.");
  }
  const social = result.categories.find((c) => c.id === "social");
  if (social?.selfReported) {
    notes.push("Die Angaben zu Social Media stammen von dir oder von Links auf der Website. Instagram, LinkedIn und TikTok lassen sich nicht automatisch auslesen.");
  }
  notes.push("Wirkung und Aufwand der Schritte sind eine Einschätzung von Alperna, keine Messung und keine Statistik.");
  return notes;
}

// ---- Dokument ----------------------------------------------------------------------------------

const mark = (ok: boolean, info?: boolean) => (ok ? "erfüllt" : info ? "Hinweis" : "offen");

/** DocumentModel für PDF, DOCX und Markdown. */
export function toDocument(result: CheckResult): DocumentModel {
  const datum = dateCH(result.checkedAt);
  const weighted = result.categories.filter((c) => c.weight > 0);
  const totalWeight = weighted.reduce((s, c) => s + c.weight, 0);
  const { ok, total } = countItems(result);

  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Betrieb", value: result.company },
        { label: "Website", value: host(result.url) },
        { label: "Branche", value: result.industryLabel },
        ...(result.city ? [{ label: "Ort", value: result.city }] : []),
        { label: "Geprüft am", value: datum },
      ],
    },
    { type: "heading", level: 1, text: "Ergebnis" },
    { type: "paragraph", text: `Gesamt: ${result.score} von 100 Punkten (${stufe(result.score)}). ${ok} von ${total} Prüfpunkten sind erfüllt.` },
    {
      type: "table",
      header: ["Bereich", "Punkte", "Gewicht"],
      widths: [3, 1.4, 1],
      rows: weighted.map((c) => [c.title, `${percent(c.score)} von 100`, `${Math.round((c.weight / totalWeight) * 100)} %`]),
    },
    { type: "heading", level: 1, text: "Nächste Schritte" },
  ];

  if (result.massnahmen.length === 0) {
    blocks.push({ type: "paragraph", text: "Hier gibt es nichts Dringendes. Prüfe die Punkte in einigen Monaten erneut." });
  } else {
    blocks.push({
      type: "table",
      header: ["Nr.", "Massnahme", "Bereich", "Wirkung", "Aufwand"],
      widths: [0.6, 4, 1.8, 1.1, 1.1],
      rows: result.massnahmen.map((m, i) => [String(i + 1), m.titel, m.baustein, m.wirkung, m.aufwand]),
    });
  }

  blocks.push({ type: "heading", level: 1, text: "Alle Prüfpunkte" });
  for (const c of result.categories) {
    blocks.push({ type: "heading", level: 2, text: c.weight === 0 ? `${c.title} (zählt für deine Branche nicht)` : c.title });
    blocks.push({ type: "list", items: c.items.map((i) => `${mark(i.ok, i.info)}: ${i.label}. ${i.detail}`) });
  }

  blocks.push({ type: "heading", level: 1, text: "Hinweise zur Messung" }, { type: "list", items: measurementNotes(result) });

  return {
    title: `Marketing-Check: ${result.company}`,
    subtitle: `${host(result.url)}, geprüft am ${datum}`,
    firma: result.company,
    datum,
    filename: `marketing-check-${safeFilename(result.company, "betrieb")}`,
    blocks,
  };
}
