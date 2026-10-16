import { expect, test } from "@playwright/test";

// All scheduling requests are intercepted. No booking or email is created.
for (const width of [1440, 390]) {
  test.describe(`booking request recovery at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("failed availability is announced, can be retried, and differs from an empty month", async ({ page }) => {
      let calls = 0;
      await page.route("**/api/slots?**", route => ++calls === 1
        ? route.fulfill({ status: 503, body: "Service unavailable" })
        : route.fulfill({ json: { slots: {} } }));
      await page.goto("demo/30min?month=2027-01&tz=America/New_York");
      await expect(page.getByRole("alert")).toContainText("couldn’t load available times");
      await expect(page.getByText("Loading open times…")).toHaveCount(0);
      await expect(page.getByText(/No available times this month/)).toHaveCount(0);
      await page.getByRole("button", { name: "Retry available times" }).click();
      await expect(page.getByRole("status")).toHaveText("No available times this month. Try another month.");
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(calls).toBe(2);
    });

    test("a response for an older month cannot overwrite the current month", async ({ page }) => {
      let release!: () => void;
      const delayed = new Promise<void>(resolve => { release = resolve; });
      let requested!: () => void;
      const firstRequest = new Promise<void>(resolve => { requested = resolve; });
      await page.route("**/api/slots?**", async route => {
        if (new URL(route.request().url()).searchParams.get("from") === "2027-01-01") {
          requested(); await delayed;
          await route.fulfill({ json: { slots: { "2027-01-11": ["2027-01-11T14:00:00Z"] } } }).catch(() => {});
        } else await route.fulfill({ json: { slots: { "2027-02-12": ["2027-02-12T14:00:00Z"] } } });
      });
      await page.goto("demo/30min?month=2027-01&tz=America/New_York");
      await firstRequest;
      const obsoleteRequest = page.waitForEvent("requestfailed", { predicate: request => {
        const url = new URL(request.url());
        return url.pathname.endsWith("/api/slots") && url.searchParams.get("from") === "2027-01-01";
      } });
      await page.getByRole("button", { name: "Next month" }).click();
      await obsoleteRequest;
      const day = page.getByRole("button", { name: "Friday, February 12", exact: true });
      await expect(day).toBeEnabled();
      release();
      await day.click();
      await expect(page.getByRole("button", { name: "9:00 AM", exact: true })).toBeVisible();
      await expect(page.getByTestId("month-label")).toHaveText("February 2027");
    });

    test("a stalled availability request times out and permits retry", async ({ page }) => {
      await page.clock.install();
      let calls = 0;
      await page.route("**/api/slots?**", route => ++calls === 1 ? undefined : route.fulfill({ json: { slots: {} } }));
      await page.goto("demo/30min?month=2027-01&tz=America/New_York");
      await expect(page.getByRole("status")).toHaveText("Loading open times…");
      await page.clock.fastForward(20_001);
      await expect(page.getByRole("alert")).toContainText("couldn’t load available times");
      await page.getByRole("button", { name: "Retry available times" }).click();
      await expect(page.getByRole("status")).toContainText("No available times this month");
    });

    for (const failure of ["network", "non-json", "invalid-success"] as const) {
      test(`recovers from a ${failure} submission without losing invitee details`, async ({ page }) => {
        let submissions = 0;
        await page.route("**/api/slots?**", route => route.fulfill({ json: { slots: {} } }));
        await page.route("**/api/bookings", route => {
          submissions++;
          if (submissions > 1) return route.fulfill({ status: 409, json: { error: "slot_unavailable" } });
          if (failure === "network") return route.abort("failed");
          return failure === "non-json" ? route.fulfill({ status: 502, body: "Bad gateway" }) : route.fulfill({ json: {} });
        });
        await page.goto("demo/30min?month=2027-01&date=2027-01-11&slot=2027-01-11T14%3A00%3A00Z&tz=America/New_York");
        await page.getByLabel("Name", { exact: true }).fill("Parity test invitee");
        await page.getByLabel("Email", { exact: true }).fill("booking-test@example.invalid");
        await page.getByLabel("Anything to prepare?").fill("Keep these notes");
        const submit = page.getByRole("button", { name: "Book it", exact: true });
        await submit.click();
        await expect(page.getByRole("alert")).toContainText("couldn’t confirm your booking");
        await expect(submit).toBeEnabled();
        await expect(page.getByLabel("Anything to prepare?")).toHaveValue("Keep these notes");
        expect(submissions).toBe(1); // Never automatically retry a potentially accepted POST.
        await submit.click();
        await expect(page.getByRole("alert")).toContainText("Pick another one");
        await page.getByRole("button", { name: "← Back" }).click();
        await expect(page.getByRole("heading", { name: "Pick a day" })).toBeVisible();
      });
    }
  });
}
