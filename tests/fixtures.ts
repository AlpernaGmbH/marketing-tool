import { defineTool } from "@/lib/define-tool";

/** n Füllwörter ohne Satzzeichen, damit Wortzahlen exakt stimmen. */
export function words(n: number, seed = "wort"): string {
  return Array.from({ length: n }, (_, i) => `${seed}${i % 7}`).join(" ");
}

type Over = {
  front?: Partial<Record<"title" | "description" | "h1" | "tagline" | "beispielFirma", string | null>>;
  /** Die zwei Listen der Kopfdaten; null lässt sie weg. */
  kurz?: string[] | null;
  ablauf?: string[] | null;
  warum?: string;
  nutzen?: string;
  fehler?: string;
  beispiel?: string;
  faqCount?: number;
  /** Wörter je FAQ-Antwort (Standard 55). */
  faqWords?: number;
  alperna?: string;
  extra?: string;
  omit?: ("warum" | "nutzen" | "fehler" | "beispiel" | "fragen" | "alperna")[];
  swap?: boolean;
};

const FIRMA = "Malerei Keller, Gossau";

/** Gültiger Seitentext (rund 600 Wörter, Lese-Vorlage), einzelne Teile lassen sich überschreiben. */
export function validToolMarkdown(o: Over = {}): string {
  const f = {
    title: "ICP-Builder Schweiz – Idealkundenprofil in 8 Fragen",
    description: "Lege dein Idealkundenprofil in acht Fragen fest und bewerte neue Anfragen mit einer Punktekarte.",
    h1: "ICP-Builder für Schweizer KMU",
    tagline: "Dein Idealkunde in 8 Fragen – mit Punktekarte zum Bewerten neuer Anfragen.",
    beispielFirma: FIRMA,
    ...o.front,
  };
  const list = (key: string, items: string[] | null | undefined, fallback: string[]) =>
    items === null ? "" : `\n${key}:\n${(items ?? fallback).map((i) => `  - "${i}"`).join("\n")}`;
  const front =
    Object.entries(f)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k}: "${v}"`)
      .join("\n") +
    list("kurz", o.kurz, ["Du bekommst ein Profil.", "Du beantwortest acht Fragen.", "Danach weisst du, wen du suchst."]) +
    list("ablauf", o.ablauf, ["Fragen beantworten", "Profil lesen", "Punkte nutzen"]);

  const faq = Array.from({ length: o.faqCount ?? 5 }, (_, i) => `### Frage ${i + 1}\n${words(o.faqWords ?? 55, `antwort${i}`)}.`).join("\n\n");
  const blocks: Record<string, string> = {
    warum: `## Warum das wichtig ist\n${o.warum ?? `${words(20, "warum")}.\n\n- ${words(12, "a")}\n- ${words(12, "b")}\n- ${words(12, "c")}\n\n=> Gleich darunter: drei Schritte.`}`,
    nutzen: `## So nutzt du das Ergebnis\n${o.nutzen ?? `1. ${words(20)}\n2. ${words(20)}\n3. ${words(20)}\n\n=> Gleich darunter: die Fehler.`}`,
    fehler: `## Häufige Fehler\n${o.fehler ?? `- ${words(25)}\n- ${words(25)}\n- ${words(25)}`}`,
    beispiel: `## Beispiel\n${o.beispiel ?? `${FIRMA} hat ein Ergebnis. ${words(110, "beispiel")}.`}`,
    fragen: `## Häufige Fragen\n${faq}`,
    alperna:
      `## Alperna\n` +
      (o.alperna ??
        `problem: Dein Google-Profil ist meist der erste Kontakt und oft nicht gepflegt.\nbaustein: Google Business Profil\nbeweis: Ein gepflegtes Profil steht in zwei Wochen.`),
  };
  const order = o.swap
    ? ["nutzen", "warum", "fehler", "beispiel", "fragen", "alperna"]
    : ["warum", "nutzen", "fehler", "beispiel", "fragen", "alperna"];
  const body = order.filter((k) => !o.omit?.includes(k as never)).map((k) => blocks[k]).join("\n\n");
  return `---\n${front}\n---\n\n${body}${o.extra ? `\n\n${o.extra}` : ""}\n`;
}

export const fixtureTool = (over: Partial<Parameters<typeof defineTool>[0]> = {}) =>
  defineTool({
    slug: "icp-builder",
    name: "ICP-Builder",
    category: "strategie",
    audience: "kmu",
    tagline: "Dein Idealkunde in 8 Fragen – mit Punktekarte zum Bewerten neuer Anfragen.",
    keyword: "Idealkundenprofil",
    related: ["positionierung", "zielgruppen-segmente", "persona"],
    needsServer: false,
    usesProfile: ["branche", "kanton", "groesse"],
    writesProfile: ["zielgruppen"],
    outputs: ["pdf", "docx", "copy"],
    estimatedMinutes: 8,
    pathStep: { path: "strategie", order: 2 },
    featured: false,
    ...over,
  });
