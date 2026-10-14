import { DateTime } from "luxon";
import { parseThread, parseWithLlm, propose, draftReply } from "./assistant";
import { baseUrl } from "./booking";

/** Full pipeline: parse thread -> propose real open slots -> one-click links -> reply draft. Never sends anything. */
export async function runAssistant(host: { username: string; name: string | null; email: string | null; timezone: string }, slug: string, thread: string, now = DateTime.utc()) {
  const h = parseThread(thread, { hostEmail: host.email ?? undefined, hostTz: host.timezone, now });
  const { parsed, source } = await parseWithLlm(thread, h, { hostTz: host.timezone, now });
  const pr = await propose(host.username, slug, parsed, host.timezone, 3, now);
  if (!pr) return null;
  const who = parsed.people[0];
  const link = (s: string) => {
    const d = DateTime.fromISO(s).setZone(pr.zone);
    const q = new URLSearchParams({ month: d.toFormat("yyyy-MM"), date: d.toISODate()!, slot: s, tz: pr.zone, ...(who ? { name: who.name, email: who.email } : {}) });
    return `${baseUrl()}/${host.username}/${slug}?${q}`;
  };
  const links = pr.slots.map(link);
  const reply = draftReply({ hostName: host.name ?? host.username, people: parsed.people, slots: pr.slots, zone: pr.zone, links, profileUrl: `${baseUrl()}/${host.username}/${slug}`, exactMatch: pr.exactMatch });
  const durationMismatch = parsed.durationMin && parsed.durationMin !== pr.eventType.durationMin ? parsed.durationMin : null;
  return { source, parsed, slots: pr.slots, zone: pr.zone, links, reply, exactMatch: pr.exactMatch, durationMismatch, eventType: { slug, title: pr.eventType.title, durationMin: pr.eventType.durationMin } };
}
