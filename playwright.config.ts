import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e", timeout: 60_000, use: { baseURL: "http://localhost:3123", viewport: { width: 1280, height: 860 }, timezoneId: "America/New_York" },
  webServer: { command: "rm -rf .data/e2e && npm run build && next start -p 3123", url: "http://localhost:3123", timeout: 180_000, reuseExistingServer: false,
    env: { PGLITE_DIR: ".data/e2e/db", DEMO_MODE: "1", AUTH_SECRET: "e2e-secret", APP_URL: "http://localhost:3123" } },
});
