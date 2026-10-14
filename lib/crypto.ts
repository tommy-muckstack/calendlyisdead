import crypto from "node:crypto";
const key = () => crypto.createHash("sha256").update(process.env.AUTH_SECRET ?? "dev-only-secret-change-me-in-production").digest();
export function seal(obj: unknown): string {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString("base64url")).join(".");
}
export function open<T = any>(s: string): T {
  const [iv, tag, enc] = s.split(".").map(x => Buffer.from(x, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8"));
}
