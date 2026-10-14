import { DateTime, Interval } from "luxon";

export type Range = { start: string; end: string }; // "HH:mm"
export type Weekly = Record<number, Range[]>; // 1=Mon ... 7=Sun (Luxon weekday)
export type Schedule = { timezone: string; weekly: Weekly; overrides: Record<string, Range[]> }; // override date "yyyy-MM-dd" in host tz; [] = unavailable
export type Busy = { start: string; end: string }; // ISO instants

export type SlotInput = {
  schedule: Schedule;
  durationMin: number;
  intervalMin?: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  minNoticeMin?: number;
  rangeDays?: number; // rolling days into the future, from now
  now: DateTime | string;
  from: string; // yyyy-MM-dd, in invitee tz (inclusive)
  to: string;   // yyyy-MM-dd, in invitee tz (inclusive)
  inviteeTz: string;
  busy?: Busy[];
};

/** Returns invitee-local date -> sorted ISO (UTC) slot starts. */
export function generateSlots(i: SlotInput): Record<string, string[]> {
  const hostTz = i.schedule.timezone;
  const now = typeof i.now === "string" ? DateTime.fromISO(i.now, { zone: "utc" }) : i.now;
  const interval = i.intervalMin ?? i.durationMin;
  const bb = i.bufferBeforeMin ?? 0, ba = i.bufferAfterMin ?? 0;
  const earliest = now.plus({ minutes: i.minNoticeMin ?? 0 });
  const latest = i.rangeDays != null ? now.setZone(hostTz).startOf("day").plus({ days: i.rangeDays + 1 }) : null;
  const winStart = DateTime.fromISO(i.from, { zone: i.inviteeTz }).startOf("day");
  const winEnd = DateTime.fromISO(i.to, { zone: i.inviteeTz }).endOf("day");
  const busy = (i.busy ?? []).map(b => Interval.fromDateTimes(DateTime.fromISO(b.start), DateTime.fromISO(b.end)));
  const out: Record<string, string[]> = {};
  // iterate host-local days covering the invitee window (+-1 day for tz offsets)
  let day = winStart.setZone(hostTz).startOf("day").minus({ days: 1 });
  const lastDay = winEnd.setZone(hostTz).startOf("day").plus({ days: 1 });
  while (day <= lastDay) {
    const key = day.toFormat("yyyy-MM-dd");
    const ranges = i.schedule.overrides[key] ?? i.schedule.weekly[day.weekday] ?? [];
    for (const r of ranges) {
      const [sh, sm] = r.start.split(":").map(Number), [eh, em] = r.end.split(":").map(Number);
      // build wall-clock times in host tz; Luxon shifts nonexistent (spring-forward) times forward
      const rs = DateTime.fromObject({ year: day.year, month: day.month, day: day.day, hour: sh, minute: sm }, { zone: hostTz });
      const re = r.end === "24:00" ? day.plus({ days: 1 }).startOf("day")
        : DateTime.fromObject({ year: day.year, month: day.month, day: day.day, hour: eh, minute: em }, { zone: hostTz });
      for (let s = rs; s.plus({ minutes: i.durationMin }) <= re; s = s.plus({ minutes: interval })) {
        const e = s.plus({ minutes: i.durationMin });
        if (s < earliest || s < winStart || s > winEnd) continue;
        if (latest && s >= latest) continue;
        const blocked = Interval.fromDateTimes(s.minus({ minutes: bb }), e.plus({ minutes: ba }));
        if (busy.some(b => b.overlaps(blocked))) continue;
        const local = s.setZone(i.inviteeTz).toFormat("yyyy-MM-dd");
        (out[local] ??= []).push(s.toUTC().toISO()!);
      }
    }
    day = day.plus({ days: 1 });
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].sort();
  return out;
}

export const defaultWeekly = (): Weekly => {
  const nine5 = [{ start: "09:00", end: "17:00" }];
  return { 1: nine5, 2: nine5, 3: nine5, 4: nine5, 5: nine5, 6: [], 7: [] };
};
