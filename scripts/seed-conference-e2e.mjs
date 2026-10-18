// Offline, synthetic fixtures for playwright.conferences.config.ts only.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory = path.resolve(process.env.PGLITE_DIR || '');
if (!directory.startsWith(path.resolve('.data/conference-e2e') + path.sep) || process.env.DATABASE_URL || process.env.RESEND_API_KEY || process.env.AUTH_SECRET !== 'conference-e2e-only') throw new Error('Use only the isolated conference E2E configuration.');
fs.mkdirSync(directory, { recursive: true });
const client = new PGlite(directory);
try {
  await client.exec(fs.readFileSync('lib/db/ddl.sql', 'utf8'));
  await client.query('INSERT INTO users (id, name, email, username, timezone) VALUES ($1,$2,$3,$4,$5)', ['demo-user', 'Conference QA', 'host@example.invalid', 'demo', 'UTC']);
  const weekly = Object.fromEntries([1,2,3,4,5,6,7].map(day => [day, [{ start: '09:00', end: '17:00' }]]));
  await client.query('INSERT INTO schedules (id, "userId", timezone, weekly) VALUES ($1,$2,$3,$4)', ['conference-schedule', 'demo-user', 'UTC', weekly]);
  const iv = crypto.randomBytes(12), key = crypto.createHash('sha256').update(process.env.AUTH_SECRET).digest(), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ access_token: 'synthetic-offline-token' })), cipher.final()]);
  const secret = [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
  await client.query('INSERT INTO calendar_connections (id, "userId", provider, "accountEmail", secret) VALUES ($1,$2,$3,$4,$5)', ['conference-connection', 'demo-user', 'google', 'host@example.invalid', secret]);
  await client.query('INSERT INTO user_calendars (id, "connectionId", "userId", "externalId", name, "canWrite", "checkConflicts") VALUES ($1,$2,$3,$4,$5,true,true)', ['conference-calendar', 'conference-connection', 'demo-user', 'synthetic-calendar', 'Synthetic calendar']);
  await client.query('UPDATE users SET "addToCalendarId"=$1 WHERE id=$2', ['conference-calendar', 'demo-user']);
} finally { await client.close(); }
