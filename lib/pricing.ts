/** Calendly list prices, per seat per month, billed yearly (calendly.com/pricing, checked Oct 2026). */
export const CALENDLY = { asOf: "October 2026", standard: 10, teams: 16, enterpriseFromYear: 15000, enterpriseMinSeats: 50 };
export function calendlyYearly(seats: number, plan: "standard" | "teams") {
  return seats * CALENDLY[plan] * 12;
}
// Plan mapping is our reading of the public pricing page; re-check before launch.
export const FEATURES: { name: string; plan: string }[] = [
  { name: "Unlimited event types", plan: "Standard" },
  { name: "Multiple calendar connections (Google, Outlook, iCloud)", plan: "Standard" },
  { name: "Group, collective and round-robin events", plan: "Standard" },
  { name: "Meeting polls and one-off links", plan: "Standard" },
  { name: "Email and SMS reminder workflows", plan: "Standard" },
  { name: "Collect payments with Stripe", plan: "Standard" },
  { name: "Custom branding and hiding the vendor logo", plan: "Standard" },
  { name: "Redirect after booking", plan: "Standard" },
  { name: "Routing forms", plan: "Teams" },
  { name: "Admin-managed event types", plan: "Teams" },
  { name: "Team analytics", plan: "Teams" },
  { name: "AI email scheduling assistant", plan: "Paid add-on" },
  { name: "Self-host on your own infrastructure", plan: "Not offered" },
];
