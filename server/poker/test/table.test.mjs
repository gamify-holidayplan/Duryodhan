// End-to-end test against a running server: bot players join one table over WebSockets and play.
// Run: BASE=http://127.0.0.1:8787 node server/poker/test/table.test.mjs [hands]
import * as E from '../../../shared/poker-engine.js';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const HANDS = +process.argv[2] || 12;
const WS = BASE.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

class Bot {
  constructor(code, name, opts = {}) {
    Object.assign(this, { code, name, id: opts.id || rid(), secret: opts.secret || rid() + rid(), hostKey: opts.hostKey, play: opts.play !== false });
    this.state = null; this.errors = []; this.fatal = null; this.rtc = []; this.chat = []; this.violations = [];
  }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`${WS}/api/rooms/${this.code}/ws`);
      this.ws.onopen = () => { this.send({ t: 'hello', id: this.id, secret: this.secret, name: this.name, av: '🤖', hostKey: this.hostKey }); };
      this.ws.onerror = e => rej(e);
      this.ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.t === 'welcome') { this.you = m.you; res(); }
        else if (m.t === 'state') this.onState(m);
        else if (m.t === 'error') { if (m.fatal) this.fatal = m.msg; else this.errors.push(m.msg); if (m.fatal) res(); }
        else if (m.t === 'rtc') this.rtc.push(m);
        else if (m.t === 'chat') this.chat.push(m.msg);
      };
    });
  }
  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.ws.close(); }
  mySeat() { return this.state ? this.state.table.seats.findIndex(s => s && s.id === this.id) : -1; }
  onState(m) {
    this.state = m;
    const t = m.table;
    // privacy: I must never see someone else's hidden cards
    t.seats.forEach(s => { if (s && s.id !== this.id && !s.show && s.hole.some(c => c !== null)) this.violations.push('saw hidden cards'); });
    if (t.deck !== undefined) this.violations.push('deck leaked');
    if (t.phase !== 'hand') {
      const net = m.standings.reduce((a, x) => a + x.net, 0);
      if (net !== 0) this.violations.push(`chips not conserved: net ${net}`);
    }
    const i = this.mySeat();
    if (this.play && i >= 0 && t.phase === 'hand' && t.toAct === i && !t.await && !this.pendingAct) {
      this.pendingAct = true;
      setTimeout(() => {
        this.pendingAct = false;
        const L = E.legal(this.state.table, i), r = Math.random();
        const a = r < 0.12 ? { action: 'fold' } : r < 0.75 ? { action: L.canCheck ? 'check' : 'call' }
          : r < 0.95 ? { action: 'raise', to: L.minTo + Math.floor(Math.random() * Math.max(1, (L.maxTo - L.minTo) / 4)) } : { action: 'raise', to: L.maxTo };
        this.send({ t: 'act', ...a });
      }, 30 + Math.random() * 120);
    }
    // rebuy when broke
    if (i >= 0 && t.seats[i].stack === 0 && t.phase !== 'hand' && !this.rebought) { this.rebought = true; this.send({ t: 'rebuy' }); setTimeout(() => { this.rebought = false; }, 1000); }
  }
}

const waitFor = async (fn, ms, what) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(50); }
  throw new Error('timed out waiting for ' + what);
};

