// Synthetic, isolated fixtures. Never connects to an external database or sends mail.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
const directory = path.resolve(process.env.PGLITE_DIR || '');
if (!directory.startsWith(path.resolve('.data/onboarding-e2e') + path.sep) || process.env.DATABASE_URL) throw new Error('Use an isolated .data/onboarding-e2e directory without DATABASE_URL.');
fs.mkdirSync(directory, { recursive: true });
const client = new PGlite(directory);
try {
  await client.exec(fs.readFileSync('lib/db/ddl.sql', 'utf8'));
  const weekly = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, day <= 5 ? [{ start: '09:00', end: '17:00' }] : []]));
  for (const width of [1440, 390]) for (let index = 0; index < 6; index++) {
    const id = `setup-${width}-${index}`;
    await client.query('INSERT INTO users (id, name, email, username) VALUES ($1, $2, $3, $1) ON CONFLICT DO NOTHING', [id, 'Setup QA', `${id}@example.invalid`]);
    await client.query('INSERT INTO account_onboarding ("userId", weekly) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, weekly]);
  }
} finally { await client.close(); }
