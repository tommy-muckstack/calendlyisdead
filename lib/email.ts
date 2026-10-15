import fs from "node:fs";
import path from "node:path";
export type Mail = { to: string; subject: string; text: string; html?: string; ics?: string };
export const emailConfigured = () => !!process.env.RESEND_API_KEY;
// Never throws: a missing or failing mail provider must not break booking, cancelling or sign-up flows.
export async function sendMail(m: Mail): Promise<boolean> {
  const from = process.env.EMAIL_FROM ?? "CalendlyIsDead <noreply@calendlyisdead.local>";
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const r = new Resend(process.env.RESEND_API_KEY);
      const res: any = await r.emails.send({ from, to: m.to, subject: m.subject, text: m.text, html: m.html,
        attachments: m.ics ? [{ filename: "invite.ics", content: Buffer.from(m.ics).toString("base64"), contentType: "text/calendar; method=REQUEST" } as any] : undefined });
      if (res?.error) { console.error(`[mail] resend error to=${m.to}:`, res.error); return false; }
      return true;
    } catch (e) { console.error(`[mail] send failed to=${m.to}:`, e); return false; }
  }
  // console adapter (dev): log and keep a copy in .data/outbox for tests. Serverless filesystems are read-only, so this is best effort.
  console.log(`\n[mail] (no RESEND_API_KEY, not delivered) to=${m.to} subject="${m.subject}"\n${process.env.NODE_ENV === "production" ? "" : m.text + "\n"}`);
  if (process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1") {
    try {
      const dir = path.join(process.cwd(), ".data/outbox"); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${Date.now()}-${m.to.replace(/[^a-z0-9@.]/gi, "_")}.json`), JSON.stringify(m, null, 2));
    } catch { /* read-only fs */ }
  }
  return false;
}
