import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Smoke-Test gegen den Production-Build: erst `npm run build`, dann `npm run smoke`.
// Redis ist hier bewusst nicht konfiguriert: Es gilt der Pfad «nur Cookie» (CLAUDE.md, Zugangsmodell).
const PORT = 3100;
const chromium = process.env.PW_CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath: chromium, args: ["--no-sandbox"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "node tests/e2e/n8n-stub.mjs", url: "http://127.0.0.1:3998/received", reuseExistingServer: !process.env.CI },
    {
      command: `npx next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        GATE_SECRET: "smoke-secret-smoke-secret-smoke-secret-0123",
        MT_SMOKE: "1",
        N8N_WEBHOOK_URL: "http://127.0.0.1:3998/hook",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
      },
    },
  ],
});
