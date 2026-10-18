import path from 'node:path';
if (!path.resolve(process.env.PGLITE_DIR || '').startsWith(path.resolve('.data/conference-e2e') + path.sep) || process.env.DATABASE_URL || process.env.RESEND_API_KEY || process.env.AUTH_SECRET !== 'conference-e2e-only') throw new Error('The offline provider is restricted to conference E2E fixtures.');
const original = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'www.googleapis.com') {
    const method = init.method || 'GET';
    if (url.pathname.endsWith('/freeBusy')) return Response.json({ calendars: { 'synthetic-calendar': { busy: [] } } });
    if (method === 'POST' && url.pathname.endsWith('/events')) {
      const payload = JSON.parse(init.body);
      return Response.json({ id: 'qa-' + payload.iCalUID.split('@')[0], conferenceData: { createRequest: { status: { statusCode: payload.summary.includes('Failure QA') ? 'failure' : 'pending' } } } });
    }
    if (method === 'GET' && url.pathname.includes('/events/')) return Response.json({ hangoutLink: 'https://meet.google.com/qa-' + url.pathname.split('/').at(-1) });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error('Unrecognized synthetic Google request');
  }
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return original(input, init);
  throw new Error('External network is disabled in conference E2E fixtures');
};
