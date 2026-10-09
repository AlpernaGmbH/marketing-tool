// Gemeinsames Dokumentmodell für PDF, DOCX und Markdown-Copy (CLAUDE.md, DocumentExport).
// Ein Tool baut ein DocumentModel; die Ausgabeformate kümmern sich um Layout.

/** Grundbausteine: Das können PDF, Word und Markdown. */
export type BasicBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  /** `widths` sind relative Spaltenbreiten (z. B. [2, 1, 1]); ohne Angabe sind alle Spalten gleich breit. */
  | { type: "table"; header: string[]; rows: string[][]; widths?: number[] }
  /** Steckbrief: Bezeichnung und Wert untereinander. */
  | { type: "facts"; items: { label: string; value: string }[] };

/**
 * Bildschirm-Bausteine (Beschluss vom 09.10.2026: Ergebnisse sollen man ansehen wollen). Am Bildschirm zeigt DocView sie als Kennzahl,
 * Balken, Karten, Kuchen, Raster oder Folien; in PDF, Word und Markdown werden sie über `flattenBlocks` zu Grundbausteinen
 * (Absatz, Liste, Tabelle), damit jede Datei weiter vollständig ist.
 */
export type VisualBlock =
  /** Grosse Kennzahl, zum Beispiel 72 von 100 mit Einstufung. */
  | { type: "stat"; label: string; value: string; of?: string; band?: string; note?: string }
  /** Balken mit Beschriftung; `max` ist das Ende der Skala (Standard: der grösste Wert). */
  | { type: "bars"; title?: string; unit?: string; max?: number; items: { label: string; value: number; note?: string; /** Hebt einen Balken hervor (Gold), zum Beispiel die schwächste Dimension. */ highlight?: boolean }[] }
  /** Nummerierte Schritte als Karten. */
  | { type: "steps"; title?: string; items: { title: string; text: string }[] }
  /** Karten in einem Raster, optional mit Marke (zum Beispiel Format oder Aufwand). */
  | { type: "cards"; title?: string; items: { title: string; text?: string; tag?: string }[] }
  /** Anteile in Prozent als Kuchen mit Legende. */
  | { type: "split"; title?: string; items: { label: string; value: number }[] }
  /** Raster mit Spalten (zum Beispiel Wochentage) und beschrifteten Zeilen. */
  | { type: "grid"; title?: string; columns: string[]; rows: { label: string; cells: string[] }[] }
  /** Karten zum Durchblättern (Pfeile, Wischen, Tastatur). */
  | { type: "slides"; title?: string; items: { title: string; text: string; tag?: string }[] }
  /**
   * Netzdiagramm für drei bis acht Werte derselben Skala (Standard 0 bis 100), zum Beispiel die Dimensionen eines Reifegrads.
   * `highlight` markiert einen Wert in Gold. Die Legende nennt jeden Wert mit Namen und Zahl.
   */
  | { type: "radar"; title?: string; max?: number; items: { label: string; value: number; note?: string; highlight?: boolean }[] }
  /** Zuklappbarer Teil für Nebensächliches (Details, Annahmen); in PDF, Word und Markdown steht er offen als Abschnitt. */
  | { type: "details"; title: string; summary?: string; blocks: DocBlock[] };

export type DocBlock = BasicBlock | VisualBlock;

const num = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
/** Zeilenumbrüche in Texten von Karten und Schritten werden in Datei und Liste zu einem Leerzeichen (eine Listenzeile bleibt eine Zeile). */
const oneLine = (s: string) => s.replace(/([.!?:;])\s*\n+\s*/g, "$1 ").replace(/\s*\n+\s*/g, "; ");

