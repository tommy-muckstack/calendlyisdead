import type { User } from "@/auth";
import { firebaseConfigured, getAdminAuth } from "./isdead-auth/server";
import { LoginSettingsData, type LoginSettings } from "./login-settings";

export async function readLoginSettings(user: Pick<User, "firebaseUid">): Promise<LoginSettings> {
  if (!user.firebaseUid) return { status: "demo" };
  if (!firebaseConfigured()) return { status: "unavailable" };
  try {
    const account = await (await getAdminAuth()).getUser(user.firebaseUid);
    if (account.disabled || account.uid !== user.firebaseUid) return { status: "unavailable" };
    const providers = [...new Set(account.providerData.map(provider => provider.providerId).filter(id => id === "password" || id === "google.com"))];
    if (!providers.length) return { status: "unavailable" };
    return LoginSettingsData.parse({ status: "ready", uid: account.uid, email: account.email, emailVerified: account.emailVerified, providers });
  } catch { return { status: "error" }; }
}
