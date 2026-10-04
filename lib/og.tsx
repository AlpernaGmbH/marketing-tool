import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const OG_SIZE = { width: 1200, height: 630 } as const;

function font(file: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(process.cwd(), "public", "fonts", file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** Social-Bild: Papier, Tinte, ein goldener Balken. Geist wie auf der Seite. */
export function renderOg(opts: { eyebrow: string; title: string }): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F3F1EC",
          color: "#0F0F0E",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 12, background: "#FFD700" }} />
          <div style={{ fontFamily: "Geist", fontSize: 30, fontWeight: 500, color: "#65645F" }}>
            {opts.eyebrow}
          </div>
        </div>
        <div style={{ fontFamily: "Geist", fontSize: 80, fontWeight: 600, lineHeight: 1.04, letterSpacing: -2.5, maxWidth: 1000 }}>
          {opts.title}
        </div>
        <div style={{ fontFamily: "Geist", fontSize: 34, fontWeight: 600 }}>Alperna · tools.alperna.ch</div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Geist", data: font("geist-latin-600-normal.woff"), weight: 600, style: "normal" },
        { name: "Geist", data: font("geist-latin-500-normal.woff"), weight: 500, style: "normal" },
      ],
    },
  );
}
