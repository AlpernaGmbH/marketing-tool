import { safeFilename } from "@/lib/export/model";

// QR-Set: reine Funktionen, kein React, kein DOM, keine Bibliothek (CLAUDE.md, Harte Regel 3). Alles, was die Bibliotheken
// qrcode, jszip und pdf-lib braucht, steht in export.ts (Browser). Hier: Arten der Ziele, Normalisierung und Prüfung,
// Layout des Druckbogens in Punkt, Dateinamen, SVG aus einer Modulmatrix, Texte fürs CRM und der gespeicherte Stand.
// Spec: specs/qr-set.md

export const SLUG = "qr-set";
export const MAX_TARGETS = 6;
export const MAX_LABEL = 40;
export const MAX_INPUT = 500;

/** Heller Rand rundum, in Modulen: die Ruhezone nach ISO/IEC 18004 (Quelle: DENSO WAVE, qrcode.com/en/howto/code.html). */
export const QUIET_ZONE = 4;

/** Richtwerte von Alperna, keine Statistik (TOOL-BAUEN.md, Abschnitt 5). */
export const RICHTWERT = { minCm: 2 } as const;
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";

/** Hinweise unter dem Ergebnis, im Druckbogen nicht enthalten. */
export const HINWEISE: readonly string[] = [
  `Druck jeden Code mindestens ${RICHTWERT.minCm} cm breit (${RICHTWERT_NOTE}).`,
  `Lass rundum einen hellen Rand von ${QUIET_ZONE} Modulen frei; das ist die Ruhezone nach ISO/IEC 18004. Druckbogen, SVG und PNG haben ihn schon.`,
  "Dunkel auf hell: kein Code in Weiss auf Farbe, kein Code auf einem Foto.",
  "Teste jeden Code vor dem Druck mit zwei Handys, einmal bei Tageslicht und einmal bei Lampenlicht.",
];

// ---- Arten der Ziele -------------------------------------------------------------------------------

export const KIND_KEYS = ["website", "instagram", "linkedin", "whatsapp", "google", "pdf", "other"] as const;
export type TargetKind = (typeof KIND_KEYS)[number];

export type TargetKindInfo = {
  key: TargetKind;
  /** Text im Select «Art». */
  label: string;
  /** Vorschlag für die Beschriftung; leer bei «Anderer Link». */
  suggestion: string;
  placeholder: string;
  /** Hilfetext unter dem Feld «Adresse». */
  help: string;
};

export const TARGET_KINDS: readonly TargetKindInfo[] = [
  { key: "website", label: "Website", suggestion: "Unsere Website", placeholder: "malerei-keller.ch", help: "Die Adresse deiner Website, mit oder ohne https://." },
  { key: "instagram", label: "Instagram", suggestion: "Instagram", placeholder: "@malereikeller", help: "Dein Instagram-Handle oder die Adresse deines Profils." },
  { key: "linkedin", label: "LinkedIn", suggestion: "LinkedIn", placeholder: "linkedin.com/company/malerei-keller", help: "Die Adresse deiner LinkedIn-Seite oder deines Profils." },
  { key: "whatsapp", label: "WhatsApp", suggestion: "Schreib uns auf WhatsApp", placeholder: "079 123 45 67", help: "Deine Schweizer WhatsApp-Nummer oder ein wa.me-Link." },
  { key: "google", label: "Google-Bewertung", suggestion: "Bewerte uns auf Google", placeholder: "g.page/r/…/review", help: "Der Link «Bewertung schreiben» aus deinem Google-Unternehmensprofil. Auf den Code kommt nur das Wort «Google», kein Logo. Frag ohne Gegenleistung, Google lässt keine Anreize für Bewertungen zu (Quelle: Google, Richtlinien für von Maps-Nutzern veröffentlichte Inhalte)." },
  { key: "pdf", label: "Speisekarte oder PDF", suggestion: "Speisekarte", placeholder: "malerei-keller.ch/preisliste.pdf", help: "Die Adresse der Datei auf deiner Website." },
  { key: "other", label: "Anderer Link", suggestion: "", placeholder: "https://…", help: "Jede Adresse, die mit http:// oder https:// beginnt." },
];

