import { BP } from "./basepath";

/** Set an explicit value so retrying an uncertain response cannot invert it. */
export async function setEventVisibility(id: string, secret: boolean): Promise<void> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${BP}/api/event-types/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret }), signal: controller.signal });
    if (response.status === 401) throw new Error("unauthorized");
    const saved = await response.json();
    if (!response.ok || saved?.id !== id || saved.secret !== secret) throw new Error("unconfirmed_visibility");
  } catch (error) {
    throw new Error(error instanceof Error && error.message === "unauthorized"
      ? "Sign in again to change event visibility."
      : "Visibility could not be confirmed. Try again.");
  } finally { clearTimeout(timeout); }
}
