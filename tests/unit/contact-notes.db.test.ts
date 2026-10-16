import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
import { EMPTY_NOTE } from "../../lib/contact-note-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user", timezone: "UTC" }) as { id: string; timezone: string } | null));
const mail = vi.hoisted(() => vi.fn<(message: import("../../lib/email").Mail) => Promise<boolean>>(async () => true));
const configured = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/auth", () => ({ requireUser: auth })); vi.mock("../../lib/email", () => ({ sendMail: mail, emailConfigured: configured }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), service: typeof import("../../lib/contact-notes"), reminders: typeof import("../../lib/contact-reminders"), contacts: typeof import("../../lib/contacts");
let collection: typeof import("../../app/api/contacts/[id]/notes/route"), item: typeof import("../../app/api/contacts/[id]/notes/[noteId]/route"), cron: typeof import("../../app/api/cron/workflows/route");
let person: string; const now = new Date("2027-03-14T05:00:00Z"), day = "2027-03-14";
const request = (method: string, body?: unknown, url = "http://localhost") => new NextRequest(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const context = (noteId = crypto.randomUUID()) => ({ params: Promise.resolve({ id: person, noteId }) });
const create = (extra = {}, id = crypto.randomUUID()) => collection.POST(request("POST", { ...EMPTY_NOTE, title: "Follow up", ...extra, id }), context());
const note = (extra = {}, at = now) => service.createContactNote("demo-user", person, crypto.randomUUID(), { ...EMPTY_NOTE, title: "Follow up", reminderDate: day, ...extra }, at);
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-notes-")), "db")); vi.stubEnv("APP_URL", "https://example.invalid/calendlyisdead");
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema; service = await import("../../lib/contact-notes"); reminders = await import("../../lib/contact-reminders"); contacts = await import("../../lib/contacts");
  collection = await import("../../app/api/contacts/[id]/notes/route"); item = await import("../../app/api/contacts/[id]/notes/[noteId]/route"); cron = await import("../../app/api/cron/workflows/route");
});
beforeEach(async () => {
  await db.delete(schema.contactReminderDigests); await db.delete(schema.contactNotes); await db.delete(schema.contacts); await db.delete(schema.bookings);
  await db.update(schema.users).set({ timezone: "UTC" }); auth.mockResolvedValue({ id: "demo-user", timezone: "UTC" }); mail.mockReset(); mail.mockResolvedValue(true); configured.mockReturnValue(true);
  person = (await contacts.createContact("demo-user", crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Contact QA", email: "qa@example.invalid" })).id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("private contact notes", () => {
  it.each([{ title: "Title only" }, { title: "", body: "Body only" }, { title: "  Title ", body: "Line 1\nLine 2", reminderDate: "2028-02-29" }])("saves title/body and optional date %j", async extra => {
    const response = await create(extra); expect(response.status).toBe(201); const saved = await response.json(); expect(saved).toMatchObject({ title: extra.title.trim(), version: 1, contactId: person }); expect(saved).not.toHaveProperty("userId"); expect((await item.GET(request("GET"), context(saved.id))).status).toBe(200);
  });
  it.each([{ title: " ", body: " " }, { title: "x".repeat(201) }, { body: "x".repeat(10001) }, { reminderDate: "2027-02-29" }, { reminderDate: "tomorrow" }, { reminderDate: "2027-13-01" }, { userId: "demo-mate" }, { contactId: "other" }])("rejects invalid notes %j", async extra => { expect((await create(extra)).status).toBe(400); expect(await db.select().from(schema.contactNotes)).toEqual([]); });
  it("confirms concurrent creation retries and protects IDs after edit/deletion", async () => {
    const id = crypto.randomUUID(), [a, b] = await Promise.all([create({}, id), create({}, id)]); expect(a.status).toBe(201); expect(await a.json()).toEqual(await b.json());
    await service.editContactNote("demo-user", person, id, 1, { ...EMPTY_NOTE, title: "Changed" }); expect((await create({}, id)).status).toBe(409);
    await service.deleteContactNote("demo-user", person, id, 2); expect((await create({}, id)).status).toBe(409); const [deleted] = await db.select().from(schema.contactNotes); expect(deleted).toMatchObject({ title: "", body: "", reminderDate: null });
    await service.deleteContactNote("demo-user", person, id, 2); await expect(service.getContactNote("demo-user", person, id)).rejects.toMatchObject({ status: 404 });
  });
  it("updates timestamps, preserves exact retries and rejects competing edits", async () => {
    const saved = await note(), later = new Date(+now + 60000), input = { ...EMPTY_NOTE, title: "New", body: "Details", reminderDate: day };
    const updated = await service.editContactNote("demo-user", person, saved.id, 1, input, later); expect(updated.updatedAt).toBe(later.toISOString()); expect(updated.createdAt).toBe(now.toISOString()); expect(updated.version).toBe(2);
    expect(await service.editContactNote("demo-user", person, saved.id, 1, input)).toEqual(updated);
    await expect(service.editContactNote("demo-user", person, saved.id, 1, { ...input, title: "Stale" })).rejects.toMatchObject({ code: "changed" });
    await expect(service.deleteContactNote("demo-user", person, saved.id, 1)).rejects.toMatchObject({ code: "changed" });
  });
  it("completes idempotently, retains completion on text edits and resets it on date changes", async () => {
    const saved = await note(), completed = await service.completeContactReminder("demo-user", person, saved.id, 1, now); expect(completed.completedAt).toBe(now.toISOString()); expect(await service.completeContactReminder("demo-user", person, saved.id, 1)).toEqual(completed);
    const edited = await service.editContactNote("demo-user", person, saved.id, 2, { ...completed, body: "Changed body" }); expect(edited.completedAt).toBe(completed.completedAt);
    const rescheduled = await service.editContactNote("demo-user", person, saved.id, 3, { ...edited, reminderDate: "2027-03-15" }); expect(rescheduled.completedAt).toBeNull();
    await expect(service.completeContactReminder("demo-user", person, saved.id, 2)).rejects.toMatchObject({ code: "changed" });
    const removed = await service.editContactNote("demo-user", person, saved.id, 4, { ...rescheduled, reminderDate: null }); expect(removed.reminderDate).toBeNull(); await expect(service.completeContactReminder("demo-user", person, saved.id, 5)).rejects.toMatchObject({ code: "no_reminder" });
  });
  it("requires owner/contact scope for every read and mutation", async () => {
    const saved = await note(); auth.mockResolvedValue({ id: "demo-mate", timezone: "UTC" }); expect((await collection.GET(request("GET"), context())).status).toBe(404); expect((await create()).status).toBe(404); expect((await item.GET(request("GET"), context(saved.id))).status).toBe(404);
    expect((await item.PATCH(request("PATCH", { action: "complete", version: 1 }), context(saved.id))).status).toBe(404); expect((await item.DELETE(request("DELETE", { version: 1 }), context(saved.id))).status).toBe(404);
    const other = await contacts.createContact("demo-user", crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Other", email: "other@example.invalid" }); await expect(service.getContactNote("demo-user", other.id, saved.id)).rejects.toMatchObject({ status: 404 });
    await contacts.deleteContact("demo-user", person, 1); await expect(service.getContactNote("demo-user", person, saved.id)).rejects.toMatchObject({ status: 404 }); expect((await service.listContactReminders("demo-user", "UTC", "all")).total).toBe(0);
  });
  it("rejects signed-out, malformed, oversized and invalid page requests and reports persistence failures", async () => {
    auth.mockResolvedValue(null); expect((await create()).status).toBe(401); expect((await collection.GET(request("GET"), context())).status).toBe(401); expect((await item.GET(request("GET"), context())).status).toBe(401); expect((await item.PATCH(request("PATCH", {}), context())).status).toBe(401); expect((await item.DELETE(request("DELETE", {}), context())).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-user", timezone: "UTC" }); expect((await collection.POST(new NextRequest("http://localhost", { method: "POST", body: "{" }), context())).status).toBe(400); expect((await create({ body: "x".repeat(71000) })).status).toBe(400); expect((await collection.GET(request("GET", undefined, "http://localhost?page=0"), context())).status).toBe(400);
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("secret")); const failed = await create(); expect(failed.status).toBe(500); expect(await failed.json()).toEqual({ error: "save_failed" });
  });
  it("combines notes and own meeting history in descending order with stable pagination", async () => {
    const first = await note({ title: "First" }, new Date("2027-03-13T05:00:00Z")), last = await note({ title: "Latest" }, new Date("2027-03-15T05:00:00Z"));
    await db.insert(schema.bookings).values([{ uid: "own", eventTypeId: "demo-30", hostId: "demo-user", inviteeName: "QA", inviteeEmail: "qa@example.invalid", inviteeTz: "UTC", start: now, end: new Date(+now + 1800000) }, { uid: "foreign", eventTypeId: "demo-30", hostId: "demo-mate", inviteeName: "Private", inviteeEmail: "qa@example.invalid", inviteeTz: "UTC", start: now, end: new Date(+now + 1800000) }]);
    const timeline = await service.contactTimeline("demo-user", person, "all"); expect(timeline.total).toBe(3); expect(timeline.rows.map(row => row.kind === "note" ? row.note.id : row.meeting.uid)).toEqual([last.id, "own", first.id]);
    expect((await service.contactTimeline("demo-user", person, "notes")).total).toBe(2); expect((await service.contactTimeline("demo-user", person, "meetings")).total).toBe(1);
    for (let i = 0; i < 27; i++) await note({ title: `Same instant ${i}` });
    const a = await service.contactTimeline("demo-user", person, "notes"), b = await service.contactTimeline("demo-user", person, "notes", 2); expect(a.rows).toHaveLength(25); expect(b.rows).toHaveLength(4); expect(new Set([...a.rows, ...b.rows].map(row => row.kind === "note" && row.note.id)).size).toBe(29);
    await service.editContactNote("demo-user", person, first.id, 1, { ...first, body: "Updated" }, new Date("2027-03-16T05:00:00Z")); expect((await service.contactTimeline("demo-user", person, "all")).rows[0]).toMatchObject({ note: { id: first.id } });
  });
  it("filters pending reminders by account-local dates and excludes completed/deleted notes", async () => {
    const due = await note(), future = await note({ title: "Tomorrow", reminderDate: "2027-03-15" }), done = await note({ title: "Complete" }); await service.completeContactReminder("demo-user", person, done.id, 1);
    const deleted = await note({ title: "Deleted" }); await service.deleteContactNote("demo-user", person, deleted.id, 1);
    expect((await service.listContactReminders("demo-user", "UTC", "due", 1, now)).rows.map(row => row.note.id)).toEqual([due.id]); expect((await service.listContactReminders("demo-user", "UTC", "upcoming", 1, now)).rows.map(row => row.note.id)).toEqual([future.id]);
    expect((await service.listContactReminders("demo-user", "America/Los_Angeles", "due", 1, now)).total).toBe(0); expect((await service.listContactReminders("demo-user", "UTC", "all", 2, now)).total).toBe(2);
  });
});
describe("5 a.m. contact reminder summaries", () => {
  it.each([
    ["America/New_York", "2027-03-14T08:59:59Z", null], ["America/New_York", "2027-03-14T09:00:00Z", day],
    ["America/New_York", "2027-11-07T09:59:59Z", null], ["America/New_York", "2027-11-07T10:00:00Z", "2027-11-07"],
    ["Asia/Kathmandu", "2027-03-13T23:15:00Z", day], ["Pacific/Kiritimati", "2027-03-13T15:00:00Z", day], ["invalid", "2027-03-14T05:00:00Z", day],
  ])("uses account zone %s at %s", (zone, time, expected) => expect(reminders.reminderDay(zone!, new Date(time!))).toBe(expected));
  it("waits until 5 a.m., sends one private digest under concurrent claims and includes upcoming links", async () => {
    const due = await note(), upcoming = await note({ title: "Upcoming item", reminderDate: "2027-03-15" });
    expect(await reminders.processContactReminders(new Date(+now - 1))).toEqual({ sent: 0, failed: 0, local: 0 });
    await Promise.all([reminders.processContactReminders(now), reminders.processContactReminders(now)]); expect(mail).toHaveBeenCalledOnce(); const message = mail.mock.calls[0][0]; expect(message.to).toBe("demo@calendlyisdead.local"); expect(message.text).toContain(`note=${due.id}`); expect(message.text).toContain(`note=${upcoming.id}`); expect(message.text).toContain("Upcoming item"); expect(message.idempotencyKey).toMatch(/^contact-reminders\//);
    expect((await reminders.processContactReminders(new Date(+now + 3600000))).sent).toBe(0); expect(mail).toHaveBeenCalledOnce();
  });
  it("keeps in-app reminders and records local delivery honestly without a configured provider", async () => {
    await note(); configured.mockReturnValue(false); mail.mockResolvedValue(false); expect(await reminders.processContactReminders(now)).toEqual({ sent: 0, failed: 0, local: 1 }); expect((await db.select().from(schema.contactReminderDigests))[0].status).toBe("local");
    await reminders.processContactReminders(new Date(+now + 3600000)); expect(mail).toHaveBeenCalledOnce(); expect((await service.listContactReminders("demo-user", "UTC", "due", 1, now)).total).toBe(1);
  });
  it("retries failures with the same immutable payload/key after 15 minutes, at most three times", async () => {
    await note(); mail.mockResolvedValue(false); expect((await reminders.processContactReminders(now)).failed).toBe(1); await reminders.processContactReminders(new Date(+now + 14 * 60000)); expect(mail).toHaveBeenCalledOnce();
    await reminders.processContactReminders(new Date(+now + 15 * 60000)); await reminders.processContactReminders(new Date(+now + 30 * 60000)); await reminders.processContactReminders(new Date(+now + 45 * 60000)); expect(mail).toHaveBeenCalledTimes(3); expect(mail.mock.calls[0][0]).toEqual(mail.mock.calls[2][0]);
  });
  it("recovers an abandoned sending claim and suppresses stale snapshots after edits", async () => {
    const saved = await note(); mail.mockResolvedValue(false); await reminders.processContactReminders(now); const [digest] = await db.select().from(schema.contactReminderDigests); await db.update(schema.contactReminderDigests).set({ status: "sending" }).where(eq(schema.contactReminderDigests.id, digest.id));
    mail.mockResolvedValue(true); expect((await reminders.processContactReminders(new Date(+now + 15 * 60000))).sent).toBe(1); expect(mail.mock.calls[0][0]).toEqual(mail.mock.calls[1][0]);
    await db.delete(schema.contactReminderDigests); mail.mockReset(); mail.mockResolvedValue(false); await reminders.processContactReminders(now); await service.editContactNote("demo-user", person, saved.id, 1, { ...saved, title: "Edited" }); await reminders.processContactReminders(new Date(+now + 15 * 60000)); expect(mail).toHaveBeenCalledOnce(); expect((await db.select().from(schema.contactReminderDigests))[0].status).toBe("cancelled");
  });
  it("does not send deleted/completed reminders or an upcoming-only digest", async () => {
    const complete = await note(), deleted = await note(); await service.completeContactReminder("demo-user", person, complete.id, 1); await service.deleteContactNote("demo-user", person, deleted.id, 1); await note({ reminderDate: "2027-03-15" });
    expect((await reminders.processContactReminders(now)).sent).toBe(0); expect(mail).not.toHaveBeenCalled(); await contacts.deleteContact("demo-user", person, 1); expect((await reminders.processContactReminders(new Date("2027-03-16T05:00:00Z"))).sent).toBe(0);
  });
  it("includes overdue items on the next day's digest until completion", async () => { const saved = await note(); await reminders.processContactReminders(now); await reminders.processContactReminders(new Date("2027-03-15T05:00:00Z")); expect(mail).toHaveBeenCalledTimes(2); await service.completeContactReminder("demo-user", person, saved.id, 1); await reminders.processContactReminders(new Date("2027-03-16T05:00:00Z")); expect(mail).toHaveBeenCalledTimes(2); });
  it("keeps owners isolated even if a corrupt row points to another owner's contact", async () => {
    const other = await contacts.createContact("demo-mate", crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Private", email: "private@example.invalid" });
    await db.insert(schema.contactNotes).values({ id: crypto.randomUUID(), userId: "demo-user", contactId: other.id, title: "Private foreign contact", reminderDate: day }); await note(); await reminders.processContactReminders(now); expect(mail).toHaveBeenCalledOnce(); expect(mail.mock.calls[0][0].text).not.toContain("Private");
  });
  it("processes owners beyond the first batch without starving a later due account", async () => {
    const accounts = Array.from({ length: 201 }, (_, i) => ({ id: `a-batch-${String(i).padStart(3, "0")}`, email: `batch-${i}@example.invalid`, timezone: "UTC" }));
    await db.insert(schema.users).values(accounts); const people = accounts.map(user => ({ id: crypto.randomUUID(), userId: user.id, name: "Future only", email: `${user.id}@example.invalid` })); await db.insert(schema.contacts).values(people);
    await db.insert(schema.contactNotes).values(people.map(contact => ({ id: crypto.randomUUID(), userId: contact.userId, contactId: contact.id, title: "Future", reminderDate: "2030-01-01" })));
    await note(); expect((await reminders.processContactReminders(now)).sent).toBe(1); expect(mail).toHaveBeenCalledOnce(); expect(mail.mock.calls[0][0].to).toBe("demo@calendlyisdead.local");
  });
  it("rereads the current account timezone before dispatch", async () => {
    await note(); await db.update(schema.users).set({ timezone: "America/New_York" }).where(eq(schema.users.id, "demo-user")); expect((await reminders.processContactReminders(now)).sent).toBe(0);
    await db.update(schema.users).set({ timezone: "UTC" }).where(eq(schema.users.id, "demo-user")); expect((await reminders.processContactReminders(now)).sent).toBe(1);
  });
  it("authenticates the cron and limits time overrides to demo/development", async () => {
    vi.stubEnv("CRON_SECRET", "test-only"); expect((await cron.GET(request("GET"))).status).toBe(401);
    const headers = { authorization: "Bearer test-only" }; vi.stubEnv("DEMO_MODE", "1"); expect((await cron.GET(new NextRequest("http://localhost?now=invalid", { headers }))).status).toBe(400);
    await note(); const result = await cron.GET(new NextRequest(`http://localhost?now=${now.toISOString()}`, { headers })); expect(await result.json()).toMatchObject({ contactReminders: { sent: 1, local: 0, failed: 0 } });
  });
});
