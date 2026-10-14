import crypto from "node:crypto";
/** Stripe Checkout via the REST API (no SDK). Without STRIPE_SECRET_KEY we use a built-in demo checkout so the flow is testable keyless. */
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const HOLD_MIN = 30; // unpaid bookings release their slot after this long

export const formatMoney = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export async function createCheckout(o: { uid: string; title: string; amountCents: number; currency: string; email: string; successUrl: string; cancelUrl: string }, f: typeof fetch = fetch) {
  const body = new URLSearchParams({
    mode: "payment", customer_email: o.email, client_reference_id: o.uid, success_url: o.successUrl, cancel_url: o.cancelUrl,
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": o.currency, "line_items[0][price_data][unit_amount]": String(o.amountCents),
    "line_items[0][price_data][product_data][name]": o.title.slice(0, 200), "metadata[bookingUid]": o.uid,
    expires_at: String(Math.floor(Date.now() / 1000) + HOLD_MIN * 60 + 60),
  });
  const r = await f("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe ${r.status}: ${j?.error?.message ?? ""}`);
  return { id: j.id as string, url: j.url as string };
}

/** Verify a Stripe-Signature header (t=...,v1=...) per Stripe's scheme. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(kv => kv.split("=") as [string, string]).filter(x => x.length === 2).map(([k, v]) => [k, v]));
  const sigs = header.split(",").filter(x => x.startsWith("v1=")).map(x => x.slice(3));
  const t = Number(parts.t); if (!t || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
export function signStripePayload(payload: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}
