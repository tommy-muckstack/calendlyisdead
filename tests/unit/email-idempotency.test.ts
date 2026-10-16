import { afterEach, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn(async () => ({ data: { id: "test" }, error: null })));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("passes a stable reminder idempotency key through the existing mail adapter", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-only"); const { sendMail } = await import("../../lib/email");
  expect(await sendMail({ to: "qa@example.invalid", subject: "Reminder", text: "Note", idempotencyKey: "contact-reminders/test" })).toBe(true);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "qa@example.invalid", text: "Note" }), { idempotencyKey: "contact-reminders/test" });
});
it("preserves existing mail and ICS behavior without an idempotency key", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-only"); const { sendMail } = await import("../../lib/email");
  expect(await sendMail({ to: "qa@example.invalid", subject: "Meeting", text: "Invite", ics: "BEGIN:VCALENDAR" })).toBe(true);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ attachments: [expect.objectContaining({ filename: "invite.ics", content: Buffer.from("BEGIN:VCALENDAR").toString("base64") })] }), { idempotencyKey: undefined });
});
