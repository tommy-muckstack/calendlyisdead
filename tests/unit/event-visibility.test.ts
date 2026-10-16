import { afterEach, describe, expect, it, vi } from "vitest";
import { setEventVisibility } from "../../lib/event-visibility-client";
import { BP } from "../../lib/basepath";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const message = "Visibility could not be confirmed. Try again.";

describe("event visibility confirmation and retry", () => {
  it("sends an explicit target value and retries the same value after an uncertain result", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(response({ id: "event/a", secret: true })); vi.stubGlobal("fetch", fetch);
    await expect(setEventVisibility("event/a", true)).rejects.toThrow(message); await setEventVisibility("event/a", true);
    for (const [url, options] of fetch.mock.calls) {
      expect(url).toBe(`${BP}/api/event-types/event%2Fa`); expect(options.method).toBe("PATCH"); expect(JSON.parse(options.body)).toEqual({ secret: true });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it.each([{ id: "other", secret: true }, { id: "event" }, { id: "event", secret: false }, null])("rejects unconfirmed response %j", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body))); await expect(setEventVisibility("event", true)).rejects.toThrow(message);
  });
  it("rejects HTTP errors even when the body claims the requested value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ id: "event", secret: true }, 500))); await expect(setEventVisibility("event", true)).rejects.toThrow(message);
  });
  it("handles malformed JSON without claiming success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not JSON"))); await expect(setEventVisibility("event", false)).rejects.toThrow(message);
  });
  it("gives an actionable authentication error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 }))); await expect(setEventVisibility("event", false)).rejects.toThrow("Sign in again");
  });
  it("aborts after 15 seconds and leaves a subsequent retry usable", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))))
      .mockResolvedValueOnce(response({ id: "event", secret: false })); vi.stubGlobal("fetch", fetch);
    const rejected = expect(setEventVisibility("event", false)).rejects.toThrow(message);
    await vi.advanceTimersByTimeAsync(15000); await rejected; await setEventVisibility("event", false); expect(vi.getTimerCount()).toBe(0);
  });
});
