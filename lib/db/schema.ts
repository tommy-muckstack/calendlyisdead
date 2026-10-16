import { pgTable, text, integer, timestamp, jsonb, primaryKey, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Weekly } from "../slots";
import type { BookingDateRange } from "../booking-date-range";
export type Question = { id: string; label: string; type: "text" | "textarea" | "phone" | "select"; required: boolean; options?: string[] };

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  welcomeMessage: text("welcomeMessage").notNull().default("Pick a meeting type to see open times."),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  username: text("username").unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  meetingLimitPerDay: integer("meetingLimitPerDay"),
  meetingLimitPerWeek: integer("meetingLimitPerWeek"),
  meetingLimitPerMonth: integer("meetingLimitPerMonth"),
  addToCalendarId: text("addToCalendarId"),
  brandColor: text("brandColor"),
  logoUrl: text("logoUrl"),
  hideBranding: boolean("hideBranding").notNull().default(false),
  firebaseUid: text("firebase_uid").unique(),
});
export const accounts = pgTable("accounts", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), provider: text("provider").notNull(), providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"), access_token: text("access_token"), expires_at: integer("expires_at"),
  token_type: text("token_type"), scope: text("scope"), id_token: text("id_token"), session_state: text("session_state"),
}, a => [primaryKey({ columns: [a.provider, a.providerAccountId] })]);
export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});
export const verificationTokens = pgTable("verificationTokens", {
  identifier: text("identifier").notNull(), token: text("token").notNull(), expires: timestamp("expires", { mode: "date" }).notNull(),
}, v => [primaryKey({ columns: [v.identifier, v.token] })]);