(async () => {
  const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', body: JSON.stringify({ bb: 20, stack: 1000, turnSecs: 10 }) });
  const { code, hostKey } = await res.json();
  log('table', code);

  const bots = [new Bot(code, 'Host', { hostKey })];
  for (let i = 1; i < 6; i++) bots.push(new Bot(code, 'Bot' + i));
  for (const b of bots) await b.connect();
  await waitFor(() => bots.every(b => b.state), 3000, 'state');
  assert.equal(bots[0].state.hostId, bots[0].id, 'creator is host');

  // a non-host can't start; can't start with nobody seated
  bots[1].send({ t: 'start' });
  await waitFor(() => bots[1].errors.length, 2000, 'non-host start rejected');
  bots.forEach((b, i) => b.send({ t: 'sit', seat: i }));
  await waitFor(() => bots.every(b => b.mySeat() >= 0), 3000, 'everyone seated');
  // the same seat can't be taken twice
  const spectator = new Bot(code, 'Watcher', { play: false });
  await spectator.connect();
  spectator.send({ t: 'sit', seat: 2 });
  await waitFor(() => spectator.errors.length, 2000, 'taken seat rejected');

  // chat and WebRTC relay
  bots[2].send({ t: 'chat', text: 'gl <b>all</b>' });
  bots[3].send({ t: 'rtc', to: bots[4].id, data: { sdp: 'x' } });
  await waitFor(() => bots[0].chat.length && bots[4].rtc.length, 2000, 'chat + rtc');
  assert.equal(bots[0].chat[0].text, 'gl ball/b', 'chat is sanitised');
  assert.equal(bots[4].rtc[0].from, bots[3].id);
  assert.equal(bots[5].rtc.length, 0, 'rtc only goes to its target');

  bots[0].send({ t: 'start' });
  const handNo = () => bots[0].state.table.handNo;
  await waitFor(() => handNo() >= 1, 6000, 'first hand');
  log('playing', HANDS, 'hands');

  // someone acting out of turn is rejected
  const t0 = bots[0].state.table;
  const notMe = bots.find(b => b.mySeat() !== t0.toAct && b.mySeat() >= 0);
  const errsBefore = notMe.errors.length;
  notMe.send({ t: 'act', action: 'call' });
  await waitFor(() => notMe.errors.length > errsBefore, 2000, 'out-of-turn rejected');

  await waitFor(() => handNo() >= Math.floor(HANDS / 2), HANDS * 20000, 'half the hands');

  // a player drops mid-hand: the table must carry on, and they get their seat back
  const leaver = bots[3];
  const leaverSeat = leaver.mySeat();
  leaver.close();
  log('Bot3 disconnected at hand', handNo());
  const h = handNo();
  await waitFor(() => handNo() >= h + 2, 60000, 'hands continue without Bot3');
  assert.ok(bots[0].state.table.seats[leaverSeat].sitOut, 'offline player is sat out');
  const back = new Bot(code, 'Bot3', { id: leaver.id, secret: leaver.secret });
  await back.connect();
  bots[3] = back;
  await waitFor(() => back.state && back.mySeat() === leaverSeat && !back.state.table.seats[leaverSeat].sitOut, 3000, 'Bot3 back in seat');
  log('Bot3 reconnected into seat', leaverSeat);

  // an impostor with the right id but wrong secret is turned away
  const impostor = new Bot(code, 'Fake', { id: leaver.id, secret: rid() + rid() });
  await impostor.connect();
  assert.ok(impostor.fatal, 'impostor rejected');

  await waitFor(() => handNo() >= HANDS, HANDS * 20000, 'all hands');

  // host leaves: someone else gets the controls
  bots[0].close();
  await waitFor(() => bots[1].state.hostId !== bots[0].id, 3000, 'host handover');
  log('host passed to', bots[1].state.players.find(p => p.id === bots[1].state.hostId).name);
  const newHost = bots.find(b => b.id === bots[1].state.hostId);

  // kick
  const victim = bots.find(b => b !== newHost && b !== bots[0]);
  newHost.send({ t: 'kick', id: victim.id });
  await waitFor(() => victim.fatal, 3000, 'kick');

  // end the game: standings add up
  newHost.send({ t: 'end' });
  await waitFor(() => newHost.state.ended, 60000, 'end (after the current hand)');
  await waitFor(() => newHost.state.table.phase !== 'hand' || newHost.state.ended, 3000, 'settled');

  const violations = [...bots, spectator].flatMap(b => b.violations);
  assert.deepEqual([...new Set(violations)], [], 'no privacy or chip violations');
  log('standings', newHost.state.standings.map(s => `${s.name} ${s.net >= 0 ? '+' : ''}${s.net}`).join(', '));
  log(`ok: ${handNo()} hands played`);
  for (const b of [...bots, spectator]) try { b.close(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
