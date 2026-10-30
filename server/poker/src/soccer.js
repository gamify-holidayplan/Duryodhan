// One online Head Soccer match. The room creator's phone runs the physics; this Durable Object
// just seats the two players (side 0 = host, side 1 = guest) and relays messages between them.
import { DurableObject } from 'cloudflare:workers';

const OPEN = 1;
const IDLE_DELETE_MS = 6 * 3600 * 1000;   // rooms nobody has used for 6 hours are deleted
const MAX_MSG = 60000;                    // big enough for a small selfie, too small for anything else
const MAX_PER_SEC = 120;
const RELAY = new Set(['in', 'st', 'start']);

const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const cleanFace = v => typeof v === 'string' && v.length < 50000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;

export class SoccerRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new Map();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => { this.d = (await ctx.storage.get('d')) || null; });
  }

  async init(code) {
    if (this.d) return { ok: false };
    this.d = { code, created: Date.now(), active: Date.now(), seats: [null, null] };
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + IDLE_DELETE_MS);
    return { ok: true };
  }
  async save() { await this.ctx.storage.put('d', this.d); }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ side: null });
    if (!this.d) {
      server.send(JSON.stringify({ t: 'error', fatal: true, msg: "This room doesn't exist. Check the code, or create a new room." }));
      server.close(4004, 'not found');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  sideOf(ws) { return (ws.deserializeAttachment() || {}).side; }
  socketFor(side, except) { return this.ctx.getWebSockets().find(w => w.readyState === OPEN && w !== except && this.sideOf(w) === side); }
  send(ws, m) { try { ws.send(typeof m === 'string' ? m : JSON.stringify(m)); } catch (e) {} }
  players(leaving) {
    const seats = this.d.seats.map((s, i) => s && { name: s.name, head: s.head, online: !!this.socketFor(i, leaving) });
    for (const w of this.ctx.getWebSockets()) if (w.readyState === OPEN && w !== leaving) this.send(w, { t: 'players', seats });
  }
  limited(ws) {
    const now = Math.floor(Date.now() / 1000), r = this.rate.get(ws);
    if (!r || r.s !== now) { this.rate.set(ws, { s: now, n: 1 }); return false; }
    return ++r.n > MAX_PER_SEC;
  }

  async webSocketMessage(ws, raw) {
    if (!this.d || typeof raw !== 'string' || raw.length > MAX_MSG || this.limited(ws)) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const side = this.sideOf(ws);

    if (m.t === 'hello') {
      const pid = cleanText(m.pid, 40);
      if (!pid) return;
      // same player reconnecting gets their seat back, otherwise take a free seat
      let s = this.d.seats.findIndex(x => x && x.pid === pid);
      if (s < 0) s = this.d.seats.findIndex(x => !x);
      if (s < 0 && !this.socketFor(1)) s = 1;   // the guest seat can be taken over once its player has left
      if (s < 0) { this.send(ws, { t: 'error', fatal: true, msg: 'This room already has two players.' }); ws.close(4003, 'full'); return; }
      const old = this.socketFor(s, ws);
      if (old) { this.send(old, { t: 'error', fatal: true, msg: 'You joined this room from another tab.' }); old.close(4001, 'replaced'); }
      this.d.seats[s] = { pid, name: cleanText(m.name, 20) || (s ? 'Guest' : 'Host'), head: cleanText(m.head, 20) || 'classic', face: cleanFace(m.face) };
      this.d.active = Date.now(); await this.save();
      ws.serializeAttachment({ side: s });
      this.send(ws, { t: 'welcome', side: s, code: this.d.code });
      // swap selfies so each phone can draw the other player's face
      const other = this.d.seats[1 - s], otherWs = this.socketFor(1 - s);
      if (other && other.face) this.send(ws, { t: 'face', side: 1 - s, data: other.face });
      if (otherWs && this.d.seats[s].face) this.send(otherWs, { t: 'face', side: s, data: this.d.seats[s].face });
      this.players();
      return;
    }
    if (side == null) return;
    if (RELAY.has(m.t)) {
      const other = this.socketFor(1 - side);
      if (other) this.send(other, raw);
      if (m.t === 'start') { this.d.active = Date.now(); await this.save(); }
    }
  }

  async webSocketClose(ws) { this.rate.delete(ws); this.players(ws); try { ws.close(1000, 'bye'); } catch (e) {} }
  async webSocketError(ws) { this.rate.delete(ws); this.players(ws); }

  async alarm() {
    if (!this.d) return;
    const live = this.ctx.getWebSockets().some(w => w.readyState === OPEN);
    if (!live && Date.now() - this.d.active > IDLE_DELETE_MS) { await this.ctx.storage.deleteAll(); this.d = null; return; }
    await this.ctx.storage.setAlarm(Date.now() + IDLE_DELETE_MS);
  }
}
