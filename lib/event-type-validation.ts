import { z } from "zod";

// Shared browser/API field validation; authorization and managed locks stay server-side.
export const EventTypePatch = z.object({ title: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]{1,60}$/), description: z.string().max(5000),
  durationMin: z.number().int().min(5).max(720), location: z.string().max(300), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bufferBeforeMin: z.number().int().min(0).max(240), bufferAfterMin: z.number().int().min(0).max(240), minNoticeMin: z.number().int().min(0).max(43200),
  rangeDays: z.number().int().min(1).max(730), active: z.boolean(),
  scheduleId: z.string().min(1).nullable(), maxPerDay: z.number().int().min(1).max(100).nullable(), maxPerWeek: z.number().int().min(1).max(500).nullable(),
  questions: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), label: z.string().min(1).max(200), type: z.enum(["text", "textarea", "phone", "select"]),
    required: z.boolean(), options: z.array(z.string().min(1).max(100)).max(30).optional() })).max(20),
  kind: z.enum(["one_on_one", "group"]), seats: z.number().int().min(1).max(9999), rrMode: z.enum(["even", "priority"]),
  priceCents: z.number().int().min(0).max(10_000_000), currency: z.enum(["usd", "eur", "gbp", "cad", "aud"]),
  redirectUrl: z.string().url().regex(/^https?:\/\//).max(500).nullable() }).partial();
