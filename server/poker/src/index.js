// Worker entry: creates tables and hands WebSocket connections to the table's Durable Object.
//   POST /api/rooms              { sb, bb, stack, turnSecs } -> { code, hostKey }
//   GET  /api/rooms/:code/ws     WebSocket for one player or spectator
//   POST /api/soccer             -> { code }        (online Head Soccer)
//   GET  /api/soccer/:code/ws    WebSocket for one of the two players
export { PokerRoom } from './room.js';
export { SoccerRoom } from './soccer.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// no 0/O, 1/I/L so codes are easy to read out loud
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  const r = new Uint8Array(5);
  crypto.getRandomValues(r);
  return [...r].map(x => ALPHABET[x % ALPHABET.length]).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      for (let tries = 0; tries < 5; tries++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.init(code, body);
        if (res.ok) return json({ code, hostKey: res.hostKey, settings: res.settings });
        if (res.error) return json({ error: res.error }, 400);
      }
      return json({ error: 'Could not create a table, try again' }, 500);
    }

    if (url.pathname === '/api/soccer' && request.method === 'POST') {
      for (let tries = 0; tries < 5; tries++) {
        const code = newCode();
        const res = await env.SOCCER.get(env.SOCCER.idFromName(code)).init(code);
        if (res.ok) return json({ code });
      }
      return json({ error: 'Could not create a room, try again' }, 500);
    }
    const sm = url.pathname.match(/^\/api\/soccer\/([A-Z0-9]{5})\/ws$/);
    if (sm) {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket' }, 426);
      return env.SOCCER.get(env.SOCCER.idFromName(sm[1])).fetch(request);
    }

    const m = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{5})\/ws$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket' }, 426);
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(request);
    }

    if (url.pathname === '/') return json({ ok: true, service: 'poker-live' });
    return json({ error: 'Not found' }, 404);
  },
};
