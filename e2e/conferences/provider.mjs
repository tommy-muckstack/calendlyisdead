import path from 'node:path';
if (!path.resolve(process.env.PGLITE_DIR || '').startsWith(path.resolve('.data/conference-e2e') + path.sep) || process.env.DATABASE_URL || process.env.RESEND_API_KEY || process.env.AUTH_SECRET !== 'conference-e2e-only') throw new Error('The offline provider is restricted to conference E2E fixtures.');
const original = globalThis.fetch;
const events = new Map();
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'www.googleapis.com') {
    const method = init.method || 'GET';
    if (url.pathname.endsWith('/freeBusy')) return Response.json({ calendars: { 'synthetic-calendar': { busy: [] } } });
    if (method === 'POST' && url.pathname.endsWith('/events')) {
      const payload = JSON.parse(init.body);
      const id = 'qa-' + payload.iCalUID.split('@')[0];
      events.set(url.pathname + '/' + id, { id, status: 'confirmed', etag: '"revision-1"', location: payload.location, hangoutLink: 'https://meet.google.com/qa-' + id });
      return Response.json({ id, conferenceData: { createRequest: { status: { statusCode: payload.summary.includes('Failure QA') ? 'failure' : 'pending' } } } });
    }
    if (method === 'GET' && url.pathname.includes('/events/')) return events.has(url.pathname) ? Response.json(events.get(url.pathname)) : new Response(null, { status: 404 });
    if (method === 'PATCH' && url.pathname.includes('/events/')) {
      const current = events.get(url.pathname); if (!current) return new Response(null, { status: 404 });
      if (init.headers['If-Match'] !== current.etag) return new Response(null, { status: 412 });
      const body = JSON.parse(init.body);
      if (Object.keys(body).join() !== 'location' || url.searchParams.get('sendUpdates') !== 'none') throw new Error('Unexpected synthetic event mutation');
      const updated = { ...current, location: body.location, etag: '"revision-2"' }; events.set(url.pathname, updated); return Response.json(updated);
    }
    if (method === 'DELETE') { events.delete(url.pathname); return new Response(null, { status: 204 }); }
    throw new Error('Unrecognized synthetic Google request');
  }
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return original(input, init);
  throw new Error('External network is disabled in conference E2E fixtures');
};
