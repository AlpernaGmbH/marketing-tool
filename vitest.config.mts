import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Komponenten-Tests (*.test.tsx) setzen oben `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    // Komponenten-Tests mit PDF, Dateien und vielen Feldern brauchen auf einem ausgelasteten Rechner (CI, parallele Läufe) mehr als 5 s.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
