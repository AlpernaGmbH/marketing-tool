"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KANTONE } from "@/lib/ch";
import { GROESSEN, RECHTSFORMEN, type ProfileKey } from "@/lib/profile";
import { useProfile } from "@/lib/use-profile";

export type BasicField = "organisationstyp" | "firma" | "branche" | "rechtsform" | "ort" | "website" | "kanton" | "groesse";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Props = {
  /** Welche Felder gezeigt werden, in der Reihenfolge der Liste. */
  fields: BasicField[];
  /** Präfix für die Feld-IDs, damit mehrere Formulare auf einer Seite sich nicht stören. */
  idPrefix?: string;
};

/**
 * Grunddaten des Firmenprofils (CLAUDE.md, Firmenprofil). Schreibt jede Änderung sofort in den Browser.
 * Wird von /profil und von Werkzeugen genutzt, die diese Felder schreiben.
 */
export function ProfileFieldsForm({ fields, idPrefix = "p" }: Props) {
  const { profile, ready, update } = useProfile();
  const type = profile.organisationstyp ?? "kmu";
  const set = (key: ProfileKey, value: string) => update({ [key]: value.trim() === "" ? undefined : value });
  const id = (f: string) => `${idPrefix}-${f}`;

  const render: Record<BasicField, React.ReactNode> = {
    organisationstyp: (
      <fieldset key="organisationstyp" className="grid gap-2">
        <legend className="mb-1 font-medium">Ich bin</legend>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["kmu", "KMU oder Selbständige"],
              ["verein", "Verein"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface"
            >
              <input
                type="radio"
                name={`${idPrefix}-organisationstyp`}
                value={value}
                checked={ready && type === value}
                onChange={() => update({ organisationstyp: value, groesse: undefined })}
                className="size-5 accent-ink"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    ),
    firma: (
      <div key="firma" className="grid gap-1.5">
        <Label htmlFor={id("firma")}>{type === "verein" ? "Name des Vereins" : "Firma"}</Label>
        <Input id={id("firma")} autoComplete="organization" value={profile.firma ?? ""} onChange={(e) => set("firma", e.target.value)} />
      </div>
    ),
    branche: (
      <div key="branche" className="grid gap-1.5">
        <Label htmlFor={id("branche")}>{type === "verein" ? "Tätigkeit des Vereins" : "Branche"}</Label>
        <Input id={id("branche")} value={profile.branche ?? ""} onChange={(e) => set("branche", e.target.value)} />
      </div>
    ),
    rechtsform: (
      <div key="rechtsform" className="grid gap-1.5">
        <Label htmlFor={id("rechtsform")}>Rechtsform</Label>
        <select id={id("rechtsform")} className={selectClass} value={profile.rechtsform ?? ""} onChange={(e) => set("rechtsform", e.target.value)}>
          <option value="">Bitte wählen</option>
          {RECHTSFORMEN.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
    ),
    ort: (
      <div key="ort" className="grid gap-1.5">
        <Label htmlFor={id("ort")}>Ort</Label>
        <Input id={id("ort")} autoComplete="address-level2" value={profile.ort ?? ""} onChange={(e) => set("ort", e.target.value)} />
      </div>
    ),
    website: (
      <div key="website" className="grid gap-1.5">
        <Label htmlFor={id("website")}>Website</Label>
        <Input
          id={id("website")}
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="malerei-keller.ch"
          value={profile.website ?? ""}
          onChange={(e) => set("website", e.target.value)}
        />
      </div>
    ),
    kanton: (
      <div key="kanton" className="grid gap-1.5">
        <Label htmlFor={id("kanton")}>Kanton</Label>
        <select id={id("kanton")} className={selectClass} value={profile.kanton ?? ""} onChange={(e) => set("kanton", e.target.value)}>
          <option value="">Bitte wählen</option>
          {KANTONE.map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
            </option>
          ))}
        </select>
      </div>
    ),
    groesse: (
      <div key="groesse" className="grid gap-1.5">
        <Label htmlFor={id("groesse")}>Grösse</Label>
        <select id={id("groesse")} className={selectClass} value={profile.groesse ?? ""} onChange={(e) => set("groesse", e.target.value)}>
          <option value="">Bitte wählen</option>
          {GROESSEN[type].map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
    ),
  };

  return <>{fields.map((f) => render[f])}</>;
}
