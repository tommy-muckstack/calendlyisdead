import { DateTime } from "luxon";
import { availability } from "./booking";

/** What we pull out of a pasted email thread. */
export type Parsed = {
  title: string; durationMin: number | null; timezone: string | null;
  people: { name: string; email: string }[];
  windows: { date: string | null; weekday: number | null; fromHour: number; toHour: number; nextWeek?: boolean }[];
  explicit: string[]; // ISO times mentioned exactly ("Tuesday at 2pm")
};

const TZ: Record<string, string> = { pt: "America/Los_Angeles", pst: "America/Los_Angeles", pdt: "America/Los_Angeles", pacific: "America/Los_Angeles",
  mt: "America/Denver", mst: "America/Denver", mdt: "America/Denver", ct: "America/Chicago", cst: "America/Chicago", cdt: "America/Chicago", central: "America/Chicago",
  et: "America/New_York", est: "America/New_York", edt: "America/New_York", eastern: "America/New_York", gmt: "Europe/London", bst: "Europe/London", uk: "Europe/London",
  cet: "Europe/Paris", cest: "Europe/Paris", ist: "Asia/Kolkata", jst: "Asia/Tokyo", aest: "Australia/Sydney", utc: "UTC" };
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const PARTS: Record<string, [number, number]> = { morning: [9, 12], lunch: [12, 14], afternoon: [12, 17], evening: [17, 20], "end of day": [15, 18] };

function hourOf(h: string, m: string | undefined, ap: string | undefined) {
  let x = Number(h) % 24; if (ap) { const pm = /p/i.test(ap); if (pm && x < 12) x += 12; if (!pm && x === 12) x = 0; } else if (x >= 1 && x <= 7) x += 12; // "at 3" means 3pm
  return { h: x, m: Number(m ?? 0) };
}

