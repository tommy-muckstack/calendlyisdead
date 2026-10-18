import { z } from "zod";
export const LoginProvider = z.enum(["password", "google.com"]);
export const LoginSettingsData = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), uid: z.string().min(1), email: z.email(), emailVerified: z.boolean(), providers: z.array(LoginProvider).min(1).max(2) }),
  z.object({ status: z.enum(["demo", "unavailable", "error"]) }),
]);
export type LoginSettings = z.infer<typeof LoginSettingsData>;
export type ReadyLoginSettings = Extract<LoginSettings, { status: "ready" }>;
export type AccountAction = "password" | "email" | "link_google" | "unlink_google";
export const NewPassword = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");
export const NewLoginEmail = z.email().max(254).transform(value => value.trim().toLowerCase());

/** Never reflect provider messages, entered credentials or arbitrary errors. */
export function loginSettingsError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (/wrong-password|invalid-credential|user-not-found/.test(code)) return "That password could not be verified. Try again.";
  if (/account-mismatch/.test(code)) return "Use the same account that is signed in to CalendlyIsDead.";
  if (/requires-recent-login|user-token-expired|reauthenticate/.test(code)) return "Verify your current login again before making this change.";
  if (/popup-closed|cancelled-popup/.test(code)) return "Google verification was closed. Your login settings have not changed.";
  if (/popup-blocked/.test(code)) return "Allow the Google sign-in popup, then try again.";
  if (/credential-already-in-use|email-already-in-use|account-exists-with-different-credential/.test(code)) return "That login belongs to another account. Choose a different login; accounts will not be merged.";
  if (/provider-already-linked/.test(code)) return "Google is already linked. Reload login settings to see the latest details.";
  if (/last-provider/.test(code)) return "Set an email password before removing Google sign-in.";
  if (/invalid-email/.test(code)) return "Enter a valid new email address.";
  if (/weak-password|password-does-not-meet-requirements/.test(code)) return "Choose a stronger password that meets the account's password policy.";
  if (/too-many-requests/.test(code)) return "Too many attempts. Wait a few minutes before trying again.";
  if (/network-request-failed/.test(code)) return "The connection failed. Check your connection and verify your login again.";
  return "This change could not be confirmed. Verify your login and check your settings before trying again.";
}
