import { test, expect } from "@playwright/test";
import fs from "node:fs";
const shots = "research/ours"; fs.mkdirSync(shots, { recursive: true });

test("invitee books, gets an .ics, then reschedules and cancels", async ({ page }) => {
  await page.goto("demo/30min");
  await expect(page.getByRole("heading", { name: /Quick chat/ })).toBeVisible();
  await page.locator("button.day.open").first().waitFor();
  await page.screenshot({ path: `${shots}/01-booking-calendar.png` });
  await page.locator("button.day.open").first().click();
  await expect(page.getByTestId("times")).toBeVisible();
  await page.locator(".slot button.t").first().click();
  await page.screenshot({ path: `${shots}/02-booking-times.png` });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Name").fill("Ada Lovelace");
  await page.getByLabel("Email", { exact: true }).fill("ada@example.com");
  await page.getByLabel("Anything to prepare?").fill("Talk about engines.");
  await page.screenshot({ path: `${shots}/03-booking-details.png` });
  await page.getByRole("button", { name: "Book it" }).click();
  await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
  await page.screenshot({ path: `${shots}/04-booking-confirmed.png` });

  const mails = fs.readdirSync(".data/outbox").map(f => JSON.parse(fs.readFileSync(`.data/outbox/${f}`, "utf8")));
  const m = mails.find(x => x.to === "ada@example.com");
  expect(m.ics).toContain("BEGIN:VEVENT"); expect(m.text).toContain("/cancel");

  // reschedule
  await page.getByRole("link", { name: "Reschedule" }).click();
  await expect(page.getByText("Moving your booking from")).toBeVisible();
  await page.locator("button.day.open").nth(1).click();
  await page.locator(".slot button.t").nth(2).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Ada Lovelace");
  await page.getByRole("button", { name: "Confirm new time" }).click();
  await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
  await page.screenshot({ path: `${shots}/05-rescheduled.png` });

  // cancel
  await page.getByRole("link", { name: "Cancel" }).click();
  await page.getByLabel(/Reason/).fill("Conflict came up");
  await page.screenshot({ path: `${shots}/06-cancel.png` });
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByTestId("confirm-heading")).toHaveText("This booking was cancelled");
});

test("a taken slot disappears for the next invitee", async ({ request }) => {
  const tz = "America/New_York";
  const now = new Date(); const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 20 * 864e5).toISOString().slice(0, 10);
  const s1 = (await (await request.get(`api/slots?user=demo&slug=deep-dive&from=${from}&to=${to}&tz=${tz}`)).json()).slots;
  const day = Object.keys(s1)[0]; const start = s1[day][0];
  const ok = await request.post("api/bookings", { data: { username: "demo", slug: "deep-dive", start, name: "A", email: "a@example.com", tz } });
  expect(ok.status()).toBe(200);
  const dup = await request.post("api/bookings", { data: { username: "demo", slug: "deep-dive", start, name: "B", email: "b@example.com", tz } });
  expect(dup.status()).toBe(409);
  const s2 = (await (await request.get(`api/slots?user=demo&slug=deep-dive&from=${day}&to=${day}&tz=${tz}`)).json()).slots;
  expect(s2[day] ?? []).not.toContain(start);
});

test("host edits an event type in the slide-in editor and it auto-saves", async ({ page }) => {
  await page.goto("login");
  await page.getByRole("button", { name: "Use the demo account" }).click();
  await expect(page.getByRole("heading", { name: "Event types" })).toBeVisible();
  await page.screenshot({ path: `${shots}/07-event-types.png` });
  await page.getByTestId("event-type").first().click();
  await page.getByLabel("Name").fill("Quick chat (edited)");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.screenshot({ path: `${shots}/08-editor-autosave.png` });
  await page.reload();
  await expect(page.getByText("Quick chat (edited)")).toBeVisible();
  await page.goto("app/availability");
  await page.screenshot({ path: `${shots}/09-availability.png` });
});