export const schedules = pgTable("schedules", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Working hours"),
  timezone: text("timezone").notNull(),
  weekly: jsonb("weekly").$type<Weekly>().notNull(),
  overrides: jsonb("overrides").$type<Record<string, { start: string; end: string }[]>>().notNull().default({}),
  isDefault: boolean("isDefault").notNull().default(true),
  holidayCountry: text("holidayCountry"),
});
export const eventTypes = pgTable("event_types", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  scheduleId: text("scheduleId").references(() => schedules.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  durationMin: integer("durationMin").notNull().default(30),
  startIntervalMin: integer("startIntervalMin").notNull().default(30),
  location: text("location").notNull().default(""),
  color: text("color").notNull().default("#0E7C66"),
  bufferBeforeMin: integer("bufferBeforeMin").notNull().default(0),
  bufferAfterMin: integer("bufferAfterMin").notNull().default(0),
  minNoticeMin: integer("minNoticeMin").notNull().default(240),
  rangeDays: integer("rangeDays").notNull().default(60),
  dateRange: jsonb("dateRange").$type<BookingDateRange>(),
  active: boolean("active").notNull().default(true),
  secret: boolean("secret").notNull().default(false),
  lockedTimezone: text("lockedTimezone"),
  deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
  kind: text("kind").notNull().default("one_on_one"),
  questions: jsonb("questions").$type<Question[]>().notNull().default([]),
  maxPerDay: integer("maxPerDay"),
  maxPerWeek: integer("maxPerWeek"),
  maxPerMonth: integer("maxPerMonth"),
  teamId: text("teamId"),
  seats: integer("seats").notNull().default(1),
  rrMode: text("rrMode").notNull().default("even"), // even | priority
  managedParentId: text("managedParentId"),
  lockedFields: jsonb("lockedFields").$type<string[]>().notNull().default([]),
  priceCents: integer("priceCents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  redirectUrl: text("redirectUrl"),
  usedAt: timestamp("usedAt", { mode: "date", withTimezone: true }),
}, e => [
  uniqueIndex("event_types_current_personal_slug").on(e.userId, e.slug).where(sql`${e.deletedAt} IS NULL AND ${e.teamId} IS NULL`),
  uniqueIndex("event_types_current_team_slug").on(e.teamId, e.slug).where(sql`${e.deletedAt} IS NULL AND ${e.teamId} IS NOT NULL`),
]);
export const bookings = pgTable("bookings", {
  uid: text("uid").primaryKey(),
  eventTypeId: text("eventTypeId").notNull().references(() => eventTypes.id, { onDelete: "cascade" }),
  hostId: text("hostId").notNull().references(() => users.id),
  start: timestamp("start", { mode: "date", withTimezone: true }).notNull(),
  end: timestamp("end", { mode: "date", withTimezone: true }).notNull(),
  // Snapshots: changes to an event type must not change existing reservations.
  bufferBeforeMin: integer("bufferBeforeMin").notNull().default(0),
  bufferAfterMin: integer("bufferAfterMin").notNull().default(0),
  inviteeName: text("inviteeName").notNull(),
  inviteeEmail: text("inviteeEmail").notNull(),
  inviteeTz: text("inviteeTz").notNull(),
  notes: text("notes").notNull().default(""),
  guests: jsonb("guests").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("confirmed"), // confirmed | cancelled
  cancelReason: text("cancelReason"),
  rescheduledFrom: text("rescheduledFrom"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
  externalCalendarId: text("externalCalendarId"),
  externalEventId: text("externalEventId"),
  meetingUrl: text("meetingUrl"),
  seat: integer("seat").notNull().default(0),
  inviteeLimit: integer("inviteeLimit").notNull().default(1), // Shared snapshot for every attendee in a group session.
  groupUid: text("groupUid"),
  paymentStatus: text("paymentStatus").notNull().default("none"), // none | pending | paid
  paymentRef: text("paymentRef"),
  amountCents: integer("amountCents").notNull().default(0),
}, b => [index("bookings_contact_lookup").on(b.hostId, sql`lower(btrim(${b.inviteeEmail}))`)]);
export const teams = pgTable("teams", { id: text("id").primaryKey(), slug: text("slug").notNull().unique(), name: text("name").notNull(),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow() });
export const teamMembers = pgTable("team_members", { teamId: text("teamId").notNull(), userId: text("userId").notNull(), role: text("role").notNull().default("member") },
  t => [primaryKey({ columns: [t.teamId, t.userId] })]);
export const teamInvites = pgTable("team_invites", { token: text("token").primaryKey(), teamId: text("teamId").notNull(), email: text("email").notNull(), role: text("role").notNull().default("member"),
  invitedBy: text("invitedBy").notNull(), expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(), acceptedAt: timestamp("acceptedAt", { mode: "date", withTimezone: true }) });
export const eventTypeHosts = pgTable("event_type_hosts", { eventTypeId: text("eventTypeId").notNull(), userId: text("userId").notNull(), priority: integer("priority").notNull().default(2) },
  t => [primaryKey({ columns: [t.eventTypeId, t.userId] })]);
export type WorkflowTrigger = "on_booked" | "before_start" | "after_end" | "on_cancelled";
export const workflows = pgTable("workflows", { id: text("id").primaryKey(), userId: text("userId").notNull(), name: text("name").notNull(), trigger: text("trigger").$type<WorkflowTrigger>().notNull(),
  offsetMin: integer("offsetMin").notNull().default(0), channel: text("channel").$type<"email" | "sms">().notNull().default("email"), recipient: text("recipient").$type<"invitee" | "host">().notNull().default("invitee"),
  subject: text("subject").notNull().default(""), body: text("body").notNull().default(""), eventTypeIds: jsonb("eventTypeIds").$type<string[]>().notNull().default([]), active: boolean("active").notNull().default(true) });
export const scheduledMessages = pgTable("scheduled_messages", { id: text("id").primaryKey(), workflowId: text("workflowId").notNull(), bookingUid: text("bookingUid").notNull(),
  sendAt: timestamp("sendAt", { mode: "date", withTimezone: true }).notNull(), status: text("status").notNull().default("pending"), error: text("error"), sentAt: timestamp("sentAt", { mode: "date", withTimezone: true }) });
export type FormField = { id: string; label: string; type: "text" | "email" | "select"; required: boolean; options?: string[] };
export type Condition = { fieldId: string; op: "equals" | "not_equals" | "contains" | "in" | "gte" | "lte"; value: string };
export type RouteAction = { type: "event" | "url" | "message"; value: string };
export type Rule = { match: "all" | "any"; conditions: Condition[]; action: RouteAction };
export const routingForms = pgTable("routing_forms", { id: text("id").primaryKey(), userId: text("userId").notNull(), name: text("name").notNull(),
  fields: jsonb("fields").$type<FormField[]>().notNull().default([]), rules: jsonb("rules").$type<Rule[]>().notNull().default([]), fallback: jsonb("fallback").$type<RouteAction>().notNull() });
export const formResponses = pgTable("form_responses", { id: text("id").primaryKey(), formId: text("formId").notNull(), answers: jsonb("answers").notNull(), routedTo: jsonb("routedTo").notNull(),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow() });
export const calendarConnections = pgTable("calendar_connections", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // google | microsoft | caldav | mock
  accountEmail: text("accountEmail").notNull().default(""),
  secret: text("secret").notNull(), // AES-GCM encrypted JSON (tokens or CalDAV creds)
  status: text("status").notNull().default("ok"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
export const userCalendars = pgTable("user_calendars", {
  id: text("id").primaryKey(),
  connectionId: text("connectionId").notNull().references(() => calendarConnections.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  externalId: text("externalId").notNull(),
  name: text("name").notNull(),
  isPrimary: boolean("isPrimary").notNull().default(false),
  canWrite: boolean("canWrite").notNull().default(true),
  checkConflicts: boolean("checkConflicts").notNull().default(false),
});

export const pageViews = pgTable("page_views", { eventTypeId: text("eventTypeId").notNull(), day: text("day").notNull(), count: integer("count").notNull().default(0) },
  t => [primaryKey({ columns: [t.eventTypeId, t.day] })]);
export const polls = pgTable("polls", { id: text("id").primaryKey(), userId: text("userId").notNull(), title: text("title").notNull(), durationMin: integer("durationMin").notNull().default(30),
  location: text("location").notNull().default(""), options: jsonb("options").$type<string[]>().notNull().default([]), status: text("status").notNull().default("open"),
  chosen: text("chosen"), bookingUid: text("bookingUid"), createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow() });
export const pollVotes = pgTable("poll_votes", { id: text("id").primaryKey(), pollId: text("pollId").notNull(), name: text("name").notNull(), email: text("email").notNull(),
  picks: jsonb("picks").$type<string[]>().notNull().default([]), createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow() });

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), email: text("email").notNull(), phone: text("phone").notNull().default(""),
  source: text("source").notNull().default(""),
  jobTitle: text("jobTitle").notNull().default(""), company: text("company").notNull().default(""), linkedIn: text("linkedIn").notNull().default(""),
  timezone: text("timezone").notNull().default(""), country: text("country").notNull().default(""), city: text("city").notNull().default(""), state: text("state").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
}, c => [uniqueIndex("contacts_active_owner_email").on(c.userId, sql`lower(${c.email})`).where(sql`${c.deletedAt} IS NULL`),
  index("contacts_owner_email_history").on(c.userId, sql`lower(${c.email})`)]);
export const contactMeetings = pgTable("contact_meetings", {
  contactId: text("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  bookingUid: text("bookingUid").notNull().references(() => bookings.uid, { onDelete: "cascade" }),
  inviteeEmail: text("inviteeEmail"),
}, t => [primaryKey({ columns: [t.contactId, t.bookingUid] })]);
export const contactSettings = pgTable("contact_settings", {
  userId: text("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  bookingEnabled: boolean("bookingEnabled").notNull().default(true),
  exclusions: jsonb("exclusions").$type<string[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  backfilledAt: timestamp("backfilledAt", { mode: "date", withTimezone: true }),
});
export const contactFields = pgTable("contact_fields", {
  id: text("id").primaryKey(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), type: text("type").notNull(), options: jsonb("options").$type<string[]>().notNull().default([]),
  currency: text("currency").notNull().default(""), eventTypeId: text("eventTypeId"), questionId: text("questionId"),
  version: integer("version").notNull().default(1), deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
}, f => [uniqueIndex("contact_fields_owner_name").on(f.userId, sql`lower(${f.name})`).where(sql`${f.deletedAt} IS NULL`)]);
export const contactFieldValues = pgTable("contact_field_values", {
  contactId: text("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  fieldId: text("fieldId").notNull().references(() => contactFields.id, { onDelete: "cascade" }),
  // An object prevents drivers from parsing a JSON string such as "1.2" twice.
  value: jsonb("value").$type<{ data: string | string[] }>().notNull(),
}, v => [primaryKey({ columns: [v.contactId, v.fieldId] })]);
export const contactImports = pgTable("contact_imports", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), id: text("id").notNull(),
  requestHash: text("requestHash").notNull(), result: jsonb("result").$type<import("../contact-transfer-validation").TransferResult>().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.id] })]);
export const contactExports = pgTable("contact_exports", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), id: text("id").notNull(),
  requestHash: text("requestHash").notNull(), csv: text("csv").notNull(), count: integer("count").notNull(),
  email: text("email").notNull().default("pending"), expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
}, t => [primaryKey({ columns: [t.userId, t.id] })]);
export const contactNotes = pgTable("contact_notes", {
  id: text("id").primaryKey(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: text("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""), body: text("body").notNull().default(""), reminderDate: text("reminderDate"),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }), version: integer("version").notNull().default(1),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  deletedAt: timestamp("deletedAt", { withTimezone: true, mode: "date" }),
}, n => [index("contact_notes_timeline").on(n.userId, n.contactId, n.updatedAt), index("contact_notes_reminders").on(n.userId, n.reminderDate).where(sql`${n.deletedAt} IS NULL AND ${n.completedAt} IS NULL`)]);
export const contactReminderDigests = pgTable("contact_reminder_digests", {
  id: text("id").primaryKey(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), day: text("day").notNull(), timezone: text("timezone").notNull(),
  to: text("to").notNull(), subject: text("subject").notNull(), body: text("body").notNull(), status: text("status").notNull(), attempts: integer("attempts").notNull().default(1),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull(), attemptedAt: timestamp("attemptedAt", { withTimezone: true, mode: "date" }).notNull(),
}, d => [uniqueIndex("contact_reminder_daily").on(d.userId, d.day)]);
export const contactCollections = pgTable("contact_collections", {
  id: text("id").primaryKey(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), name: text("name").notNull(), kind: text("kind").notNull(),
  rules: jsonb("rules").$type<import("../contact-view-validation").ContactRuleSet>().notNull(), version: integer("version").notNull().default(1), deletedAt: timestamp("deletedAt", { withTimezone: true, mode: "date" }),
}, c => [uniqueIndex("contact_collections_owner_name").on(c.userId, sql`lower(${c.name})`).where(sql`${c.deletedAt} IS NULL`)]);
export const contactListMembers = pgTable("contact_list_members", {
  collectionId: text("collectionId").notNull().references(() => contactCollections.id, { onDelete: "cascade" }), contactId: text("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
}, m => [primaryKey({ columns: [m.collectionId, m.contactId] })]);
export const contactMembershipReceipts = pgTable("contact_membership_receipts", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), id: text("id").notNull(), requestHash: text("requestHash").notNull(), result: jsonb("result").$type<import("../contact-list-validation").MembershipReceipt>().notNull(),
}, r => [primaryKey({ columns: [r.userId, r.id] })]);
export const contactListAutomations = pgTable("contact_list_automations", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), eventTypeId: text("eventTypeId").notNull().references(() => eventTypes.id, { onDelete: "cascade" }),
  listIds: jsonb("listIds").$type<string[]>().notNull(), enabled: boolean("enabled").notNull().default(false), version: integer("version").notNull().default(1),
  deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
}, a => [primaryKey({ columns: [a.userId, a.eventTypeId] })]);
export const contactListAutomationRuns = pgTable("contact_list_automation_runs", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), bookingUid: text("bookingUid").notNull().references(() => bookings.uid, { onDelete: "cascade" }),
  inviteeEmail: text("inviteeEmail").notNull(), createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, r => [primaryKey({ columns: [r.userId, r.bookingUid, r.inviteeEmail] })]);
