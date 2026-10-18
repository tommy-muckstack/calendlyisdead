import { defineConfig } from "@playwright/test";
const directory = `.data/login-settings-e2e/${Date.now()}-${process.pid}/db`;
export default defineConfig({
  testDir: "e2e/login-settings", timeout: 60_000, workers: 1, fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3158/calendlyisdead/", timezoneId: "UTC" },
  webServer: {
    command: "npm run build && next start --hostname 127.0.0.1 -p 3158",
    url: "http://127.0.0.1:3158/calendlyisdead", timeout: 180_000, reuseExistingServer: false,
    env: { DATABASE_URL: "", PGLITE_DIR: directory, DEMO_MODE: "1", AUTH_SECRET: "login-settings-e2e-only", RESEND_API_KEY: "", FIREBASE_SERVICE_ACCOUNT_JSON: "", NEXT_PUBLIC_POSTHOG_ENABLED: "false", APP_URL: "http://127.0.0.1:3158/calendlyisdead",
      NEXT_PUBLIC_FIREBASE_API_KEY: "offline-login-qa", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "offline-login-qa", NEXT_PUBLIC_FIREBASE_APP_ID: "offline-login-qa" },
  },
});
