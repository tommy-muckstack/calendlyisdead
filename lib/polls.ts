import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "./db";
import { finalize } from "./booking";
import { confirmedReservations } from "./booking-busy";
import { hostLimitCheck } from "./host-meeting-limits";
import { recordBookingContact } from "./automatic-contacts";
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
  return db.transaction(async (tx: any) => {
    const [p] = await tx.select().from(polls).where(eq(polls.id, pollId)).for("update");
    if (!p) throw new Error("not_found"); if (p.status !== "open") throw new Error("closed");
    const picks = [...new Set(v.picks.filter(x => p.options.includes(x)))];
    // Re-voting and poll closure share the poll lock, so a vote is replaced once
    // and cannot arrive after the booking's attendee list has been finalized.
    await tx.delete(pollVotes).where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.email, v.email.toLowerCase())));
    await tx.insert(pollVotes).values({ id: shortId(), pollId, name: v.name, email: v.email.toLowerCase(), picks });
    return picks;
  }, { isolationLevel: "read committed" });
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
  let reserved: { row: any; et: any; host: any };
  try {
    reserved = await db.transaction(async (tx: any) => {
      // Use the same host lock as event-type reservations, then lock the poll.
      const [host] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      const [p] = await tx.select().from(polls).where(and(eq(polls.id, pollId), eq(polls.userId, userId))).for("update");
      if (!host || !p) throw new Error("not_found");
      if (p.status !== "open") throw new Error("closed");
      if (!p.options.includes(option)) throw new Error("bad_option");
      const votes = await tx.select().from(pollVotes).where(eq(pollVotes.pollId, pollId));
      const attendees = votes.filter((v: any) => v.picks.includes(option));
      if (!attendees.length) throw new Error("no_votes");
      const start = new Date(option), end = new Date(+start + p.durationMin * 60_000);
      const conflicts = await confirmedReservations(tx, userId, start, end);
      if (conflicts.length) throw new Error("slot_unavailable");
      if ((await hostLimitCheck(tx, host, start, start))(start.toISOString())) throw new Error("slot_unavailable");

      const [sc] = await tx.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.isDefault, true)));
      const etId = `poll-${pollId}`;
      await tx.insert(eventTypes).values({ id: etId, userId, scheduleId: sc?.id, slug: etId, title: p.title, durationMin: p.durationMin, location: p.location, kind: "poll", active: false }).onConflictDoNothing();
      const [et] = await tx.select().from(eventTypes).where(eq(eventTypes.id, etId));
      const row = { uid: shortId() + "pl", eventTypeId: etId, hostId: userId, start, end, inviteeName: attendees[0].name, inviteeEmail: attendees[0].email,
        bufferBeforeMin: 0, bufferAfterMin: 0,
        inviteeTz: host.timezone, notes: `Booked from meeting poll "${p.title}"`, guests: attendees.slice(1).map((a: any) => a.email), answers: {}, seat: 0, groupUid: null };
      await tx.insert(bookings).values(row);
      for (const attendee of attendees) await recordBookingContact(tx, { ...row, inviteeName: attendee.name, inviteeEmail: attendee.email });
      await tx.update(polls).set({ status: "booked", chosen: option, bookingUid: row.uid }).where(eq(polls.id, pollId));
      return { row, et, host };
    }, { isolationLevel: "read committed" });
  } catch (error) {
    if (error instanceof Error && ["not_found", "closed", "bad_option", "no_votes", "slot_unavailable"].includes(error.message)) throw error;
    throw new Error("slot_unavailable");
  }
  await finalize([{ ...reserved.row, paymentStatus: "none" }], reserved.et, [reserved.host], false);
  return reserved.row.uid as string;
}
