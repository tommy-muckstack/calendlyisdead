import { createHash } from "node:crypto";
import { externalBusy } from "./calendars";
import { PollInvitee, type PollInviteeInput, type PollBookingReview } from "./poll-booking-contract";
import { PollCreateInput, PollVoteInput, pollStatus } from "./poll-participation";
import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "./db";
import { finalize } from "./booking";
import { confirmedReservations } from "./booking-busy";
import { hostLimitCheck } from "./host-meeting-limits";
import { recordBookingContact } from "./automatic-contacts";
const { polls, pollVotes, eventTypes, bookings, users, schedules } = schema;
export const shortId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);

export async function createPoll(userId: string, input: { title: string; durationMin: number; location?: string; options: string[]; showVotes?: boolean }) {
  const parsed = PollCreateInput.safeParse(input); if (!parsed.success) throw new Error("invalid");
  const p = parsed.data, opts = [...new Set(p.options.map(o => new Date(o).toISOString()))].sort();
  if (opts.length < 2 || opts.some(o => Date.parse(o) <= Date.now())) throw new Error("invalid_options");
  const db = await getDb(); const id = shortId();
  await db.insert(polls).values({ id, userId, title: p.title, durationMin: p.durationMin, location: p.location, options: opts, showVotes: p.showVotes });
  return id;
}
export async function vote(pollId: string, v: { name: string; email: string; picks: string[] }) {
  const parsed = PollVoteInput.safeParse(v); if (!parsed.success) throw new Error("invalid");
  const input = parsed.data;
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    const [p] = await tx.select().from(polls).where(eq(polls.id, pollId)).for("update");
    if (!p) throw new Error("not_found"); if (pollStatus(p) !== "open") throw new Error("closed");
    const picks = [...new Set(input.picks.map(o => new Date(o).toISOString()))].sort();
    const votes: typeof pollVotes.$inferSelect[] = await tx.select().from(pollVotes).where(eq(pollVotes.pollId, pollId));
    const prior = votes.find(row => row.email.trim().toLowerCase() === input.email);
    // An identical network retry is idempotent; changing a final vote is never allowed.
    if (prior) {
      if (prior.name.trim() === input.name && JSON.stringify([...prior.picks].sort()) === JSON.stringify(picks)) return picks;
      throw new Error("already_voted");
    }
    if (new Set(votes.map(row => row.email.trim().toLowerCase())).size >= 40) throw new Error("full");
    if (picks.some(o => !p.options.includes(o) || Date.parse(o) <= Date.now())) throw new Error("bad_option");
    await tx.insert(pollVotes).values({ id: shortId(), pollId, name: input.name, email: input.email, picks });
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
  return { poll: { ...p, status: pollStatus(p) }, votes, host, tally: tally(p.options, votes) };
}
/** Only this projection crosses the public page boundary; never serialize voter emails. */
export async function getPublicPoll(id: string) {
  const g = await getPoll(id); if (!g) return null;
  const p = g.poll;
  return { poll: { id: p.id, title: p.title, durationMin: p.durationMin, location: p.location, status: p.status },
    host: { name: g.host.name, brandColor: g.host.brandColor, logoUrl: g.host.logoUrl, hideBranding: g.host.hideBranding },
    full: new Set(g.votes.map((row: typeof pollVotes.$inferSelect) => row.email.trim().toLowerCase())).size >= 40,
    tally: g.tally.map(row => ({ option: row.option, ...(p.showVotes ? { count: row.count, names: row.names } : {}) })) };
}
export async function setPollVisibility(userId: string, id: string, showVotes: boolean) {
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    const [p] = await tx.select().from(polls).where(and(eq(polls.id, id), eq(polls.userId, userId))).for("update");
    if (!p) throw new Error("not_found"); if (pollStatus(p) !== "open") throw new Error("closed");
    await tx.update(polls).set({ showVotes }).where(eq(polls.id, id));
    return { showVotes };
  }, { isolationLevel: "read committed" });
}
function selection(p: typeof polls.$inferSelect, votes: typeof pollVotes.$inferSelect[], option: string, extra: PollInviteeInput[]) {
  if (pollStatus(p) !== "open") throw new Error("closed");
  if (!p.options.includes(option) || !Number.isFinite(Date.parse(option)) || Date.parse(option) <= Date.now()) throw new Error("bad_option");
  const attendees = new Map<string, PollInviteeInput>();
  for (const vote of [...votes].sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id))) {
    if (vote.picks.includes(option)) attendees.set(vote.email.toLowerCase(), { name: vote.name, email: vote.email.toLowerCase() });
  }
  if (extra.length > 40) throw new Error("too_many_invitees");
  for (const input of extra) {
    const parsed = PollInvitee.safeParse(input); if (!parsed.success) throw new Error("invalid");
    if (!attendees.has(parsed.data.email)) attendees.set(parsed.data.email, parsed.data);
  }
  if (!attendees.size) throw new Error("no_votes");
  if (attendees.size > 40) throw new Error("too_many_invitees");
  const start = new Date(option), end = new Date(+start + p.durationMin * 60_000);
  return { pollId: p.id, title: p.title, location: p.location, durationMin: p.durationMin,
    start: start.toISOString(), end: end.toISOString(), invitees: [...attendees.values()] };
}
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const overlaps = (a: { start: string | Date; end: string | Date }, start: Date, end: Date) => +new Date(a.start) < +end && +new Date(a.end) > +start;

