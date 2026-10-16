import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { ContactPreferences, ContactSettingsData, DEFAULT_CONTACT_SETTINGS, type ContactSettings } from "./contact-settings-validation";
import { lockContactOwner, type ContactDB } from "./contact-store";
const S = schema.contactSettings;
export async function readContactSettings(userId: string, db?: ContactDB): Promise<ContactSettings> {
  db ??= await getDb();
  const [row] = await db.select().from(S).where(eq(S.userId, userId));
  return ContactSettingsData.parse(row ?? DEFAULT_CONTACT_SETTINGS);
}
export async function saveContactSettings(userId: string, input: ContactSettings) {
  const db = await getDb(), preferences = ContactPreferences.parse(input);
  return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId);
    const current = await readContactSettings(userId, tx);
    if (current.bookingEnabled === preferences.bookingEnabled && JSON.stringify(current.exclusions) === JSON.stringify(preferences.exclusions)) return current;
    if (current.version !== input.version) throw new Error("changed");
    const values = { ...preferences, version: current.version + 1 };
    const [saved] = await tx.insert(S).values({ userId, ...values }).onConflictDoUpdate({ target: S.userId, set: values }).returning();
    return ContactSettingsData.parse(saved);
  });
}
