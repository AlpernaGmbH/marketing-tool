"use client";

import { BranchePicker } from "@/components/tool/BranchePicker";
import { MITGLIEDER_FORMEN, RechtsformSlider } from "@/components/tool/RechtsformSlider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KANTONE } from "@/lib/ch";
import { GROESSEN, type ProfileKey } from "@/lib/profile";
import { useProfile } from "@/lib/use-profile";

export type BasicField = "organisationstyp" | "firma" | "branche" | "rechtsform" | "ort" | "website" | "kanton" | "groesse";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Props = {
  /** Welche Felder gezeigt werden, in der Reihenfolge der Liste. */
  fields: BasicField[];
  /** Präfix für die Feld-IDs, damit mehrere Formulare auf einer Seite sich nicht stören. */
  idPrefix?: string;
  /** Branche zusätzlich als Knöpfe zeigen (Profilseite). */
  brancheChips?: boolean;
};

/**
 * Grunddaten des Firmenprofils (CLAUDE.md, Firmenprofil). Schreibt jede Änderung sofort in den Browser.
 * Wird von /profil und von Werkzeugen genutzt, die diese Felder schreiben.
 */
export function ProfileFieldsForm({ fields, idPrefix = "p", brancheChips = false }: Props) {
  const { profile, ready, update } = useProfile();
  const type = profile.organisationstyp ?? "kmu";
  const set = (key: ProfileKey, value: string) => update({ [key]: value.trim() === "" ? undefined : value });
  const id = (f: string) => `${idPrefix}-${f}`;
  // Die Rechtsform bestimmt, ob die Werkzeuge mit Kundschaft (KMU) oder mit Mitgliedern (Verein, Stiftung) schreiben. Ohne Wahl: KMU.
  // Profile aus der Zeit mit dem Schalter «KMU / Verein» tragen nur den Organisationstyp; sie zeigen «Verein».
  const rechtsform = profile.rechtsform && profile.rechtsform.trim() ? profile.rechtsform : type === "verein" ? "Verein" : "";
  const slider = (
    <RechtsformSlider
      key="rechtsform"
      idPrefix={idPrefix}
      value={rechtsform}
      ready={ready}
      onChange={(value) => {
        const nextType = MITGLIEDER_FORMEN.includes(value) ? "verein" : "kmu";
        update({ rechtsform: value === "" ? undefined : value, organisationstyp: nextType, ...(nextType !== type ? { groesse: undefined } : {}) });
      }}
    />
  );

  const render: Record<BasicField, React.ReactNode> = {
    organisationstyp: slider,
    firma: (
      <div key="firma" className="grid gap-1.5">
        <Label htmlFor={id("firma")}>{type === "verein" ? "Name des Vereins" : "Firma"}</Label>
        <Input id={id("firma")} autoComplete="organization" value={profile.firma ?? ""} onChange={(e) => set("firma", e.target.value)} />
      </div>
    ),
    branche: (
      <BranchePicker key="branche" id={id("branche")} label={type === "verein" ? "Tätigkeit des Vereins" : "Branche"} value={profile.branche ?? ""} onChange={(v) => set("branche", v)} chips={brancheChips} />
    ),
    rechtsform: slider,
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
