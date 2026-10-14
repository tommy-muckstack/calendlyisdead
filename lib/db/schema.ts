import { pgTable, text, integer, timestamp, jsonb, primaryKey, boolean } from "drizzle-orm/pg-core";
import type { Weekly } from "../slots";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  username: text("username").unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
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
});
export const eventTypes = pgTable("event_types", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  scheduleId: text("scheduleId").references(() => schedules.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  durationMin: integer("durationMin").notNull().default(30),
  location: text("location").notNull().default(""),
  color: text("color").notNull().default("#0E7C66"),
  bufferBeforeMin: integer("bufferBeforeMin").notNull().default(0),
  bufferAfterMin: integer("bufferAfterMin").notNull().default(0),
  minNoticeMin: integer("minNoticeMin").notNull().default(240),
  rangeDays: integer("rangeDays").notNull().default(60),
  active: boolean("active").notNull().default(true),
  kind: text("kind").notNull().default("one_on_one"),
});
export const bookings = pgTable("bookings", {
  uid: text("uid").primaryKey(),
  eventTypeId: text("eventTypeId").notNull().references(() => eventTypes.id, { onDelete: "cascade" }),
  hostId: text("hostId").notNull().references(() => users.id),
  start: timestamp("start", { mode: "date", withTimezone: true }).notNull(),
  end: timestamp("end", { mode: "date", withTimezone: true }).notNull(),
  inviteeName: text("inviteeName").notNull(),
  inviteeEmail: text("inviteeEmail").notNull(),
  inviteeTz: text("inviteeTz").notNull(),
  notes: text("notes").notNull().default(""),
  guests: jsonb("guests").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("confirmed"), // confirmed | cancelled
  cancelReason: text("cancelReason"),
  rescheduledFrom: text("rescheduledFrom"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