/** Macht aus Bildschirm-Bausteinen Grundbausteine; Grundbausteine bleiben unverändert. */
export function flattenBlocks(blocks: DocBlock[]): BasicBlock[] {
  const out: BasicBlock[] = [];
  const title = (t?: string) => {
    if (t) out.push({ type: "heading", level: 3, text: t });
  };
  for (const b of blocks) {
    switch (b.type) {
      case "stat":
        out.push({ type: "paragraph", text: `${b.label}: ${b.value}${b.of ? ` von ${b.of}` : ""}${b.band ? ` (${b.band})` : ""}.${b.note ? ` ${b.note}` : ""}` });
        break;
      case "bars":
        title(b.title);
        out.push({
          type: "table",
          header: ["", b.unit === "%" ? "Anteil" : "Wert"],
          rows: b.items.map((it) => [it.label, `${num(it.value)}${b.unit === "%" ? " %" : b.unit ? ` ${b.unit}` : ""}${it.note ? `, ${it.note}` : ""}`]),
          widths: [2, 1],
        });
        break;
      case "steps":
        title(b.title);
        out.push({ type: "list", ordered: true, items: b.items.map((it) => `${it.title}: ${oneLine(it.text)}`) });
        break;
      case "cards":
      case "slides":
        title(b.title);
        out.push({ type: "list", items: b.items.map((it) => `${it.title}${it.tag ? ` (${it.tag})` : ""}${it.text ? `: ${oneLine(it.text)}` : ""}`) });
        break;
      case "split":
        title(b.title);
        out.push({ type: "table", header: ["", "Anteil"], rows: b.items.map((it) => [it.label, `${num(it.value)} %`]), widths: [2, 1] });
        break;
      case "radar":
        title(b.title);
        out.push({
          type: "table",
          header: ["", "Wert"],
          rows: b.items.map((it) => [it.label, `${num(it.value)}${it.note ? `, ${it.note}` : ""}`]),
          widths: [2, 1],
        });
        break;
      case "details":
        out.push({ type: "heading", level: 2, text: b.title });
        if (b.summary) out.push({ type: "paragraph", text: b.summary });
        out.push(...flattenBlocks(b.blocks));
        break;
      case "grid":
        title(b.title);
        out.push({ type: "table", header: ["", ...b.columns], rows: b.rows.map((r) => [r.label, ...b.columns.map((_, i) => (r.cells[i] ?? "").replace(/\n+/g, "; "))]) });
        break;
      default:
        out.push(b);
    }
  }
  return out;
}

export type DocumentModel = {
  title: string;
  subtitle?: string;
  /** Firmenname im Kopf. Fehlt er, steht «Alperna» dort. */
  firma?: string;
  /** Datum im Kopf, bereits formatiert (dateCH). */
  datum?: string;
  blocks: DocBlock[];
  /** Dateiname ohne Endung, z. B. «icp-malerei-keller». */
  filename: string;
};

export const FOOTER_TEXT = "Erstellt mit tools.alperna.ch";

/** Dateiname ohne Sonderzeichen: «Malerei Keller, Gossau» → «malerei-keller-gossau». */
export function safeFilename(base: string, fallback = "dokument"): string {
  const s = base
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || fallback;
}

const escapeCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Markdown für «Text kopieren». Frei verfügbar, nie hinter dem LeadGate. */
export function toMarkdown(model: DocumentModel): string {
  const out: string[] = [`# ${model.title}`];
  if (model.subtitle) out.push(`_${model.subtitle}_`);
  for (const b of flattenBlocks(model.blocks)) {
    switch (b.type) {
      case "heading":
        out.push(`${"#".repeat(Math.min(b.level + 1, 6))} ${b.text}`);
        break;
      case "paragraph":
        out.push(b.text);
        break;
      case "list":
        out.push(b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : "-"} ${it}`).join("\n"));
        break;
      case "table": {
        const cols = b.header.length;
        out.push(
          [
            `| ${b.header.map(escapeCell).join(" | ")} |`,
            `| ${Array(cols).fill("---").join(" | ")} |`,
            ...b.rows.map((r) => `| ${Array.from({ length: cols }, (_, i) => escapeCell(r[i] ?? "")).join(" | ")} |`),
          ].join("\n"),
        );
        break;
      }
      case "facts":
        out.push(b.items.map((f) => `- **${f.label}:** ${f.value}`).join("\n"));
        break;
    }
  }
  return out.join("\n\n") + "\n";
}
