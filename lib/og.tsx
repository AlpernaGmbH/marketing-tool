import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const OG_SIZE = { width: 1200, height: 630 } as const;

function font(file: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(process.cwd(), "public", "fonts", file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** Social-Bild: weiss, Deep Black, ein gelber Balken. Poppins und Montserrat wie auf der Seite. */
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
          background: "#ffffff",
          color: "#0a0a0a",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 12, background: "#ffc629" }} />
          <div style={{ fontFamily: "Montserrat", fontSize: 30, fontWeight: 500, color: "#5e5a53" }}>
            {opts.eyebrow}
          </div>
        </div>
        <div style={{ fontFamily: "Poppins", fontSize: 76, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>
          {opts.title}
        </div>
        <div style={{ fontFamily: "Poppins", fontSize: 34, fontWeight: 700 }}>Alperna · tools.alperna.ch</div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Poppins", data: font("poppins-latin-700-normal.woff"), weight: 700, style: "normal" },
        { name: "Montserrat", data: font("montserrat-latin-500-normal.woff"), weight: 500, style: "normal" },
      ],
    },
  );
}
