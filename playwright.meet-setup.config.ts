import { defineConfig } from "@playwright/test";
const directory = `.data/conference-e2e/meet-setup/${Date.now()}-${process.pid}/db`;
export default defineConfig({
  testDir: "e2e/meet-setup", timeout: 60_000, workers: 1, fullyParallel: false, outputDir: ".data/meet-setup-browser-results",
  use: { baseURL: "http://127.0.0.1:3130/calendlyisdead/", timezoneId: "UTC", locale: "en-US" },
  webServer: {
    command: "npm run build && node scripts/seed-conference-e2e.mjs && NODE_OPTIONS=--import=./e2e/conferences/provider.mjs next start --hostname 127.0.0.1 -p 3130",
    url: "http://127.0.0.1:3130/calendlyisdead", timeout: 180_000, reuseExistingServer: false,
    env: { DATABASE_URL: "", PGLITE_DIR: directory, DEMO_MODE: "1", AUTH_SECRET: "conference-e2e-only", CRON_SECRET: "conference-e2e-only", RESEND_API_KEY: "", NEXT_PUBLIC_POSTHOG_ENABLED: "false", APP_URL: "http://127.0.0.1:3130/calendlyisdead" },
  },
});
