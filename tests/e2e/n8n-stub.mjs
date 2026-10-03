// Ersatz für den n8n-Webhook im Smoke-Test: nimmt POST /hook entgegen und gibt sie unter GET /received wieder her.
import http from "node:http";

const received = [];
http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/received") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(received));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        received.push(JSON.parse(body));
      } catch {
        received.push({ raw: body });
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
  })
  .listen(3998, "127.0.0.1", () => console.log("n8n-Stub auf 3998"));
