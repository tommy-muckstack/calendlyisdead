import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { changeAccountLogin, clearAccountLogin, verifyAccountLogin } from "../../lib/login-settings-client";
import { loginSettingsError, NewPassword, type ReadyLoginSettings } from "../../lib/login-settings";
const mocks = vi.hoisted(() => ({ auth: { currentUser: null as User | null }, email: vi.fn(), popup: vi.fn(), out: vi.fn(), reload: vi.fn(), update: vi.fn(), linkPassword: vi.fn(), linkGoogle: vi.fn(), unlink: vi.fn(), verifyEmail: vi.fn(), fetch: vi.fn() }));
vi.mock("../../lib/isdead-auth/client", () => ({ clientAuth: async () => mocks.auth }));
vi.mock("firebase/auth", () => ({ signInWithEmailAndPassword: mocks.email, signInWithPopup: mocks.popup, signOut: mocks.out, reload: mocks.reload,
  updatePassword: mocks.update, linkWithCredential: mocks.linkPassword, linkWithPopup: mocks.linkGoogle, unlink: mocks.unlink, verifyBeforeUpdateEmail: mocks.verifyEmail,
  GoogleAuthProvider: class {}, EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) } }));
const config = { apiKey: "offline", authDomain: "example.invalid", projectId: "offline", appId: "offline" };
const account: ReadyLoginSettings = { status: "ready", uid: "account", email: "account@example.invalid", emailVerified: true, providers: ["password", "google.com"] };
function person(providers = ["password"], uid = account.uid, method = "password", authTime = Date.now() / 1000) {
  return { uid, email: account.email, emailVerified: true, providerData: providers.map(providerId => ({ providerId })),
    getIdToken: vi.fn(async () => "synthetic-token"), getIdTokenResult: vi.fn(async () => ({ claims: { auth_time: authTime }, signInProvider: method })) } as unknown as User;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.currentUser = person();
  mocks.email.mockReset().mockImplementation(async () => ({ user: mocks.auth.currentUser })); mocks.popup.mockReset().mockImplementation(async () => ({ user: mocks.auth.currentUser }));
  for (const fn of [mocks.out, mocks.reload, mocks.update, mocks.linkPassword, mocks.linkGoogle, mocks.unlink, mocks.verifyEmail]) fn.mockReset().mockResolvedValue(undefined);
  mocks.fetch.mockReset().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("account login changes", () => {
  it("authenticates the current account without exchanging another website session", async () => {
    const user = await verifyAccountLogin(config, account, "password", "old-password");
    expect(user.uid).toBe(account.uid); expect(mocks.out).toHaveBeenCalledBefore(mocks.email);
    expect(mocks.email).toHaveBeenCalledWith(mocks.auth, account.email, "old-password"); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects a different Google identity before changing it or exchanging a cookie", async () => {
    mocks.popup.mockResolvedValue({ user: person(["google.com"], "different") });
    await expect(verifyAccountLogin(config, account, "google.com", "")).rejects.toMatchObject({ code: "auth/account-mismatch" });
    expect(mocks.out).toHaveBeenCalledTimes(2); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not offer authentication through an unlinked provider", async () => {
    await expect(verifyAccountLogin(config, { ...account, providers: ["password"] }, "google.com", "")).rejects.toMatchObject({ code: "auth/reauthenticate" }); expect(mocks.popup).not.toHaveBeenCalled();
  });
  it("updates the password, signs in with the new password, and renews the shared cookie", async () => {
    const user = mocks.auth.currentUser!;
    expect(await changeAccountLogin(config, account.uid, user, "password", "new-password")).toEqual({ outcome: "updated", session: "renewed" });
    expect(mocks.update).toHaveBeenCalledWith(user, "new-password"); expect(mocks.update).toHaveBeenCalledBefore(mocks.email);
    expect(mocks.email).toHaveBeenCalledWith(mocks.auth, account.email, "new-password");
    const [url, request] = mocks.fetch.mock.calls[0]; expect(url).toBe("/calendlyisdead/api/session"); expect(JSON.parse(request.body)).toEqual({ idToken: "synthetic-token" }); expect(request.body).not.toContain("password");
  });
  it("adds a password to the same Google-only Firebase UID", async () => {
    const user = person(["google.com"], account.uid, "google.com"); mocks.auth.currentUser = user;
    await changeAccountLogin(config, account.uid, user, "password", "new-password");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.linkPassword).toHaveBeenCalledWith(user, { email: account.email, password: "new-password" });
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
  it("verifies a new email before changing login identity", async () => {
    expect(await changeAccountLogin(config, account.uid, mocks.auth.currentUser!, "email", "NEW@example.invalid")).toEqual({ outcome: "verification_sent", session: "unchanged" });
    expect(mocks.verifyEmail).toHaveBeenCalledWith(mocks.auth.currentUser, "new@example.invalid"); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects invalid or unchanged email and Google-only email changes", async () => {
    for (const value of ["bad", account.email]) await expect(changeAccountLogin(config, account.uid, mocks.auth.currentUser!, "email", value)).rejects.toMatchObject({ code: "auth/invalid-email" });
    mocks.auth.currentUser = person(["google.com"]); await expect(changeAccountLogin(config, account.uid, mocks.auth.currentUser, "email", "new@example.invalid")).rejects.toMatchObject({ code: "auth/invalid-email" }); expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });
  it("links Google without creating or merging a different app account", async () => {
    const user = mocks.auth.currentUser!; await changeAccountLogin(config, account.uid, user, "link_google"); expect(mocks.linkGoogle).toHaveBeenCalledWith(user, expect.any(Object)); expect(mocks.popup).not.toHaveBeenCalled();
    mocks.linkGoogle.mockRejectedValueOnce({ code: "auth/credential-already-in-use" }); await expect(changeAccountLogin(config, account.uid, user, "link_google")).rejects.toMatchObject({ code: "auth/credential-already-in-use" }); expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("removes only Google after proving the remaining password works", async () => {
    const user = person(["password", "google.com"]); mocks.auth.currentUser = user;
    await changeAccountLogin(config, account.uid, user, "unlink_google"); expect(mocks.unlink).toHaveBeenCalledWith(user, "google.com");
  });
  it("never removes the last method or accepts Google proof for password fallback", async () => {
    for (const user of [person(["google.com"]), person(["password"]), person(["password", "google.com"], account.uid, "google.com")]) {
      mocks.auth.currentUser = user; await expect(changeAccountLogin(config, account.uid, user, "unlink_google")).rejects.toThrow();
    }
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
  it("rechecks UID, current SDK identity and verification age before mutation", async () => {
    for (const user of [person(["password"], "other"), person(["password"], account.uid, "password", Date.now() / 1000 - 301)]) {
      mocks.auth.currentUser = user; await expect(changeAccountLogin(config, account.uid, user, "password", "new-password")).rejects.toThrow();
    }
    const user = person(); mocks.auth.currentUser = null; await expect(changeAccountLogin(config, account.uid, user, "password", "new-password")).rejects.toThrow(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps a successful mutation distinct from cookie/network failure", async () => {
    for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 403 })]) {
      mocks.fetch.mockResolvedValueOnce(response); expect(await changeAccountLogin(config, account.uid, mocks.auth.currentUser!, "password", "new-password")).toEqual({ outcome: "updated", session: "sign_in_required" });
    }
    mocks.email.mockRejectedValueOnce({ code: "auth/network-request-failed" }); expect(await changeAccountLogin(config, account.uid, mocks.auth.currentUser!, "password", "new-password")).toEqual({ outcome: "updated", session: "sign_in_required" });
  });
  it("does not exchange a token if the provider rejects the mutation", async () => {
    mocks.update.mockRejectedValueOnce({ code: "auth/weak-password" }); await expect(changeAccountLogin(config, account.uid, mocks.auth.currentUser!, "password", "new-password")).rejects.toMatchObject({ code: "auth/weak-password" }); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("validates password bounds before changing credentials", async () => {
    for (const value of ["short", "x".repeat(73)]) { expect(NewPassword.safeParse(value).success).toBe(false); await expect(changeAccountLogin(config, account.uid, mocks.auth.currentUser!, "password", value)).rejects.toThrow(); }
    expect(mocks.update).not.toHaveBeenCalled(); expect(NewPassword.safeParse("x".repeat(72)).success).toBe(true);
  });
  it("clears only browser authentication on cancellation, without server logout or mail", async () => {
    await clearAccountLogin(config); expect(mocks.out).toHaveBeenCalledWith(mocks.auth); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });
  it("never reflects raw provider error messages or credentials", () => {
    for (const code of ["auth/wrong-password", "auth/popup-blocked", "auth/credential-already-in-use", "auth/too-many-requests", "auth/network-request-failed", "unknown"]) expect(loginSettingsError({ code, message: "private@email.invalid credential private-value" })).not.toMatch(/private/);
  });
});
