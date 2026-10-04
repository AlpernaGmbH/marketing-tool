import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateAddress, safeFetch } from "@/lib/check/net";
import { CheckError } from "@/lib/check/types";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // Cloud-Metadaten
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1", // dieselbe Adresse in Hex-Schreibweise
    "::ffff:a9fe:a9fe", // 169.254.169.254 in Hex
    "2001:db8::1",
    "kein-ip",
  ])("%s ist privat", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("%s ist öffentlich", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it.each([
    "http://127.0.0.1/",
    "http://localhost/",
    "http://app.localhost/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://[::ffff:127.0.0.1]/",
    "http://intern.local/",
    "http://db.internal/",
    "http://8.8.8.8:8080/", // fremder Port
    "http://user:pass@8.8.8.8/",
    "ftp://8.8.8.8/",
  ])("blockiert %s", async (raw) => {
    await expect(assertPublicUrl(new URL(raw))).rejects.toBeInstanceOf(CheckError);
  });

  it("lässt eine öffentliche IP durch", async () => {
    await expect(assertPublicUrl(new URL("https://8.8.8.8/"))).resolves.toEqual({ address: "8.8.8.8", family: 4 });
  });

  it("meldet nicht auflösbare Hosts als unerreichbar, nicht als blockiert", async () => {
    await expect(assertPublicUrl(new URL("https://gibt-es-nicht.invalid/"))).rejects.toMatchObject({ code: "unreachable" });
  });
});

describe("safeFetch gegen einen lokalen Server (allowPrivate nur im Test)", () => {
  let server: http.Server;
  let base = "";
  const big = "a".repeat(5000);

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/ok") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end("<html><title>Grüezi</title></html>");
      } else if (url === "/gzip") {
        res.setHeader("content-type", "text/html");
        res.setHeader("content-encoding", "gzip");
        res.end(zlib.gzipSync("<p>komprimiert öäü</p>"));
      } else if (url === "/br") {
        res.setHeader("content-encoding", "br");
        res.end(zlib.brotliCompressSync("<p>brotli</p>"));
      } else if (url === "/latin1") {
        res.setHeader("content-type", "text/html; charset=iso-8859-1");
        res.end(Buffer.from("Gr\xfcezi", "latin1"));
      } else if (url === "/redir") {
        res.statusCode = 302;
        res.setHeader("location", "/ok");
        res.end();
      } else if (url === "/loop") {
        res.statusCode = 302;
        res.setHeader("location", "/loop");
        res.end();
      } else if (url === "/big") {
        res.end(big);
      } else if (url === "/slow") {
        setTimeout(() => res.end("zu spät"), 1500);
      } else {
        res.statusCode = 404;
        res.end("nichts da");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const get = (path: string, o = {}) => safeFetch(base + path, { allowPrivate: true, ...o });

  it("liest Seite, Status und Kopfzeilen", async () => {
    const r = await get("/ok");
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body).toContain("Grüezi");
    expect(r.headers["content-type"]).toContain("text/html");
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it("entpackt gzip und brotli", async () => {
    expect((await get("/gzip")).body).toBe("<p>komprimiert öäü</p>");
    expect((await get("/br")).body).toBe("<p>brotli</p>");
  });

  it("liest Latin-1 anhand des Zeichensatzes", async () => {
    expect((await get("/latin1")).body).toBe("Grüezi");
  });

  it("folgt Weiterleitungen und meldet die Endadresse", async () => {
    const r = await get("/redir");
    expect(r.url.pathname).toBe("/ok");
    expect(r.body).toContain("Grüezi");
  });

  it("bricht Weiterleitungsschleifen ab", async () => {
    await expect(get("/loop")).rejects.toMatchObject({ code: "unreachable" });
  });

  it("meldet 404 als nicht ok, ohne zu werfen", async () => {
    const r = await get("/nirgends");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });

  it("kappt zu grosse Antworten", async () => {
    const r = await get("/big", { maxBytes: 1000 });
    expect(r.body.length).toBeLessThanOrEqual(1000);
    expect(r.body.length).toBeGreaterThan(0);
  });

  it("bricht bei Zeitüberschreitung ab", async () => {
    await expect(get("/slow", { timeout: 200 })).rejects.toMatchObject({ code: "unreachable" });
  });

  it("blockiert den lokalen Server ohne allowPrivate", async () => {
    await expect(safeFetch(base + "/ok")).rejects.toMatchObject({ code: "blocked" });
  });
});
