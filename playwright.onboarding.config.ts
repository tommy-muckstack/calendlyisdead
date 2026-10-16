import { defineConfig } from "@playwright/test";
// Separate fresh database; unlike the legacy config, this does not delete shared fixtures/outbox.
const directory = `.data/onboarding-e2e/${Date.now()}-${process.pid}/db`;
export default defineConfig({
  testDir: "e2e/onboarding", timeout: 60_000, workers: 1, fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3124/calendlyisdead/", timezoneId: "Europe/Paris" },
  webServer: {
    command: "npm run build && node scripts/seed-onboarding-e2e.mjs && next start --hostname 127.0.0.1 -p 3124",
    url: "http://127.0.0.1:3124/calendlyisdead", timeout: 180_000, reuseExistingServer: false,
    env: { DATABASE_URL: "", PGLITE_DIR: directory, DEMO_MODE: "1", AUTH_SECRET: "onboarding-e2e-only", RESEND_API_KEY: "", NEXT_PUBLIC_POSTHOG_ENABLED: "false", APP_URL: "http://127.0.0.1:3124/calendlyisdead" },
  },
});