/** Read-only review. Provider I/O always runs before any reservation lock. */
export async function reviewPollBooking(userId: string, pollId: string, option: string, extra: PollInviteeInput[] = []): Promise<PollBookingReview> {
  const db = await getDb();
  const [p] = await db.select().from(polls).where(and(eq(polls.id, pollId), eq(polls.userId, userId)));
  if (!p) throw new Error("not_found");
  const votes = await db.select().from(pollVotes).where(eq(pollVotes.pollId, pollId));
  const details = selection(p, votes, option, extra), start = new Date(details.start), end = new Date(details.end);
  const [host] = await db.select().from(users).where(eq(users.id, userId)); if (!host) throw new Error("not_found");
  const reservations = await confirmedReservations(db, userId, start, end);
  // Polls may book over buffers, but never over the meeting itself.
  if (reservations.some(row => overlaps(row, start, end)) || (await hostLimitCheck(db, host, start, start))(details.start)) throw new Error("slot_unavailable");
  const checked = await externalBusy(userId, start, end);
  if (checked.errors.length) throw new Error("calendar_unavailable");
  const externalConflict = checked.busy.some(interval => overlaps(interval, start, end));
  return { ...details, externalConflict, reviewKey: fingerprint({ userId, ...details, externalConflict }) };
}

/** Host confirms a reviewed time and invitee list. External conflicts are warnings. */
export async function bookPoll(userId: string, pollId: string, option: string, confirmation: { reviewKey?: string; extraInvitees?: PollInviteeInput[] } = {}) {
  const db = await getDb();
  const extra = confirmation.extraInvitees ?? [];
  const reviewed = await reviewPollBooking(userId, pollId, option, extra);
  if (confirmation.reviewKey && confirmation.reviewKey !== reviewed.reviewKey) throw new Error("review_changed");
  if (!confirmation.reviewKey && (reviewed.externalConflict || extra.length)) throw new Error("review_required");
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
      const details = selection(p, votes, option, extra);
      if (p.durationMin !== reviewed.durationMin || (confirmation.reviewKey && fingerprint({ userId, ...details, externalConflict: reviewed.externalConflict }) !== reviewed.reviewKey)) throw new Error("review_changed");
      const attendees = details.invitees;
      const start = new Date(details.start), end = new Date(details.end);
      const conflicts = await confirmedReservations(tx, userId, start, end);
      if (conflicts.some((row: typeof bookings.$inferSelect) => overlaps(row, start, end))) throw new Error("slot_unavailable");
      if ((await hostLimitCheck(tx, host, start, start))(start.toISOString())) throw new Error("slot_unavailable");

      const [sc] = await tx.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.isDefault, true)));
      const etId = `poll-${pollId}`;
      await tx.insert(eventTypes).values({ id: etId, userId, scheduleId: sc?.id, slug: etId, title: p.title, durationMin: p.durationMin, location: p.location, kind: "poll", active: false }).onConflictDoNothing();
      const [et] = await tx.select().from(eventTypes).where(eq(eventTypes.id, etId));
      const row = { uid: shortId() + "pl", eventTypeId: etId, hostId: userId, start, end, inviteeName: attendees[0].name, inviteeEmail: attendees[0].email,
        location: p.location, bufferBeforeMin: 0, bufferAfterMin: 0,
        inviteeTz: host.timezone, notes: `Booked from meeting poll "${p.title}"`, guests: attendees.slice(1).map((a: any) => a.email), answers: {}, seat: 0, groupUid: null };
      await tx.insert(bookings).values(row);
      for (const attendee of attendees) await recordBookingContact(tx, { ...row, inviteeName: attendee.name, inviteeEmail: attendee.email });
      await tx.update(polls).set({ status: "booked", chosen: option, bookingUid: row.uid }).where(eq(polls.id, pollId));
      return { row, et, host };
    }, { isolationLevel: "read committed" });
  } catch (error) {
    if (error instanceof Error && ["not_found", "closed", "bad_option", "no_votes", "slot_unavailable", "review_changed", "too_many_invitees", "invalid"].includes(error.message)) throw error;
    throw new Error("slot_unavailable");
  }
  await finalize([{ ...reserved.row, paymentStatus: "none" }], reserved.et, [reserved.host], false);
  return reserved.row.uid as string;
}
