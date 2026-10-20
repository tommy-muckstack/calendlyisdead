import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e/my-link", timeout: 60_000, workers: 1, fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3159/calendlyisdead/", timezoneId: "UTC" },
  webServer: {
    command: "npm run build && next start --hostname 127.0.0.1 -p 3159",
    url: "http://127.0.0.1:3159/calendlyisdead", timeout: 180_000, reuseExistingServer: false,
    env: { DATABASE_URL: "", PGLITE_DIR: `.data/my-link-e2e/${Date.now()}-${process.pid}/db`, DEMO_MODE: "1", AUTH_SECRET: "my-link-e2e-only", RESEND_API_KEY: "", FIREBASE_SERVICE_ACCOUNT_JSON: "", NEXT_PUBLIC_POSTHOG_ENABLED: "false", APP_URL: "http://127.0.0.1:3159/calendlyisdead" },
  },
});
