// One poker table. The Durable Object is the dealer: it owns the deck and the rules, runs the
// turn clock with alarms, and sends every player their own view of the table.
// It also relays WebRTC signalling so players' phones can video-call each other directly.
import { DurableObject } from 'cloudflare:workers';
import * as E from '../../../shared/poker-engine.js';

const STREET_MS = 900, RUNOUT_MS = 1800, NEXT_HAND_MS = 3000, SHOWDOWN_MS = 6000, FIRST_HAND_MS = 2500;
const OFFLINE_TURN_MS = 8000;              // don't make everyone wait out the full clock for someone who left
const IDLE_DELETE_MS = 24 * 3600 * 1000;   // tables nobody has touched for a day are deleted
const MAX_PLAYERS = 40;                    // seated players + spectators who have ever joined
const OPEN = 1;

const clampInt = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
function randomId(bytes) {
  const r = new Uint8Array(bytes);
  crypto.getRandomValues(r);
  return [...r].map(x => x.toString(16).padStart(2, '0')).join('');
}

export class PokerRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new Map();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => { this.d = (await ctx.storage.get('d')) || null; });
  }

  // ---------- creating a table (called by the Worker) ----------
  async init(code, body) {
    if (this.d) return { ok: false };
    body = body || {};
    const bb = clampInt(body.bb, 2, 1000000, 20);
    const settings = {
      sb: Math.max(1, Math.floor(bb / 2)), bb,
      stack: clampInt(body.stack, bb * 20, bb * 1000, bb * 100),
      turnSecs: clampInt(body.turnSecs, 10, 90, 25),
    };
    this.d = {
      code, created: Date.now(), active: Date.now(), hostKey: randomId(16), hostId: null,
      started: false, paused: false, ended: false, timer: null, nextSettings: null,
      players: {}, chat: [], banned: [], table: E.newTable(settings),
    };
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + IDLE_DELETE_MS);
    return { ok: true, hostKey: this.d.hostKey, settings };
  }

  // ---------- connections ----------
  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid: null });
    if (!this.d) {
      server.send(JSON.stringify({ t: 'error', fatal: true, msg: "This table doesn't exist any more. Check the link, or create a new table." }));
      server.close(4004, 'not found');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  sockets(exclude) { return this.ctx.getWebSockets().filter(w => w.readyState === OPEN && w !== exclude); }
  pidOf(ws) { return (ws.deserializeAttachment() || {}).pid; }
  online(pid, exclude) { return this.sockets(exclude).some(w => this.pidOf(w) === pid); }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) {} }
  seatIndex(pid) { return this.d.table.seats.findIndex(s => s && s.id === pid); }

  async webSocketMessage(ws, raw) {
    if (!this.d || typeof raw !== 'string' || raw.length > 20000) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hello') { if (this.allow(ws, 'hello')) await this.hello(ws, m); return; }
    const pid = this.pidOf(ws);
    if (!pid || !this.d.players[pid]) return;
    if (!this.allow(ws, m.t)) return;

    if (m.t === 'rtc') {
      // pass WebRTC offers/answers/candidates to the other player's phone(s)
      for (const w of this.sockets()) if (this.pidOf(w) === m.to) this.send(w, { t: 'rtc', from: pid, data: m.data });
      return;
    }
    if (m.t === 'chat') {
      const text = cleanText(m.text, 140);
      if (!text) return;
      const msg = { id: pid, name: this.d.players[pid].name, text, ts: Date.now() };
      this.d.chat.push(msg);
      if (this.d.chat.length > 40) this.d.chat.shift();
      await this.save();
      for (const w of this.sockets()) this.send(w, { t: 'chat', msg });
      return;
    }
    if (m.t === 'react') {
      const emoji = cleanText(m.emoji, 8);
      if (emoji) for (const w of this.sockets()) this.send(w, { t: 'react', from: pid, to: typeof m.to === 'string' ? m.to : null, emoji });
      return;
    }

    this.d.active = Date.now();
    const err = this.handle(pid, m, ws);
    if (err) this.send(ws, { t: 'error', msg: err });
    await this.commit();
  }

  async hello(ws, m) {
    const id = typeof m.id === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(m.id) ? m.id : null;
    const secret = typeof m.secret === 'string' && m.secret.length >= 16 && m.secret.length <= 64 ? m.secret : null;
    if (!id || !secret) return this.send(ws, { t: 'error', fatal: true, msg: 'Bad join request' });
    const already = this.pidOf(ws);
    if (already && already !== id) return; // one player per connection
    if (this.d.banned.includes(id)) { this.send(ws, { t: 'error', fatal: true, msg: 'The host removed you from this table.' }); ws.close(4003, 'removed'); return; }
    let p = this.d.players[id];
    if (p && p.secret !== secret) return this.send(ws, { t: 'error', fatal: true, msg: 'Could not rejoin, please reload' });
    if (!p) {
      // forget spectators who left, so the list can't fill up with ghosts
      for (const [pid, q] of Object.entries(this.d.players)) {
        if (pid !== this.d.hostId && this.seatIndex(pid) < 0 && !this.online(pid) && !(pid in this.d.table.ledger)) delete this.d.players[pid];
      }
      if (Object.keys(this.d.players).length >= MAX_PLAYERS) return this.send(ws, { t: 'error', fatal: true, msg: 'This table is full' });
      p = this.d.players[id] = { secret, joined: Date.now() };
    }
    p.name = cleanText(m.name, 14) || p.name || 'Player';
    p.av = cleanText(m.av, 8) || p.av || '🙂';
    ws.serializeAttachment({ pid: id });
    this.d.active = Date.now();

    const si = this.seatIndex(id);
    if (si >= 0) {
      const s = this.d.table.seats[si];
      s.name = p.name; s.av = p.av;
      if (s.autoSitOut) { s.sitOut = false; s.autoSitOut = false; } // back after a disconnect
    }
    if (m.hostKey && m.hostKey === this.d.hostKey) this.d.hostId = id;
    else if (!this.d.hostId || (!this.online(this.d.hostId) && si >= 0)) this.d.hostId = id;

    this.send(ws, { t: 'welcome', you: id, code: this.d.code, livekit: await this.liveKit(id, p.name), iceServers: await this.iceServers(), chat: this.d.chat });
    await this.commit();
  }

  async webSocketClose(ws) { await this.gone(ws); try { ws.close(1000, 'bye'); } catch (e) {} }
  async webSocketError(ws) { await this.gone(ws); }
  async gone(ws) {
    this.rate.delete(ws);
    if (!this.d) return;
    const pid = this.pidOf(ws);
    if (!pid || this.online(pid, ws)) return;
    // hand the host controls to someone who is still here
    if (this.d.hostId === pid) {
      const others = this.sockets(ws).map(w => this.pidOf(w)).filter(Boolean);
      const seated = others.find(id => this.seatIndex(id) >= 0);
      if (seated) this.d.hostId = seated;
    }
    await this.commit(ws);
  }

  allow(ws, type) {
    const now = Date.now(), limit = type === 'rtc' ? 300 : type === 'hello' ? 5 : 30;
    const key = type === 'rtc' || type === 'hello' ? type : 'msg';
    let r = this.rate.get(ws);
    if (!r) this.rate.set(ws, r = { rtc: [], msg: [], hello: [] });
    r[key] = r[key].filter(x => now - x < 5000);
    if (r[key].length >= limit) return false;
    r[key].push(now);
    return true;
  }

  // ---------- game actions ----------
  handle(pid, m, ws) {
    const d = this.d, t = d.table, p = d.players[pid], i = this.seatIndex(pid);
    const isHost = d.hostId === pid;
    if (d.ended && m.t !== 'media') return 'This game has ended';
    switch (m.t) {
      case 'sit': {
        if (i >= 0) return 'You already have a seat';
        const err = E.sitDown(t, clampInt(m.seat, 0, E.SEATS - 1, -1), { id: pid, name: p.name, av: p.av });
        return err;
      }
      case 'stand': if (i >= 0) E.standUp(t, i); return null;
      case 'act': {
        if (i < 0) return 'You are not seated';
        const err = E.act(t, i, { type: m.action, to: m.to });
        if (!err) t.seats[i].timeouts = 0;
        return err;
      }
      case 'rebuy': return i < 0 ? 'You are not seated' : E.rebuy(t, i);
      case 'sitout':
        if (i < 0) return 'You are not seated';
        t.seats[i].sitOut = !!m.on; t.seats[i].autoSitOut = false; t.seats[i].timeouts = 0;
        return null;
      case 'show': if (i >= 0) E.showCards(t, i); return null;
      case 'media': p.cam = !!m.cam; p.mic = !!m.mic; return null;

      // host controls
      case 'start':
        if (!isHost) return 'Only the host can start the game';
        if (!E.canStart(t)) return 'At least 2 players need a seat to start';
        d.started = true; d.paused = false;
        return null;
      case 'pause': if (!isHost) return 'Only the host can pause'; d.paused = !!m.on; return null;
      case 'settings': {
        if (!isHost) return 'Only the host can change the blinds';
        const bb = clampInt(m.bb, 2, 1000000, t.settings.bb);
        d.nextSettings = {
          sb: Math.max(1, Math.floor(bb / 2)), bb,
          stack: clampInt(m.stack, bb * 20, bb * 1000, t.settings.stack),
          turnSecs: clampInt(m.turnSecs, 10, 90, t.settings.turnSecs),
        };
        if (t.phase !== 'hand') this.applySettings();
        return null;
      }
      case 'kick': {
        if (!isHost) return 'Only the host can remove players';
        if (m.id === pid || !d.players[m.id]) return null;
        const k = this.seatIndex(m.id);
        if (k >= 0) E.standUp(t, k);
        d.banned.push(m.id);
        for (const w of this.sockets()) if (this.pidOf(w) === m.id) {
          this.send(w, { t: 'error', fatal: true, msg: 'The host removed you from this table.' });
          w.close(4003, 'removed');
        }
        return null;
      }
      case 'end':
        if (!isHost) return 'Only the host can end the game';
        if (t.phase === 'hand') d.endAfterHand = true; else d.ended = true;
        return null;
    }
    return null;
  }

  applySettings() {
    if (!this.d.nextSettings) return;
    Object.assign(this.d.table.settings, this.d.nextSettings);
    this.d.nextSettings = null;
  }

  // ---------- clock ----------
  turnKey(t) { return `${t.handNo}|${t.board.length}|${t.toAct}|${t.curBet}|${t.acted.length}`; }

  nextTimer() {
    const d = this.d, t = d.table, now = Date.now(), cur = d.timer;
    if (d.ended) return null;
    if (t.phase === 'hand' && t.await === 'street') {
      return cur && cur.type === 'street' && cur.hand === t.handNo && cur.board === t.board.length ? cur
        : { type: 'street', hand: t.handNo, board: t.board.length, at: now + (this.runningOut(t) ? RUNOUT_MS : STREET_MS) };
    }
    if (t.phase === 'hand' && t.toAct >= 0) {
      const key = this.turnKey(t);
      if (cur && cur.type === 'turn' && cur.key === key) return cur;
      const s = t.seats[t.toAct];
      const ms = this.online(s.id) ? t.settings.turnSecs * 1000 : OFFLINE_TURN_MS;
      return { type: 'turn', key, seat: t.toAct, hand: t.handNo, at: now + ms, total: ms };
    }
    if (t.phase !== 'hand' && d.started && !d.paused && !d.endAfterHand && this.wouldStart()) {
      if (cur && cur.type === 'deal') return cur;
      const wait = !t.result ? FIRST_HAND_MS : t.result.hands ? SHOWDOWN_MS : NEXT_HAND_MS;
      return { type: 'deal', at: now + wait };
    }
    return null;
  }

  // everyone left is all-in, so the rest of the cards are dealt slowly for drama
  runningOut(t) { return t.runout || t.seats.filter(s => s && s.inHand && !s.folded && !s.allIn).length < 2; }

  // can a hand start once people who are offline are sat out?
  wouldStart() {
    return this.d.table.seats.filter(s => s && s.stack > 0 && !s.leaving && (!s.sitOut || s.autoSitOut) && this.online(s.id)).length >= 2;
  }

  async alarm() {
    if (!this.d) return;
    const now = Date.now(), tm = this.d.timer, t = this.d.table;
    if (tm && tm.at <= now + 50) {
      this.d.timer = null;
      if (tm.type === 'street') E.nextStreet(t);
      else if (tm.type === 'turn' && t.toAct === tm.seat && t.handNo === tm.hand && this.turnKey(t) === tm.key) {
        const s = t.seats[tm.seat];
        E.act(t, tm.seat, { type: E.legal(t, tm.seat).canCheck ? 'check' : 'fold' });
        s.timeouts++;
        const away = !this.online(s.id);
        if (away || s.timeouts >= 2) { s.sitOut = true; s.autoSitOut = away; }
      } else if (tm.type === 'deal') {
        this.applySettings();
        // people who have left don't get dealt in; they're sat back in when they return
        for (const s of t.seats) if (s && !this.online(s.id) && !s.sitOut) { s.sitOut = true; s.autoSitOut = true; }
        E.startHand(t);
      }
      await this.commit();
      return;
    }
    if (!tm && this.sockets().length === 0 && now - this.d.active > IDLE_DELETE_MS) {
      await this.ctx.storage.deleteAll();
      this.d = null;
      return;
    }
    await this.arm();
  }

  async arm() {
    const tm = this.d.timer;
    await this.ctx.storage.setAlarm(tm ? tm.at : Date.now() + IDLE_DELETE_MS);
  }

  async save() { await this.ctx.storage.put('d', this.d); }

  async commit(exclude) {
    if (this.d.table.phase !== 'hand') {
      this.applySettings();
      if (this.d.endAfterHand) { this.d.ended = true; this.d.endAfterHand = false; }
    }
    this.d.timer = this.nextTimer();
    await this.save();
    await this.arm();
    this.broadcast(exclude);
  }

  broadcast(exclude) {
    const d = this.d, t = d.table;
    const sockets = this.sockets(exclude);
    const onlineIds = new Set(sockets.map(w => this.pidOf(w)));
    const base = {
      t: 'state', code: d.code, hostId: d.hostId, started: d.started, paused: d.paused, ended: d.ended, ending: !!d.endAfterHand,
      players: Object.entries(d.players).map(([id, p]) => ({ id, name: p.name, av: p.av, online: onlineIds.has(id), cam: !!p.cam, mic: !!p.mic })),
      timer: d.timer && d.timer.type === 'turn' ? { seat: d.timer.seat, at: d.timer.at, total: d.timer.total } : null,
      nextSettings: d.nextSettings, standings: E.results(t), now: Date.now(),
    };
    for (const w of sockets) this.send(w, { ...base, table: E.viewFor(t, this.pidOf(w)) });
  }

  // ---------- relay servers for video ----------
  // Phones on mobile data usually can't connect to each other directly; a TURN relay passes the video through.
  // Uses Cloudflare's TURN service when TURN_KEY_ID and TURN_KEY_API_TOKEN secrets are set.
  async iceServers() {
    const env = this.env, stun = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return stun;
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 12 * 3600 }),
      });
      if (!res.ok) return stun;
      const j = await res.json();
      const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
      // browsers stall on relay addresses using port 53, so leave those out
      const clean = list.map(x => ({ ...x, urls: [].concat(x.urls || []).filter(u => !/:53(\?|$)/.test(u)) })).filter(x => x.urls.length);
      return clean.length ? clean : stun;
    } catch (e) { return stun; }
  }

  // ---------- optional LiveKit video ----------
  async liveKit(identity, name) {
    const env = this.env;
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
    const enc = new TextEncoder();
    const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const part = obj => b64(enc.encode(JSON.stringify(obj)));
    const now = Math.floor(Date.now() / 1000);
    const head = part({ alg: 'HS256', typ: 'JWT' });
    const body = part({
      iss: env.LIVEKIT_API_KEY, sub: identity, name, nbf: now - 10, exp: now + 8 * 3600,
      video: { room: 'poker-' + this.d.code, roomJoin: true, canPublish: true, canSubscribe: true },
    });
    const key = await crypto.subtle.importKey('raw', enc.encode(env.LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(head + '.' + body)));
    return { url: env.LIVEKIT_URL, token: `${head}.${body}.${b64(sig)}` };
  }
}
