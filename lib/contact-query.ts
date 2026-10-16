import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";
import { schema } from "./db";
import type { ContactDB } from "./contact-store";
import { CollectionData, type ContactSelectionScope } from "./contact-list-validation";
import { listContactFields } from "./contact-custom-fields";
import { EMPTY_RULES, filterFields, normalizeContactRules, type ContactCondition } from "./contact-view-validation";
import { meetingZone } from "./meetings";
const { contacts: C, contactCollections: L, users: U } = schema;
export class ContactListError extends Error { constructor(message: string, public status = 409) { super(message); } }
export async function readContactCollection(db: ContactDB, userId: string, id: string) {
  const [row] = await db.select().from(L).where(and(eq(L.userId, userId), eq(L.id, id), isNull(L.deletedAt)));
  if (!row) throw new ContactListError("This list or view is no longer available.", 404); return CollectionData.parse(row);
}
const literalPattern = (value: string) => value.replace(/[\\%_]/g, "\\$&");
function dateCondition(expression: SQL, condition: ContactCondition, timezone: string, now: Date, calendarDate = false) {
  const today = DateTime.fromJSDate(now).setZone(timezone).startOf("day");
  const day = (value: string) => DateTime.fromISO(value, { zone: timezone }).startOf("day");
  const value = (date: DateTime) => calendarDate ? date.toISODate()! : date.toJSDate();
  if (condition.operator === "blank") return sql`${expression} IS NULL`;
  if (condition.operator === "before") return sql`${expression} < ${value(day(condition.value))}`;
  if (condition.operator === "after") return sql`${expression} >= ${value(day(condition.value).plus({ days: 1 }))}`;
  let start = condition.operator === "today" ? today : condition.operator === "yesterday" ? today.minus({ days: 1 }) : day(condition.value), end = start.plus({ days: 1 });
  if (condition.operator === "between") end = day(condition.to).plus({ days: 1 });
  if (condition.operator === "within" || condition.operator === "not_within") { start = condition.direction === "past" ? today.minus({ days: condition.days - 1 }) : today; end = condition.direction === "past" ? today.plus({ days: 1 }) : today.plus({ days: condition.days }); }
  return condition.operator === "not_within" ? sql`(${expression} < ${value(start)} OR ${expression} >= ${value(end)})` : sql`(${expression} >= ${value(start)} AND ${expression} < ${value(end)})`;
}
export async function contactScopeQuery(db: ContactDB, userId: string, scope: ContactSelectionScope = { q: "" }, now = new Date()) {
  const collection = scope.collectionId ? await readContactCollection(db, userId, scope.collectionId) : null;
  if (scope.collectionVersion && collection?.version !== scope.collectionVersion) throw new ContactListError("This list or view changed. Refresh your selection.");
  const fields = await listContactFields(userId, db); let rules;
  try { rules = normalizeContactRules(scope.rules ?? (collection?.kind === "view" ? collection.rules : EMPTY_RULES), fields); } catch (error) { throw new ContactListError((error as Error).message, 400); }
  const [user] = await db.select({ timezone: U.timezone }).from(U).where(eq(U.id, userId)), timezone = meetingZone(user?.timezone ?? "UTC"), choices = filterFields(fields);
  const conditions = rules.conditions.map(condition => {
    const field = choices.find(field => field.id === condition.field)!;
    let expression: SQL;
    if (field.custom) {
      const raw = sql`(SELECT v.value->'data' FROM contact_field_values v WHERE v."contactId" = ${C.id} AND v."fieldId" = ${field.id})`;
      if (field.type === "multi_select") return condition.operator === "blank" ? sql`(${raw} IS NULL OR ${raw} = '[]'::jsonb)` : sql`${raw} ? ${condition.value}`;
      expression = sql`(SELECT nullif(v.value->>'data', '') FROM contact_field_values v WHERE v."contactId" = ${C.id} AND v."fieldId" = ${field.id})`;
      if (field.type === "number" || field.type === "currency") {
        const numeric = sql`(CASE WHEN ${expression} ~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN (${expression})::numeric END)`;
        return condition.operator === "blank" ? sql`${expression} IS NULL` : condition.operator === "gt" ? sql`${numeric} > ${condition.value}::numeric` : condition.operator === "lt" ? sql`${numeric} < ${condition.value}::numeric` : sql`${numeric} = ${condition.value}::numeric`;
      }
      if (field.type === "date") return dateCondition(expression, condition, timezone, now, true);
    } else if (field.id === "createdAt") return dateCondition(sql`${C.createdAt}`, condition, timezone, now);
    else if (["firstMeeting", "lastMeeting", "nextMeeting"].includes(field.id)) {
      expression = sql`(SELECT ${field.id === "lastMeeting" ? sql`max(b.start)` : sql`min(b.start)`} FROM contact_meetings cm JOIN bookings b ON b.uid = cm."bookingUid" WHERE cm."contactId" = ${C.id} AND b."hostId" = ${userId} AND b.status != 'cancelled' AND ${field.id === "nextMeeting" ? sql`b.start >= ${now}` : sql`b.start < ${now}`})`;
      return dateCondition(expression, condition, timezone, now);
    } else expression = sql`nullif(${C[field.id as "name" | "email" | "phone" | "company" | "jobTitle" | "city" | "state" | "country" | "timezone" | "source"]}, '')`;
    if (condition.operator === "blank") return sql`${expression} IS NULL`;
    if (condition.operator === "is") return sql`lower(${expression}) = ${condition.value.toLowerCase()}`;
    return sql`${expression} ILIKE ${condition.operator === "starts_with" ? `${literalPattern(condition.value)}%` : `%${literalPattern(condition.value)}%`}`;
  });
  const query = scope.q ? `%${literalPattern(scope.q)}%` : null;
  const where = and(eq(C.userId, userId), isNull(C.deletedAt), query ? sql`(${C.name} ILIKE ${query} OR ${C.email} ILIKE ${query} OR ${C.company} ILIKE ${query} OR ${C.phone} ILIKE ${query})` : undefined,
    collection?.kind === "list" ? sql`EXISTS (SELECT 1 FROM contact_list_members m WHERE m."collectionId" = ${collection.id} AND m."contactId" = ${C.id})` : undefined,
    conditions.length ? sql`(${sql.join(conditions, rules.match === "all" ? sql` AND ` : sql` OR `)})` : undefined);
  return { where, collection, rules, timezone };
}