export function kindInfo(kind: TargetKind): TargetKindInfo {
  return TARGET_KINDS.find((k) => k.key === kind) ?? TARGET_KINDS[TARGET_KINDS.length - 1];
}

export const isKind = (v: unknown): v is TargetKind => typeof v === "string" && (KIND_KEYS as readonly string[]).includes(v);

/** Vorschlag für die Beschriftung je Art («Unsere Website»); leer bei «Anderer Link». */
export function defaultLabel(kind: TargetKind): string {
  return kindInfo(kind).suggestion;
}

// ---- Telefonnummer (minimal, für WhatsApp) ---------------------------------------------------------

export type Phone = { e164: string; display: string };

/**
 * Schweizer Nummer in E.164 ohne Plus («41791234567»), aus 079 123 45 67, 0791234567, +41 79 123 45 67 oder 0041791234567,
 * mit Leerzeichen, Punkten, Schrägstrichen, Bindestrichen oder Klammern. Nur Landesvorwahl 41 und danach neun Ziffern,
 * die erste nicht 0. Eigene minimale Fassung; tools/whatsapp-link/logic.ts kann sie später ersetzen.
 */
export function normalizePhone(input: string): Phone | null {
  const raw = (input ?? "").trim();
  if (!raw || /[^\d\s+().\/-]/.test(raw)) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `41${digits.slice(1)}`;
  if (!/^41[1-9]\d{8}$/.test(digits)) return null;
  const n = digits.slice(2);
  return { e164: digits, display: `+41 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}` };
}

/** wa.me-Link; ein vorausgefüllter Text bleibt als text-Parameter erhalten. */
export function buildWaLink(e164: string, text = ""): string {
  const t = text.trim();
  return t ? `https://wa.me/${e164}?text=${encodeURIComponent(t)}` : `https://wa.me/${e164}`;
}

// ---- Normalisierung ---------------------------------------------------------------------------------

export type NormalizedTarget = {
  /** Was im Code steht. */
  url: string;
  /** Was unter dem Code steht: lesbar, ohne https://. */
  display: string;
};

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

/** http(s)-Adresse mit Host; ohne Schema wird https:// ergänzt. null bei allem anderen. */
export function parseHttpUrl(input: string): URL | null {
  const raw = (input ?? "").trim();
  if (!raw || /\s/.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(SCHEME_RE.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!HOST_RE.test(u.hostname) || u.username || u.password) return null;
  return u;
}

/** «https://malerei-keller.ch/» → «malerei-keller.ch»; Pfad und Abfrage bleiben. */
export function displayOf(u: URL): string {
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
  return `${u.host}${path}${u.search}`.replace(/^www\./, "");
}

const hostIs = (hostname: string, domains: string[]): boolean =>
  domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));

const GOOGLE_RE = /(?:^|\.)(?:google\.[a-z.]+|g\.page|goo\.gl)$/i;

/** Aus Art und Eingabe die Adresse für den Code und den Text darunter. null: nicht gültig (Meldung über targetProblem). */
export function normalizeTarget(kind: TargetKind, input: string): NormalizedTarget | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  switch (kind) {
    case "instagram": {
      let handle: string;
      if (/instagram\.com/i.test(raw)) {
        const u = parseHttpUrl(raw);
        if (!u || !hostIs(u.hostname, ["instagram.com"])) return null;
        handle = u.pathname.split("/").filter(Boolean)[0] ?? "";
      } else {
        handle = raw.replace(/^@/, "");
      }
      if (!HANDLE_RE.test(handle)) return null;
      return { url: `https://www.instagram.com/${handle}/`, display: `instagram.com/${handle}` };
    }
    case "linkedin": {
      const u = parseHttpUrl(raw);
      if (!u || !hostIs(u.hostname, ["linkedin.com"])) return null;
      return { url: u.href, display: displayOf(u) };
    }
    case "whatsapp": {
      if (/wa\.me|whatsapp\.com/i.test(raw)) {
        const u = parseHttpUrl(raw);
        if (!u || !hostIs(u.hostname, ["wa.me", "whatsapp.com"])) return null;
        const number = u.hostname.endsWith("wa.me") ? u.pathname.split("/").filter(Boolean)[0] ?? "" : (u.searchParams.get("phone") ?? "");
        const phone = normalizePhone(number.startsWith("+") || number.startsWith("00") ? number : `+${number}`);
        if (!phone) return null;
        return { url: buildWaLink(phone.e164, u.searchParams.get("text") ?? ""), display: phone.display };
      }
      const phone = normalizePhone(raw);
      if (!phone) return null;
      return { url: buildWaLink(phone.e164), display: phone.display };
    }
    case "google": {
      const u = parseHttpUrl(raw);
      if (!u || !GOOGLE_RE.test(u.hostname)) return null;
      return { url: u.href, display: displayOf(u) };
    }
    case "website":
    case "pdf":
    case "other": {
      const u = parseHttpUrl(raw);
      if (!u) return null;
      return { url: u.href, display: displayOf(u) };
    }
  }
}

