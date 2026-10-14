import fs from "node:fs";
import path from "node:path";
export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
  if (sid && token && from) {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body }) });
    if (!r.ok) throw new Error(`twilio ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  const dir = path.resolve(process.cwd(), process.env.PGLITE_DIR ? path.dirname(process.env.PGLITE_DIR) : ".data", "sms-outbox"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`), JSON.stringify({ to, body }, null, 2));
  console.log(`\n[sms] to=${to}\n${body}\n`);
}
