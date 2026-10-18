// Reuse the isolated-account and external-network guards from the conference fixture.
import '../conferences/provider.mjs';
const original = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/freeBusy')) {
    const body = JSON.parse(init.body);
    return Response.json({ calendars: { 'synthetic-calendar': { busy: [{ start: body.timeMin, end: body.timeMax }] } } });
  }
  return original(input, init);
};
