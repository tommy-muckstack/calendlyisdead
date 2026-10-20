import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e", testIgnore: ["**/onboarding/**", "**/conferences/**", "**/polls/**", "**/timezone-picker/**", "**/login-settings/**", "**/my-link/**"], timeout: 60_000, workers: 1, fullyParallel: false, use: { baseURL: "http://localhost:3123/calendlyisdead/", viewport: { width: 1280, height: 860 }, timezoneId: "America/New_York" },
  webServer: { command: "rm -rf .data/e2e .data/outbox && npm run build && next start -p 3123", url: "http://localhost:3123/calendlyisdead", timeout: 180_000, reuseExistingServer: false,
    env: { DATABASE_URL: "", RESEND_API_KEY: "", CRON_SECRET: "", NEXT_PUBLIC_POSTHOG_ENABLED: "false", PGLITE_DIR: ".data/e2e/db", DEMO_MODE: "1", AUTH_SECRET: "e2e-secret", APP_URL: "http://localhost:3123/calendlyisdead" } },
});
