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
    "0:0:0:0:0:0:0:1", // nicht gekürzte Schreibweisen von ::1
    "0000:0000:0000:0000:0000:0000:0000:0001",
    "0:0:0:0:0:ffff:7f00:1",
    "0::ffff:7f00:1",
    "::7f00:1", // IPv4-kompatibel
    "::127.0.0.1",
    "64:ff9b::7f00:1", // NAT64 auf 127.0.0.1
    "64:ff9b::a9fe:a9fe", // NAT64 auf die Cloud-Metadaten
    "2002:7f00:1::1", // 6to4 auf 127.0.0.1
    "2002:a9fe:a9fe::1", // 6to4 auf 169.254.169.254
    "2001:0:4136:e378:8000:63bf:3fff:fdd2", // Teredo
    "fec0::1", // Site-Local
    "ff02::1", // Multicast
    "100::1", // Discard
    "fe80::1%eth0", // mit Zone
    "kein-ip",
  ])("%s ist privat", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2a00:1450:4001:81b::200e", "64:ff9b::808:808", "2002:808:808::1"])("%s ist öffentlich", (ip) => {
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
  const bomb = zlib.brotliCompressSync(Buffer.alloc(128 * 1024 * 1024), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 1 } });

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
      } else if (url === "/bomb") {
        // 128 MB Nullen, als Brotli wenige Bytes: Der Entpacker darf nach dem Limit nicht weiterarbeiten.
        res.setHeader("content-encoding", "br");
        res.setHeader("content-type", "text/html");
        res.end(bomb);
      } else if (url.startsWith("/hop/")) {
        const n = Number(url.slice(5));
        setTimeout(() => {
          if (n < 5) {
            res.statusCode = 302;
            res.setHeader("location", `/hop/${n + 1}`);
          }
          res.end("ende");
        }, 400);
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

  it("beendet den Entpacker nach dem Limit: eine Brotli-Bombe belegt danach keine CPU mehr", async () => {
    const r = await get("/bomb", { maxBytes: 1000 });
    expect(r.body.length).toBeLessThanOrEqual(1000);
    const cpu = process.cpuUsage();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const used = process.cpuUsage(cpu);
    expect((used.user + used.system) / 1000).toBeLessThan(350); // ms CPU in 800 ms; vorher rund 1000
  });

  it("hält ein Gesamtbudget für alle Weiterleitungen ein, nicht nur je Station", async () => {
    const started = Date.now();
    // Jede Station braucht 400 ms und bleibt unter dem Limit von 1000 ms; sechs Stationen wären 2,4 s.
    await expect(get("/hop/0", { timeout: 1000 })).rejects.toMatchObject({ code: "unreachable" });
    expect(Date.now() - started).toBeLessThan(2600);
  });

  it("misst die Antwortzeit der letzten Station, nicht der ganzen Weiterleitungskette", async () => {
    const r = await get("/hop/4", { timeout: 2000 }); // 4 -> 5: zwei Stationen à 400 ms
    expect(r.url.pathname).toBe("/hop/5");
    expect(r.ms).toBeLessThan(700);
  });

  it("bricht bei Zeitüberschreitung ab", async () => {
    await expect(get("/slow", { timeout: 200 })).rejects.toMatchObject({ code: "unreachable" });
  });

  it("blockiert den lokalen Server ohne allowPrivate", async () => {
    await expect(safeFetch(base + "/ok")).rejects.toMatchObject({ code: "blocked" });
  });
});
