import QRCode from "qrcode";
import { QUIET_ZONE, svgFromModules } from "./logic";

// Die Codes selbst, mit der Bibliothek qrcode. Diese Datei ist klein und wird mit der Oberfläche geladen (Vorschau);
// pdf-lib und jszip liegen in export.ts und laden erst beim Download.

/** Fehlerkorrektur M: Standardstufe, genügt für Links auf Flyer und Aufkleber. */
export const QR_OPTIONS = { errorCorrectionLevel: "M" } as const;

/** Modulmatrix (true = dunkel) eines Codes, ohne Ruhezone. Synchron, ohne Canvas. */
export function qrModules(text: string): boolean[][] {
  const q = QRCode.create(text, QR_OPTIONS);
  const n = q.modules.size;
  const out: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(q.modules.get(r, c) === 1);
    out.push(row);
  }
  return out;
}

/** SVG mit Ruhezone, Grösse 50 mm. */
export function qrSvg(text: string, sizeMm = 50): string {
  return svgFromModules(qrModules(text), sizeMm);
}

/** Als data-URL für ein img-Element. */
export function qrSvgDataUrl(text: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text))}`;
}

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PNG mit Ruhezone, schwarz auf weiss, Kantenlänge in Pixeln (Standard 1024). Braucht ein Canvas (Browser). */
export async function qrPng(text: string, size = 1024): Promise<Uint8Array> {
  const url = await QRCode.toDataURL(text, { ...QR_OPTIONS, width: size, margin: QUIET_ZONE, color: { dark: "#000000ff", light: "#ffffffff" } });
  return bytesFromDataUrl(url);
}
