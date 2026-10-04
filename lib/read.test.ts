import { describe, expect, it, vi } from "vitest";
import type { FetchResult, Fetcher } from "@/lib/check/net";
import { CheckError } from "@/lib/check/types";
import { READ_MAX_CHARS, readPage } from "@/lib/read";

const HTML = `<html><head><title> Malerei Keller &amp; Co </title><meta name="description" content="Maler in Gossau"></head>
<body><script>var x = "geheim";</script><style>.a{}</style><h1>Wir <em>streichen</em> Fassaden</h1><p>Seit Jahren in Gossau.</p>
<h2>Angebot</h2><ul><li>Fassaden</li><li>Innenräume</li></ul><noscript>nein</noscript></body></html>`;

const page = (url: string, body = HTML, status = 200): FetchResult => ({ url: new URL(url), status, ok: status < 300, headers: {}, body, ms: 10 });

describe("readPage", () => {
  it("liefert Host, Titel, Beschreibung, Überschriften und den sichtbaren Text ohne Skripte", async () => {
    const fetcher: Fetcher = async (url) => page(url);
    const out = await readPage("www.malerei-keller.ch", fetcher);
    expect(out).toMatchObject({ url: "https://www.malerei-keller.ch/", host: "malerei-keller.ch", title: "Malerei Keller & Co", description: "Maler in Gossau", truncated: false });
    expect(out.headings).toEqual(["Wir streichen Fassaden", "Angebot"]);
    expect(out.text).toContain("Seit Jahren in Gossau.");
    expect(out.text).toContain("Fassaden Innenräume");
    expect(out.text).not.toContain("geheim");
    expect(out.text).not.toContain("nein");
  });

  it("kürzt langen Text auf die Obergrenze und sagt es", async () => {
    const long = `<html><body><p>${"wort ".repeat(5000)}</p></body></html>`;
    const out = await readPage("keller.ch", async (url) => page(url, long));
    expect(out.text.length).toBe(READ_MAX_CHARS);
    expect(out.truncated).toBe(true);
  });

  it("versucht nach https noch http und meldet sonst «nicht erreichbar»", async () => {
    const tried: string[] = [];
    const fetcher: Fetcher = async (url) => {
      tried.push(url);
      if (url.startsWith("https://")) throw new Error("tls");
      return page(url);
    };
    expect((await readPage("alt.ch", fetcher)).url).toBe("http://alt.ch/");
    expect(tried).toEqual(["https://alt.ch/", "http://alt.ch/"]);
    await expect(readPage("alt.ch", vi.fn().mockRejectedValue(new Error("down")) as unknown as Fetcher)).rejects.toMatchObject({ code: "unreachable" });
    await expect(readPage("alt.ch", async (url) => page(url, "", 500))).rejects.toMatchObject({ code: "unreachable" });
  });

  it("gibt gesperrte und ungültige Adressen als CheckError weiter", async () => {
    await expect(readPage("http://127.0.0.1", async () => page("http://127.0.0.1"))).rejects.toMatchObject({ code: "invalid" });
    await expect(readPage("ftp://keller.ch")).rejects.toMatchObject({ code: "invalid" });
    const blocked: Fetcher = async () => {
      throw new CheckError("Interne Adressen sind nicht erlaubt.", "blocked");
    };
    await expect(readPage("intern.example", blocked)).rejects.toMatchObject({ code: "blocked" });
  });
});