/** Heuristic parser: works with no API key. */
export function parseThread(text: string, opts: { now?: DateTime; hostEmail?: string; hostTz: string }): Parsed {
  const now = (opts.now ?? DateTime.now()).setZone(opts.hostTz);
  const subject = /^subject:\s*(?:(?:re|fwd?):\s*)*(.+)$/im.exec(text)?.[1]?.trim();
  // people: "Name <email>" pairs first, then bare emails
  const people = new Map<string, string>();
  for (const m of text.matchAll(/"?([A-Z][\w.'-]*(?: [A-Z][\w.'-]*)*)"?\s*<([^>\s]+@[^>\s]+)>/g)) people.set(m[2].toLowerCase(), m[1]);
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) if (!people.has(m[0].toLowerCase())) people.set(m[0].toLowerCase(), m[0].split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
  if (opts.hostEmail) people.delete(opts.hostEmail.toLowerCase());
  for (const e of [...people.keys()]) if (/noreply|no-reply|calendlyisdead|mail\.grokbot/i.test(e)) people.delete(e);
  // only the newest message's body matters most, but older proposals are still useful; scan everything except quoted ">" lines
  const body = text.split("\n").filter(l => !/^\s*>/.test(l) && !/^(from|to|cc|date|subject):/i.test(l)).join("\n").toLowerCase();
  const dm = /(\d{1,3})\s*(?:-|\s)?(min|mins|minutes|minute)\b/.exec(body), hm = /(half an hour|an hour|one hour|1 hour|(\d(?:\.\d)?)\s*(?:hours?|hrs?))\b/.exec(body);
  const durationMin = dm ? Number(dm[1]) : hm ? (/half/.test(hm[1]) ? 30 : hm[2] ? Math.round(Number(hm[2]) * 60) : 60) : /quick (call|chat)/.test(body) ? 15 : null;
  const tzWord = /\b(pt|pst|pdt|pacific|mt|mst|mdt|ct|cst|cdt|central|et|est|edt|eastern|gmt|bst|uk|cet|cest|ist|jst|aest|utc)\b(?:\s*time)?/.exec(body);
  const timezone = tzWord ? TZ[tzWord[1]] : null;
  const zone = timezone ?? opts.hostTz;
  const windows: Parsed["windows"] = [], explicit: string[] = [];
  const nextWeek = /next week/.test(body);
  // sentences: look for day words, then time words near them
  for (const sentence of body.split(/[.!?\n;]+|\s(?:or|but|otherwise)\s/)) {
    const days: { date: string | null; weekday: number | null }[] = [];
    if (/\btoday\b/.test(sentence)) days.push({ date: now.toISODate(), weekday: null });
    if (/\btomorrow\b/.test(sentence)) days.push({ date: now.plus({ days: 1 }).toISODate(), weekday: null });
    DAYS.forEach((d, i) => { if (new RegExp(`\\b${d.slice(0, 3)}(${d.slice(3)})?\\b`).test(sentence)) days.push({ date: null, weekday: i + 1 }); });
    const md = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/.exec(sentence);
    if (md) { const d = DateTime.fromFormat(`${md[1]} ${md[2]} ${now.year}`, "LLL d yyyy", { zone }); if (d.isValid) days.push({ date: (d < now.startOf("day") ? d.plus({ years: 1 }) : d).toISODate(), weekday: null }); }
    if (!days.length && /next week|this week|any ?time|whenever/.test(sentence)) days.push({ date: null, weekday: null });
    if (!days.length) continue;
    let from = 9, to = 17;
    for (const [w, [a, b]] of Object.entries(PARTS)) if (sentence.includes(w)) { from = a; to = b; }
    const range = /(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(sentence);
    const after = /after\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(sentence), before = /before\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(sentence);
    const at = [...sentence.matchAll(/\b(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g)];
    if (range) { from = hourOf(range[1], range[2], range[3] ?? range[6]).h; to = hourOf(range[4], range[5], range[6]).h; }
    if (after) from = hourOf(after[1], after[2], after[3]).h;
    if (before) to = hourOf(before[1], before[2], before[3]).h;
    for (const d of days) {
      if (at.length && !range) for (const a of at) {
        const t = hourOf(a[1], a[2], a[3]);
        const base = d.date ? DateTime.fromISO(d.date, { zone }) : d.weekday ? nextWeekday(now.setZone(zone), d.weekday, nextWeek) : null;
        if (base) explicit.push(base.set({ hour: t.h, minute: t.m, second: 0, millisecond: 0 }).toUTC().toISO()!);
      }
      windows.push({ ...d, fromHour: from, toHour: Math.max(to, from + 1), nextWeek });
    }
  }
  // "next week" plus "Thursday afternoon" means Thursday afternoon, not any day
  const specific = windows.filter(w => w.date || w.weekday);
  return { title: subject ?? "Meeting", durationMin, timezone, people: [...people].map(([email, name]) => ({ name, email })), windows: specific.length ? specific : windows, explicit: [...new Set(explicit)] };
}

function nextWeekday(now: DateTime, weekday: number, nextWeek: boolean) {
  let d = now.startOf("day"); const add = (weekday - d.weekday + 7) % 7 || 7; d = d.plus({ days: add });
  if (nextWeek && d < now.startOf("week").plus({ weeks: 1 })) d = d.plus({ weeks: 1 });
  return d;
}

/** Optional LLM pass (any OpenAI-compatible API). Falls back to the heuristic result on any failure. */
export async function parseWithLlm(text: string, base: Parsed, opts: { hostTz: string; now?: DateTime }, f: typeof fetch = fetch): Promise<{ parsed: Parsed; source: "llm" | "heuristic" }> {
  const key = process.env.LLM_API_KEY; if (!key) return { parsed: base, source: "heuristic" };
  const now = (opts.now ?? DateTime.now()).setZone(opts.hostTz);
  try {
    const r = await f(`${process.env.LLM_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.LLM_MODEL ?? "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0, messages: [
        { role: "system", content: `You extract scheduling intent from email threads. Now is ${now.toISO()} (${opts.hostTz}). Reply with JSON: {"title":string,"durationMin":number|null,"timezone":IANA string|null,"people":[{"name","email"}],"windows":[{"date":"yyyy-mm-dd"|null,"weekday":1-7|null,"fromHour":0-23,"toHour":1-24}],"explicit":[ISO-8601 UTC]}. People excludes the host. Only include times the other side said work.` },
        { role: "user", content: text.slice(0, 20000) }] }) });
    if (!r.ok) throw new Error(String(r.status));
    const j = JSON.parse((await r.json()).choices[0].message.content);
    return { parsed: { ...base, ...j, people: j.people?.length ? j.people : base.people }, source: "llm" };
  } catch (e: any) { console.warn(`[assistant] llm failed (${e.message}); using heuristic`); return { parsed: base, source: "heuristic" }; }
}

/** Intersect the thread's windows with the host's real availability and pick a few spread-out options. */
export async function propose(owner: string, slug: string, p: Parsed, hostTz: string, n = 3, now = DateTime.utc()) {
  const zone = p.timezone ?? hostTz;
  const from = now.setZone(zone).toISODate()!, to = now.setZone(zone).plus({ days: 21 }).toISODate()!;
  const r = await availability(owner, slug, from, to, zone, now); if (!r) return null;
  const all = Object.values(r.slots).flat().sort();
  const fits = (iso: string) => {
    const d = DateTime.fromISO(iso).setZone(zone);
    if (!p.windows.length) return true;
    return p.windows.some(w => (w.date ? d.toISODate() === w.date : w.weekday ? d.weekday === w.weekday : true)
      && (!w.nextWeek || d >= now.setZone(zone).startOf("week").plus({ weeks: 1 })) && d.hour >= w.fromHour && d.hour < w.toHour);
  };
  const exact = p.explicit.filter(x => all.includes(DateTime.fromISO(x).toUTC().toISO()!)).map(x => DateTime.fromISO(x).toUTC().toISO()!);
  const out: string[] = [...exact];
  const perDay = new Map<string, number>();
  for (const s of all.filter(fits)) {
    if (out.length >= n) break; if (out.includes(s)) continue;
    const day = DateTime.fromISO(s).setZone(zone).toISODate()!;
    if ((perDay.get(day) ?? 0) >= 1 && all.filter(fits).some(x => !perDay.has(DateTime.fromISO(x).setZone(zone).toISODate()!))) continue; // spread across days first
    perDay.set(day, (perDay.get(day) ?? 0) + 1); out.push(s);
  }
  for (const s of all.filter(fits)) { if (out.length >= n) break; if (!out.includes(s)) out.push(s); }
  return { slots: out.slice(0, n).sort(), zone, exactMatch: exact[0] ?? null, eventType: r.ev.eventType };
}

export function draftReply(o: { hostName: string; people: { name: string }[]; slots: string[]; zone: string; links: string[]; profileUrl: string; exactMatch: string | null }) {
  const first = o.people[0]?.name?.split(" ")[0] ?? "there";
  const f = (iso: string) => DateTime.fromISO(iso).setZone(o.zone).toFormat("cccc, LLL d 'at' h:mm a ZZZZ");
  if (o.exactMatch) return `Hi ${first},\n\n${f(o.exactMatch)} works for me. You can lock it in here: ${o.links[o.slots.indexOf(o.exactMatch)] ?? o.profileUrl}\n\nBest,\n${o.hostName}`;
  if (!o.slots.length) return `Hi ${first},\n\nNone of those times are open on my side. Here's my calendar, grab whatever works: ${o.profileUrl}\n\nBest,\n${o.hostName}`;
  return `Hi ${first},\n\nHere are a few times that work for me:\n${o.slots.map((s, i) => `• ${f(s)}: ${o.links[i]}`).join("\n")}\n\nEach link books that time in one click. If none fit, pick any open slot here: ${o.profileUrl}\n\nBest,\n${o.hostName}`;
}