// ---- Prüfung ----------------------------------------------------------------------------------------

export type Target = { kind: TargetKind; input: string; label: string };

const ADDRESS_PROBLEM: Record<TargetKind, string> = {
  website: "Das ist keine gültige Adresse. Sie hat einen Domainnamen, zum Beispiel malerei-keller.ch.",
  instagram: "Gib dein Instagram-Handle an (Buchstaben, Ziffern, Punkt, Unterstrich, bis 30 Zeichen) oder die Adresse deines Profils.",
  linkedin: "Das ist keine LinkedIn-Adresse. Sie beginnt mit linkedin.com.",
  whatsapp: "Gib eine Schweizer Nummer an, zum Beispiel 079 123 45 67, oder einen wa.me-Link.",
  google: "Das ist kein Google-Link. Nimm den Link «Bewertung schreiben» aus deinem Google-Unternehmensprofil.",
  pdf: "Das ist keine gültige Adresse. Sie hat einen Domainnamen, zum Beispiel malerei-keller.ch/preisliste.pdf.",
  other: "Das ist keine gültige Adresse. Sie beginnt mit http:// oder https:// und hat einen Domainnamen.",
};

/** Meldet, was an einem Ziel fehlt oder nicht stimmt. null: in Ordnung. Doppelte Ziele prüft rowProblems. */
export function targetProblem(target: Target): string | null {
  if (!isKind(target.kind)) return "Wähle eine Art.";
  if (!(target.input ?? "").trim()) return "Gib eine Adresse an.";
  if ((target.input ?? "").length > MAX_INPUT) return `Die Adresse ist zu lang. Es sind höchstens ${MAX_INPUT} Zeichen möglich.`;
  if (!normalizeTarget(target.kind, target.input)) return ADDRESS_PROBLEM[target.kind];
  const label = (target.label ?? "").trim();
  if (!label) return "Gib eine Beschriftung an.";
  if (label.length > MAX_LABEL) return `Die Beschriftung ist zu lang. Es sind höchstens ${MAX_LABEL} Zeichen möglich.`;
  return null;
}

/** Meldung je Zeile, auch für doppelte Adressen («Dieselbe Adresse wie Ziel 1.»). */
export function rowProblems(ziele: Target[]): (string | null)[] {
  const seen = new Map<string, number>();
  return ziele.map((z, i) => {
    const own = targetProblem(z);
    if (own) return own;
    const url = normalizeTarget(z.kind, z.input)!.url.toLowerCase();
    const first = seen.get(url);
    if (first !== undefined) return `Dieselbe Adresse wie Ziel ${first + 1}.`;
    seen.set(url, i);
    return null;
  });
}

/** Erste Meldung für das ganze Formular. null: es kann losgehen. */
export function formProblem(ziele: Target[]): string | null {
  if (ziele.length === 0) return "Füge mindestens ein Ziel hinzu.";
  if (ziele.length > MAX_TARGETS) return `Höchstens ${MAX_TARGETS} Ziele sind möglich.`;
  const problems = rowProblems(ziele);
  const i = problems.findIndex((p) => p !== null);
  return i < 0 ? null : `Ziel ${i + 1}: ${problems[i]}`;
}

// ---- Codes ------------------------------------------------------------------------------------------

export type QrCode = {
  /** 1 bis 6 */
  nr: number;
  kind: TargetKind;
  kindLabel: string;
  label: string;
  url: string;
  display: string;
};

