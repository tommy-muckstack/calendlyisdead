import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { googleOAuth } from "@/lib/calendars/google";
import { msOAuth } from "@/lib/calendars/microsoft";
import { mockEnabled } from "@/lib/calendars/mock";
import { CalendarsPanel } from "@/components/CalendarsPanel";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const u = (await requireUser())!; const db = await getDb(); const q = await searchParams;
  const conns = await db.select({ id: schema.calendarConnections.id, provider: schema.calendarConnections.provider, accountEmail: schema.calendarConnections.accountEmail, status: schema.calendarConnections.status })
    .from(schema.calendarConnections).where(eq(schema.calendarConnections.userId, u.id));
  const cals = await db.select().from(schema.userCalendars).where(eq(schema.userCalendars.userId, u.id));
  return <CalendarsPanel conns={conns} cals={cals.map((c: any) => ({ id: c.id, connectionId: c.connectionId, name: c.name, isPrimary: c.isPrimary, canWrite: c.canWrite, checkConflicts: c.checkConflicts }))}
    addToId={u.addToCalendarId} available={{ google: googleOAuth.configured(), microsoft: msOAuth.configured(), mock: mockEnabled() }} flash={q.error ? `Couldn't connect (${q.error}).` : q.connected ? `Connected ${q.connected}.` : ""} />;
}
