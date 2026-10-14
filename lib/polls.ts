import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "./db";
import { finalize } from "./booking";
const { polls, pollVotes, eventTypes, bookings, users, schedules } = schema;
export const shortId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);

export async function createPoll(userId: string, p: { title: string; durationMin: number; location?: string; options: string[] }) {
  const opts = [...new Set(p.options.map(o => new Date(o)).filter(d => !isNaN(+d)).map(d => d.toISOString()))].sort();
  if (opts.length < 2) throw new Error("need_two_options");
  const db = await getDb(); const id = shortId();
  await db.insert(polls).values({ id, userId, title: p.title, durationMin: p.durationMin, location: p.location ?? "", options: opts });
  return id;
}
export async function vote(pollId: string, v: { name: string; email: string; picks: string[] }) {
  const db = await getDb();
  const [p] = await db.select().from(polls).where(eq(polls.id, pollId));
  if (!p) throw new Error("not_found"); if (p.status !== "open") throw new Error("closed");
  const picks = v.picks.filter(x => p.options.includes(x));
  // one vote per email: re-voting replaces it
  await db.delete(pollVotes).where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.email, v.email.toLowerCase())));
  await db.insert(pollVotes).values({ id: shortId(), pollId, name: v.name, email: v.email.toLowerCase(), picks });
  return picks;
}
export function tally(options: string[], votes: { name: string; picks: string[] }[]) {
  const rows = options.map(o => ({ option: o, count: votes.filter(v => v.picks.includes(o)).length, names: votes.filter(v => v.picks.includes(o)).map(v => v.name) }));
  const top = Math.max(0, ...rows.map(r => r.count));
  return rows.map(r => ({ ...r, best: top > 0 && r.count === top }));
}
export async function getPoll(id: string) {
  const db = await getDb();
  const [p] = await db.select().from(polls).where(eq(polls.id, id)); if (!p) return null;
  const votes = await db.select().from(pollVotes).where(eq(pollVotes.pollId, id));
  const [host] = await db.select().from(users).where(eq(users.id, p.userId));
  return { poll: p, votes, host, tally: tally(p.options, votes) };
}
/** Host picks a time: one booking with every voter who can make it (others are not invited). */
export async function bookPoll(userId: string, pollId: string, option: string) {
  const db = await getDb();
  const g = await getPoll(pollId);
  if (!g || g.poll.userId !== userId) throw new Error("not_found");
  if (g.poll.status !== "open") throw new Error("closed");
  if (!g.poll.options.includes(option)) throw new Error("bad_option");
  const attendees = g.votes.filter((v: any) => v.picks.includes(option));
  if (!attendees.length) throw new Error("no_votes");
  const [sc] = await db.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.isDefault, true)));
  const etId = `poll-${pollId}`;
  await db.insert(eventTypes).values({ id: etId, userId, scheduleId: sc?.id, slug: etId, title: g.poll.title, durationMin: g.poll.durationMin, location: g.poll.location, kind: "poll", active: false }).onConflictDoNothing();
  const [et] = await db.select().from(eventTypes).where(eq(eventTypes.id, etId));
  const start = new Date(option), end = new Date(+start + g.poll.durationMin * 60_000);
  const row: any = { uid: shortId() + "pl", eventTypeId: etId, hostId: userId, start, end, inviteeName: attendees[0].name, inviteeEmail: attendees[0].email,
    inviteeTz: g.host.timezone, notes: `Booked from meeting poll "${g.poll.title}"`, guests: attendees.slice(1).map((a: any) => a.email), answers: {}, seat: 0, groupUid: null };
  try { await db.insert(bookings).values(row); } catch { throw new Error("slot_unavailable"); }
  await db.update(polls).set({ status: "booked", chosen: option, bookingUid: row.uid }).where(eq(polls.id, pollId));
  await finalize([{ ...row, paymentStatus: "none" }], et, [g.host], false);
  return row.uid as string;
}