/** Die gültigen Ziele als Codes, in der Reihenfolge der Liste; ungültige Zeilen fallen weg. */
export function buildCodes(ziele: Target[]): QrCode[] {
  const out: QrCode[] = [];
  for (const z of ziele.slice(0, MAX_TARGETS)) {
    if (targetProblem(z)) continue;
    const n = normalizeTarget(z.kind, z.input)!;
    if (out.some((c) => c.url.toLowerCase() === n.url.toLowerCase())) continue;
    out.push({ nr: out.length + 1, kind: z.kind, kindLabel: kindInfo(z.kind).label, label: z.label.trim(), url: n.url, display: n.display });
  }
  return out;
}

// ---- Druckbogen A4 ----------------------------------------------------------------------------------

/** Punkt je Millimeter (72 pt je Zoll). */
export const MM = 72 / 25.4;
export const A4 = { w: 595.28, h: 841.89 } as const;

/** Masse des Bogens in Punkt: 2 Spalten × 3 Reihen, Felder 90 × 80 mm, Code 50 mm, Raster in der Mitte der Seite. */
export const SHEET = {
  cols: 2,
  rows: 3,
  cellW: 90 * MM,
  cellH: 80 * MM,
  qr: 50 * MM,
  /** Abstand vom oberen Feldrand zum Code. */
  padTop: 8 * MM,
  /** Grundlinie der Beschriftung unter dem Code: Platz für die Ruhezone. */
  labelGap: 11 * MM,
  /** Grundlinie der Adresse unter der Beschriftung. */
  urlGap: 5 * MM,
  /** Platz für Kopf und Fuss. */
  top: 70,
  bottom: 50,
} as const;

export type Cell = {
  nr: number;
  /** Linke untere Ecke des Felds (pdf-lib zählt von unten). */
  x: number;
  y: number;
  w: number;
  h: number;
  centerX: number;
  qr: { x: number; y: number; size: number };
  labelY: number;
  urlY: number;
};

/** Positionen für n Codes (1 bis 6) in Punkt; das Raster ist auf der Seite zentriert, die Felder überlappen nicht. */
export function layoutA4(n: number): Cell[] {
  const count = Math.max(0, Math.min(MAX_TARGETS, Math.floor(Number.isFinite(n) ? n : 0)));
  const gridW = SHEET.cols * SHEET.cellW;
  const gridH = SHEET.rows * SHEET.cellH;
  const x0 = (A4.w - gridW) / 2;
  const free = A4.h - SHEET.top - SHEET.bottom - gridH;
  const yTop = A4.h - SHEET.top - free / 2;
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % SHEET.cols;
    const row = Math.floor(i / SHEET.cols);
    const x = x0 + col * SHEET.cellW;
    const top = yTop - row * SHEET.cellH;
    const y = top - SHEET.cellH;
    const qrY = top - SHEET.padTop - SHEET.qr;
    cells.push({
      nr: i + 1,
      x,
      y,
      w: SHEET.cellW,
      h: SHEET.cellH,
      centerX: x + SHEET.cellW / 2,
      qr: { x: x + (SHEET.cellW - SHEET.qr) / 2, y: qrY, size: SHEET.qr },
      labelY: qrY - SHEET.labelGap,
      urlY: qrY - SHEET.labelGap - SHEET.urlGap,
    });
  }
  return cells;
}

// ---- Dateien ----------------------------------------------------------------------------------------

/** «1-unsere-website.svg» */
export function zipFilename(nr: number, label: string, ext: "svg" | "png"): string {
  return `${nr}-${safeFilename(label, "qr-code")}.${ext}`;
}

/** «qr-set-malerei-keller» (ohne Endung); ohne Firma «qr-set». */
export function setFilename(firma?: string): string {
  const f = (firma ?? "").trim();
  return f ? `qr-set-${safeFilename(f, "firma")}` : "qr-set";
}

/** SVG aus einer Modulmatrix (true = dunkel), mit Ruhezone; Grösse in Millimetern, damit Druckprogramme sie übernehmen. */
export function svgFromModules(modules: boolean[][], sizeMm = 50, quiet = QUIET_ZONE): string {
  const n = modules.length;
  const total = n + 2 * quiet;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    const row = modules[r] ?? [];
    let c = 0;
    while (c < n) {
      if (!row[c]) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < n && row[c + run]) run++;
      parts.push(`M${c + quiet} ${r + quiet}h${run}v1h-${run}z`);
      c += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeMm}mm" height="${sizeMm}mm" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path d="${parts.join("")}" fill="#000000"/>` +
    `</svg>`
  );
}

