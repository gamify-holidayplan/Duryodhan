// Fuzz test for shared/poker-engine.js: random players doing random (legal and illegal) things.
// Run: node server/poker/test/engine.test.mjs [hands]
import * as E from '../../../shared/poker-engine.js';
import assert from 'node:assert/strict';

const HANDS = +process.argv[2] || 20000;
const rnd = n => Math.floor(Math.random() * n);
let nextId = 0;
const player = () => ({ id: 'p' + nextId++, name: 'P' + nextId, av: '🐱' });

function totalChips(t) {
  let sum = t.pot;
  for (const s of t.seats) if (s) sum += s.stack + s.bet;
  for (const l of Object.values(t.ledger)) sum += l.cashedOut;
  return sum;
}
const bought = t => Object.values(t.ledger).reduce((a, l) => a + l.bought, 0);

function check(t) {
  assert.equal(totalChips(t), bought(t), 'chips must be conserved');
  for (const s of t.seats) if (s) {
    assert.ok(s.stack >= 0 && s.bet >= 0, 'no negative chips');
    assert.ok(Number.isInteger(s.stack) && Number.isInteger(s.bet), 'whole chips only');
  }
  if (t.phase === 'hand' && !t.await) {
    assert.ok(t.toAct >= 0, 'someone must be to act');
    const s = t.seats[t.toAct];
    assert.ok(s && s.inHand && !s.folded && !s.allIn, 'actor must be live and able to act');
  }
  // nobody can see anyone else's hidden cards
  const viewer = t.seats.find(Boolean);
  if (viewer) {
    const v = E.viewFor(t, viewer.id);
    assert.equal(v.deck, undefined);
    v.seats.forEach((s, i) => { if (s && s.id !== viewer.id && !t.seats[i].show) assert.ok(s.hole.every(c => c === null)); });
  }
  // every card appears at most once
  const seen = new Set();
  for (const c of [...t.board, ...t.deck, ...t.seats.flatMap(s => s ? s.hole : [])]) { assert.ok(!seen.has(c), 'duplicate card'); seen.add(c); }
}

const t = E.newTable({ sb: 10, bb: 20, stack: 1000, turnSecs: 20 });
for (let i = 0; i < 4; i++) E.sitDown(t, i, player());
let hands = 0, steps = 0, showdowns = 0, sidePotHands = 0, splits = 0;
E.startHand(t);
while (hands < HANDS) {
  steps++;
  assert.ok(steps < HANDS * 400, 'engine stalled');
  const r = Math.random();
  // table churn: people joining, leaving, rebuying, sitting out
  if (r < 0.01) { const free = t.seats.findIndex(s => !s); if (free >= 0) E.sitDown(t, free, player()); }
  else if (r < 0.015) { const i = rnd(6); if (t.seats[i]) E.standUp(t, i); }
  else if (r < 0.02) { const i = rnd(6); if (t.seats[i]) E.rebuy(t, i); }
  else if (r < 0.022) { const i = rnd(6); if (t.seats[i]) E.forceFold(t, i); }
  else if (r < 0.025) { const i = rnd(6); if (t.seats[i]) t.seats[i].sitOut = !t.seats[i].sitOut; }
  else if (t.await === 'street') E.nextStreet(t);
  else if (t.await === 'nextHand' || t.phase === 'waiting') {
    if (t.result) {
      if (t.result.hands) showdowns++;
      if (t.result.winners.length > 1) splits++;
    }
    hands++;
    // keep the table populated so hands keep happening
    for (let i = 0; i < 6; i++) if (t.seats[i] && t.seats[i].stack === 0 && Math.random() < 0.7) E.rebuy(t, i);
    if (t.seats.filter(Boolean).length < 3) { const free = t.seats.findIndex(s => !s); if (free >= 0) E.sitDown(t, free, player()); }
    if (t.seats.filter(s => s && !s.sitOut).length < 2) t.seats.forEach(s => { if (s) s.sitOut = false; });
    E.startHand(t);
    if (t.phase === 'hand' && t.seats.filter(s => s && s.inHand).length >= 3 && t.seats.some(s => s && s.allIn)) sidePotHands++;
  } else if (t.phase === 'hand' && t.toAct >= 0) {
    const i = t.toAct, L = E.legal(t, i);
    const x = Math.random();
    let a;
    if (x < 0.15) a = { type: 'fold' };
    else if (x < 0.5) a = { type: L.canCheck ? 'check' : 'call' };
    else if (x < 0.85) a = { type: 'raise', to: L.minTo + rnd(Math.max(1, (L.maxTo - L.minTo) / 3)) };
    else if (x < 0.9) a = { type: 'raise', to: L.maxTo };
    else if (x < 0.95) a = { type: 'check' };                      // possibly illegal
    else a = { type: 'raise', to: ['abc', -5, 1e12, null][rnd(4)] }; // junk input
    const before = totalChips(t);
    const err = E.act(t, i, a);
    if (err) assert.equal(totalChips(t), before, 'a rejected action must not move chips');
    // someone else acting out of turn must be rejected
    const other = (i + 1 + rnd(5)) % 6;
    if (t.toAct !== other && t.seats[other]) assert.ok(E.act(t, other, { type: 'call' }), 'out-of-turn action must be rejected');
  }
  check(t);
}

// a few hand-picked situations
{
  // three-way all-in with side pots: A 100, B 300, C 300 (C folds at the end is impossible once all-in, so check payouts)
  const t2 = E.newTable({ sb: 5, bb: 10, stack: 1000, turnSecs: 20 });
  E.sitDown(t2, 0, { id: 'a', name: 'A' }); E.sitDown(t2, 1, { id: 'b', name: 'B' }); E.sitDown(t2, 2, { id: 'c', name: 'C' });
  t2.seats[0].stack = 100; t2.seats[1].stack = 300; t2.seats[2].stack = 300;
  t2.ledger.a.bought = 100; t2.ledger.b.bought = 300; t2.ledger.c.bought = 300;
  E.startHand(t2);
  while (t2.phase === 'hand') {
    if (t2.await) { E.nextStreet(t2); continue; }
    const L = E.legal(t2, t2.toAct);
    E.act(t2, t2.toAct, L.canRaise ? { type: 'raise', to: L.maxTo } : { type: 'call' });
  }
  check(t2);
  assert.equal(t2.seats.reduce((a, s) => a + (s ? s.stack : 0), 0), 700);
  // whoever has the best hand among all three wins at least the 300 main pot
  console.log('side pot hand:', t2.result.msg, t2.result.winners.map(w => `${t2.seats[w.seat].name}+${w.amount}`).join(' '));
}

console.log(`ok: ${hands} hands, ${steps} steps, ${showdowns} showdowns, ${splits} split pots, ${sidePotHands} hands with 3+ players and an all-in`);
