// Gemeinsames Dokumentmodell für PDF, DOCX und Markdown-Copy (CLAUDE.md, DocumentExport).
// Ein Tool baut ein DocumentModel; die Ausgabeformate kümmern sich um Layout.

export type DocBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  /** `widths` sind relative Spaltenbreiten (z. B. [2, 1, 1]); ohne Angabe sind alle Spalten gleich breit. */
  | { type: "table"; header: string[]; rows: string[][]; widths?: number[] }
  /** Steckbrief: Bezeichnung und Wert untereinander. */
  | { type: "facts"; items: { label: string; value: string }[] };

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
  for (const b of model.blocks) {
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
