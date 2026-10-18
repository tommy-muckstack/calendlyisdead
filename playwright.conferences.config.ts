import { defineConfig } from "@playwright/test";
const directory = `.data/conference-e2e/${Date.now()}-${process.pid}/db`;
export default defineConfig({
  testDir: "e2e/conferences", timeout: 60_000, workers: 1, fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3125/calendlyisdead/", timezoneId: "UTC" },
  webServer: {
    command: "npm run build && node scripts/seed-conference-e2e.mjs && NODE_OPTIONS=--import=./e2e/conferences/provider.mjs next start --hostname 127.0.0.1 -p 3125",
    url: "http://127.0.0.1:3125/calendlyisdead", timeout: 180_000, reuseExistingServer: false,
    env: { DATABASE_URL: "", PGLITE_DIR: directory, DEMO_MODE: "1", AUTH_SECRET: "conference-e2e-only", CRON_SECRET: "conference-e2e-only", RESEND_API_KEY: "", NEXT_PUBLIC_POSTHOG_ENABLED: "false", APP_URL: "http://127.0.0.1:3125/calendlyisdead" },
  },
});
