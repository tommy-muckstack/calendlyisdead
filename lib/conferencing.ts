/** Video conferencing for bookings. Real providers when configured, otherwise a clearly-labelled demo room so keyless DEMO_MODE still works. */
export type Conf = "zoom" | "meet" | null;
export const confFor = (location: string): Conf => /\bzoom\b/i.test(location) ? "zoom" : /google meet/i.test(location) ? "meet" : null;
export const zoomConfigured = () => !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
const base = () => process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
export const demoRoomUrl = (kind: "zoom" | "meet", uid: string) => `${base()}/meet/${kind}-${uid}`;

let zoomToken: { v: string; exp: number } | null = null;
async function zoomAccessToken(f: typeof fetch) {
  if (zoomToken && zoomToken.exp > Date.now() + 60_000) return zoomToken.v;
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const r = await f(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID!)}`, { method: "POST", headers: { authorization: `Basic ${basic}` } });
  if (!r.ok) throw new Error(`zoom token ${r.status}`);
  const j = await r.json(); zoomToken = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 }; return zoomToken.v;
}

/** Server-to-server OAuth Zoom app (one org-wide connection, like an admin-connected Zoom). */
export async function createZoomMeeting(m: { topic: string; start: Date; durationMin: number; hostEmail?: string }, f: typeof fetch = fetch) {
  const tok = await zoomAccessToken(f);
  const user = process.env.ZOOM_USER ?? "me";
  const r = await f(`https://api.zoom.us/v2/users/${encodeURIComponent(user)}/meetings`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify({ topic: m.topic.slice(0, 200), type: 2, start_time: m.start.toISOString(), duration: m.durationMin, settings: { join_before_host: true, waiting_room: false } }) });
  if (!r.ok) throw new Error(`zoom create ${r.status}`);
  const j = await r.json(); return { url: j.join_url as string, id: String(j.id) };
}

/**
 * Pick a meeting URL. `calendarUrl` is what calendar write-back produced (Google adds Meet links itself).
 * Falls back to a demo room so a booking always has somewhere to meet.
 */
export async function meetingUrlFor(location: string, uid: string, info: { topic: string; start: Date; durationMin: number }, calendarUrl?: string | null, f: typeof fetch = fetch) {
  const kind = confFor(location);
  if (!kind) return calendarUrl ?? null;
  if (kind === "meet") return calendarUrl ?? demoRoomUrl("meet", uid);
  if (zoomConfigured()) { try { return (await createZoomMeeting(info, f)).url; } catch (e: any) { console.warn(`[zoom] ${e.message}; using demo room`); } }
  return demoRoomUrl("zoom", uid);
}
