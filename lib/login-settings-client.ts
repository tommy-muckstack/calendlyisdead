"use client";
import type { User } from "firebase/auth";
import { clientAuth } from "./isdead-auth/client";
import type { FirebaseClientConfig } from "./isdead-auth/config";
import { NewLoginEmail, NewPassword, type AccountAction, type ReadyLoginSettings } from "./login-settings";
import { BP } from "./basepath";
const fail = (code: string): never => { throw Object.assign(new Error("Account change unavailable"), { code }); };

export async function verifyAccountLogin(config: FirebaseClientConfig, account: ReadyLoginSettings, method: "password" | "google.com", password: string): Promise<User> {
  if (!account.providers.includes(method)) fail("auth/reauthenticate");
  const sdk = await import("firebase/auth"), auth = await clientAuth(config);
  await sdk.signOut(auth);
  const credential = method === "password" ? await sdk.signInWithEmailAndPassword(auth, account.email, password)
    : await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
  if (credential.user.uid !== account.uid) { await sdk.signOut(auth); fail("auth/account-mismatch"); }
  return credential.user;
}

export async function clearAccountLogin(config: FirebaseClientConfig) {
  const sdk = await import("firebase/auth"); await sdk.signOut(await clientAuth(config));
}

export async function changeAccountLogin(config: FirebaseClientConfig, expectedUid: string, user: User, action: AccountAction, value = "") {
  const sdk = await import("firebase/auth"), auth = await clientAuth(config);
  if (user.uid !== expectedUid || auth.currentUser?.uid !== expectedUid) fail("auth/account-mismatch");
  const token = await user.getIdTokenResult();
  if (typeof token.claims.auth_time !== "number" || Date.now() / 1000 - token.claims.auth_time > 300) fail("auth/reauthenticate");
  await sdk.reload(user);
  const providers = user.providerData.map(provider => provider.providerId);
  if (action === "email") {
    const email = NewLoginEmail.safeParse(value);
    if (!email.success || !providers.includes("password") || !user.email || email.data === user.email.toLowerCase()) fail("auth/invalid-email");
    // Firebase sends a verification link; the current address remains until verified.
    await sdk.verifyBeforeUpdateEmail(user, email.data);
    return { outcome: "verification_sent" as const, session: "unchanged" as const };
  }
  if (action === "password") {
    const password = NewPassword.safeParse(value); if (!password.success) fail("auth/weak-password");
    if (!user.email) fail("auth/invalid-email");
    if (providers.includes("password")) await sdk.updatePassword(user, password.data);
    else await sdk.linkWithCredential(user, sdk.EmailAuthProvider.credential(user.email!, password.data));
  } else if (action === "link_google") {
    if (providers.includes("google.com")) fail("auth/provider-already-linked");
    await sdk.linkWithPopup(user, new sdk.GoogleAuthProvider());
  } else if (action === "unlink_google") {
    if (!providers.includes("password") || !providers.includes("google.com")) fail("auth/last-provider");
    // Removing Google requires proof that the remaining password works.
    if (token.signInProvider !== "password") fail("auth/reauthenticate");
    await sdk.unlink(user, "google.com");
  } else fail("auth/operation-not-allowed");
  // The mutation has succeeded. A failed cookie exchange must not invite a
  // repeat with the old password or suggest that nothing changed.
  try {
    const refreshed = action === "password" ? (await sdk.signInWithEmailAndPassword(auth, user.email!, value)).user : user;
    if (refreshed.uid !== expectedUid) fail("auth/account-mismatch");
    const response = await fetch(`${BP}/api/session`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: await refreshed.getIdToken(true) }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { outcome: "updated" as const, session: "sign_in_required" as const };
    return { outcome: "updated" as const, session: "renewed" as const };
  } catch { return { outcome: "updated" as const, session: "sign_in_required" as const }; }
}