export const contactFieldAutomations = pgTable("contact_field_automations", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), eventTypeId: text("eventTypeId").notNull().references(() => eventTypes.id, { onDelete: "cascade" }),
  actions: jsonb("actions").$type<import("../contact-field-automation-validation").ContactFieldAction[]>().notNull(), enabled: boolean("enabled").notNull().default(false), version: integer("version").notNull().default(1),
  deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
}, a => [primaryKey({ columns: [a.userId, a.eventTypeId] })]);
export const contactQuestionAutomations = pgTable("contact_question_automations", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), eventTypeId: text("eventTypeId").notNull().references(() => eventTypes.id, { onDelete: "cascade" }),
  fieldId: text("fieldId").references(() => contactFields.id, { onDelete: "set null" }), questionId: text("questionId"),
  enabled: boolean("enabled").notNull().default(false), legacyConflict: boolean("legacyConflict").notNull().default(false), version: integer("version").notNull().default(1),
  deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
}, a => [primaryKey({ columns: [a.userId, a.eventTypeId] })]);
export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), contactId: text("contactId").references(() => contacts.id, { onDelete: "set null" }),
  name: text("name").notNull(), stage: text("stage").notNull(), amount: text("amount").notNull().default(""), currency: text("currency").notNull().default("USD"), closeDate: text("closeDate").notNull().default(""),
  source: text("source").notNull().default(""), notes: text("notes").notNull().default(""), version: integer("version").notNull().default(1),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, o => [index("opportunity_owner_stage").on(o.userId, o.stage, o.updatedAt)]);
export const opportunityMoves = pgTable("opportunity_moves", {
  id: text("id").primaryKey(), opportunityId: text("opportunityId").notNull().references(() => opportunities.id, { onDelete: "cascade" }), revision: integer("revision").notNull().default(1), from: text("from"), to: text("to").notNull(),
  at: timestamp("at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, m => [index("opportunity_move_history").on(m.opportunityId, m.at)]);
// Only a minimal receipt survives permanent deletion; no deal details or notes.
export const opportunityDeletions = pgTable("opportunity_deletions", {
  id: text("id").primaryKey(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), version: integer("version").notNull(),
});
