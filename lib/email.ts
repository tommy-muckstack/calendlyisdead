import fs from "node:fs";
import path from "node:path";
export type Mail = { to: string; subject: string; text: string; html?: string; ics?: string };
export async function sendMail(m: Mail) {
  const from = process.env.EMAIL_FROM ?? "CalendlyIsDead <noreply@calendlyisdead.local>";
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const r = new Resend(process.env.RESEND_API_KEY);
    await r.emails.send({ from, to: m.to, subject: m.subject, text: m.text, html: m.html,
      attachments: m.ics ? [{ filename: "invite.ics", content: Buffer.from(m.ics).toString("base64"), contentType: "text/calendar; method=REQUEST" } as any] : undefined });
    return;
  }
  // console adapter (dev): log and keep a copy in .data/outbox for tests
  const dir = path.join(process.cwd(), ".data/outbox"); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${Date.now()}-${m.to.replace(/[^a-z0-9@.]/gi, "_")}.json`);
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
  console.log(`\n[mail] to=${m.to} subject="${m.subject}"\n${m.text}\n`);
}