// ---- Texte fürs CRM ---------------------------------------------------------------------------------

/** Die Angaben, eine je Zeile (Zugang v3). */
export function eingabeText(ziele: Target[], firma?: string): string {
  const lines: string[] = [];
  const f = (firma ?? "").trim();
  if (f) lines.push(`Firma: ${f}`);
  ziele.forEach((z, i) => {
    lines.push(`Ziel ${i + 1}: ${kindInfo(z.kind).label}, ${z.input.trim()}, Beschriftung «${z.label.trim()}»`);
  });
  return lines.join("\n");
}

/** Das Ergebnis als lesbare Liste (Zugang v3). */
export function ausgabeText(codes: QrCode[]): string {
  const n = codes.length;
  return [
    `${n} ${n === 1 ? "QR-Code" : "QR-Codes"}`,
    ...codes.map((c) => `${c.nr}. ${c.label}: ${c.url}`),
    "",
    "Druckbogen und ZIP erzeugt",
  ].join("\n");
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type QrSetState = { v: 1; phase: "edit" | "result"; ziele: Target[] };
export const EMPTY_STATE: QrSetState = { v: 1, phase: "edit", ziele: [] };

/** Liest den Stand unter mt:qr-set; bei kaputten Daten gilt der leere Stand. «result» nur, wenn alle Ziele gültig sind. */
export function parseState(raw: unknown): QrSetState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Partial<QrSetState>;
  if (r.v !== 1 || !Array.isArray(r.ziele)) return EMPTY_STATE;
  const ziele: Target[] = [];
  for (const z of r.ziele.slice(0, MAX_TARGETS)) {
    if (typeof z !== "object" || z === null) continue;
    const t = z as Partial<Target>;
    if (!isKind(t.kind) || typeof t.input !== "string") continue;
    ziele.push({ kind: t.kind, input: t.input.slice(0, MAX_INPUT), label: typeof t.label === "string" ? t.label.slice(0, MAX_LABEL) : "" });
  }
  return { v: 1, phase: r.phase === "result" && formProblem(ziele) === null ? "result" : "edit", ziele };
}

/** Nummer aus dem Stand des WhatsApp-Werkzeugs (mt:whatsapp-link, Form {v, phase, nummer, text}); null ohne gültige Nummer. */
export function readWhatsappNumber(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const nummer = (raw as { nummer?: unknown }).nummer;
  if (typeof nummer !== "string" || !normalizePhone(nummer)) return null;
  return nummer.trim();
}

/** Vorschlag für die Liste beim ersten Öffnen: Website aus dem Profil, WhatsApp aus dem WhatsApp-Werkzeug, sonst eine leere Zeile. */
export function initialTargets(website?: string, waNummer?: string | null): Target[] {
  const out: Target[] = [];
  const w = (website ?? "").trim();
  if (w) out.push({ kind: "website", input: w, label: defaultLabel("website") });
  if (waNummer) out.push({ kind: "whatsapp", input: waNummer, label: defaultLabel("whatsapp") });
  if (out.length === 0) out.push({ kind: "website", input: "", label: defaultLabel("website") });
  return out;
}

/** Beim Wechsel der Art: die Beschriftung folgt dem Vorschlag, solange sie leer ist oder noch dem alten Vorschlag entspricht. */
export function labelAfterKindChange(label: string, from: TargetKind, to: TargetKind): string {
  const l = label.trim();
  return l === "" || l === defaultLabel(from) ? defaultLabel(to) : label;
}

// ---- Beispiel ---------------------------------------------------------------------------------------

/** Fiktives Beispiel der Malerei Keller, Gossau, für Seitentext und Tests. */
export const SAMPLE_TARGETS: Target[] = [
  { kind: "website", input: "malerei-keller.ch", label: "Unsere Website" },
  { kind: "google", input: "https://g.page/r/malerei-keller/review", label: "Bewerte uns auf Google" },
  { kind: "whatsapp", input: "079 123 45 67", label: "Schreib uns auf WhatsApp" },
  { kind: "instagram", input: "@malereikeller", label: "Instagram" },
];
