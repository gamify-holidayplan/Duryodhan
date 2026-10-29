// No-limit Texas Hold'em table engine, shared by the poker-live server and client.
// Everything here is pure: the table is a plain JSON object, so the server can store it
// as-is and send each player a filtered copy. Nothing in this file touches the network or timers.

export const SEATS = 6;

// ---------- cards & hand evaluation ----------
// A card is 0..51: rank = (c >> 2) + 2 (2..14, ace high), suit = c & 3.
export const SUITS = ['♠', '♥', '♦', '♣'];
const RL = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = r => RL[r] || String(r);
export const cardRank = c => (c >> 2) + 2;
export const cardSuit = c => c & 3;
const RN = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
export const plural = r => r === 6 ? 'Sixes' : RN[r] + 's';

export function shuffledDeck() {
  const d = Array.from({ length: 52 }, (_, i) => i);
  const rnd = new Uint32Array(52);
  globalThis.crypto.getRandomValues(rnd);
  for (let i = 51; i > 0; i--) { const j = rnd[i] % (i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

// score of exactly 5 cards: category * 15^5 + up to five tie-break ranks
function score5(h) {
  const r = h.map(cardRank).sort((a, b) => b - a);
  const s0 = h[0] & 3, flush = h.every(c => (c & 3) === s0);
  const cnt = new Array(15).fill(0);
  for (const x of r) cnt[x]++;
  const groups = [...new Set(r)].sort((a, b) => cnt[b] - cnt[a]); // stable: rank order kept within a count
  let straight = 0;
  if (groups.length === 5) { if (r[0] - r[4] === 4) straight = r[0]; else if (r[0] === 14 && r[1] === 5) straight = 5; }
  const c0 = cnt[groups[0]], c1 = cnt[groups[1]];
  let cat, k;
  if (straight && flush) { cat = 8; k = [straight]; }
  else if (c0 === 4) { cat = 7; k = groups; }
  else if (c0 === 3 && c1 === 2) { cat = 6; k = groups; }
  else if (flush) { cat = 5; k = r; }
  else if (straight) { cat = 4; k = [straight]; }
  else if (c0 === 3) { cat = 3; k = groups; }
  else if (c0 === 2 && c1 === 2) { cat = 2; k = groups; }
  else if (c0 === 2) { cat = 1; k = groups; }
  else { cat = 0; k = r; }
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (k[i] || 0);
  return s;
}

const COMBOS = {};
for (let n = 5; n <= 7; n++) {
  COMBOS[n] = [];
  const pick = (start, acc) => {
    if (acc.length === 5) { COMBOS[n].push(acc); return; }
    for (let i = start; i < n; i++) pick(i + 1, acc.concat(i));
  };
  pick(0, []);
}
export function bestHand(cards) {
  let best = -1, bestIdx = null;
  for (const cb of COMBOS[cards.length]) {
    const s = score5(cb.map(i => cards[i]));
    if (s > best) { best = s; bestIdx = cb; }
  }
  return { score: best, cards: bestIdx.map(i => cards[i]) };
}

export function handName(score) {
  const cat = Math.floor(score / 759375); // 15^5
  let s = score % 759375; const k = [];
  for (let i = 4; i >= 0; i--) { k[i] = s % 15; s = Math.floor(s / 15); }
  switch (cat) {
    case 8: return k[0] === 14 ? 'Royal Flush' : `Straight Flush, ${RN[k[0]]} high`;
    case 7: return `Four ${plural(k[0])}`;
    case 6: return `Full House, ${plural(k[0])} full of ${plural(k[1])}`;
    case 5: return `Flush, ${RN[k[0]]} high`;
    case 4: return `Straight, ${RN[k[0]]} high`;
    case 3: return `Three ${plural(k[0])}`;
    case 2: return `Two Pair, ${plural(k[0])} & ${plural(k[1])}`;
    case 1: return `Pair of ${plural(k[0])}`;
    default: return `${RN[k[0]]} high`;
  }
}

// what to show a player about their own cards
export function handHint(hole, board) {
  if (!hole || hole.length < 2 || hole.includes(null)) return '';
  if (!board.length) {
    const [a, b] = hole.map(cardRank).sort((x, y) => y - x);
    if (a === b) return `Pocket ${plural(a)}`;
    return `${rankLabel(a)}-${rankLabel(b)}${cardSuit(hole[0]) === cardSuit(hole[1]) ? ' suited' : ''}`;
  }
  return handName(bestHand(hole.concat(board)).score);
}

// ---------- table ----------
export function newTable(settings) {
  return {
    settings: { ...settings },   // { sb, bb, stack, turnSecs }
    seats: new Array(SEATS).fill(null),
    phase: 'waiting',            // waiting | hand | between
    handNo: 0, dealer: -1, board: [], deck: [], pot: 0,
    curBet: 0, minRaise: 0, toAct: -1, pending: [], acted: [],
    await: null,                 // 'street' | 'nextHand': the server should call nextStreet / startHand after a pause
    runout: false,               // everyone is all-in, cards are being dealt out
    result: null,                // { msg, winners: [{ seat, amount, hand }], hl: [cards] }
    ledger: {},                  // id -> { name, bought, cashedOut }, for the end-of-game results
  };
}

function freshSeat(p, stack) {
  return { id: p.id, name: p.name, av: p.av, stack, bet: 0, total: 0, hole: [], folded: false, allIn: false,
           inHand: false, act: '', won: 0, show: false, sitOut: false, leaving: false, timeouts: 0 };
}

export function sitDown(t, seat, p) {
  if (seat < 0 || seat >= SEATS || t.seats[seat]) return 'That seat is taken';
  if (t.seats.some(s => s && s.id === p.id)) return 'You already have a seat';
  t.seats[seat] = freshSeat(p, t.settings.stack);
  const l = t.ledger[p.id] || (t.ledger[p.id] = { name: p.name, bought: 0, cashedOut: 0 });
  l.name = p.name; l.bought += t.settings.stack;
  return null;
}

// Leave the table. Mid-hand the player is folded now and removed when the hand ends.
export function standUp(t, seat) {
  const s = t.seats[seat];
  if (!s) return;
  if (t.phase === 'hand' && s.inHand && !s.folded && !s.allIn) forceFold(t, seat); // all-in players keep their share of the pot
  if (t.phase === 'hand' && s.inHand) { s.leaving = true; return; }
  removeSeat(t, seat);
}
function removeSeat(t, seat) {
  const s = t.seats[seat];
  t.ledger[s.id].cashedOut += s.stack;
  t.seats[seat] = null;
}

export function rebuy(t, seat) {
  const s = t.seats[seat];
  if (!s || s.stack > 0 || (t.phase === 'hand' && s.inHand && !s.folded)) return 'You can rebuy once you are out of chips';
  s.stack = t.settings.stack;
  t.ledger[s.id].bought += t.settings.stack;
  return null;
}

const eligible = s => s && s.stack > 0 && !s.sitOut && !s.leaving;
export const canStart = t => t.seats.filter(eligible).length >= 2;
const live = t => t.seats.filter(s => s && s.inHand && !s.folded);
const canAct = t => live(t).filter(s => !s.allIn);
const idx = (t, s) => t.seats.indexOf(s);
function nextIn(t, i) {
  for (let k = 1; k <= SEATS; k++) { const j = (i + k + SEATS) % SEATS; if (t.seats[j] && t.seats[j].inHand) return j; }
  return i;
}
function put(s, amt) {
  s.stack -= amt; s.bet += amt; s.total += amt;
  if (s.stack === 0) s.allIn = true;
}

export function startHand(t) {
  if (!canStart(t)) { t.phase = 'waiting'; t.await = null; return false; }
  const S = t.settings;
  t.handNo++; t.board = []; t.pot = 0; t.result = null; t.runout = false; t.await = null;
  for (const s of t.seats) if (s) Object.assign(s, { bet: 0, total: 0, hole: [], folded: false, allIn: false, act: '', won: 0, show: false, inHand: eligible(s) });
  t.phase = 'hand';
  t.deck = shuffledDeck();
  t.dealer = nextIn(t, t.dealer < 0 ? Math.floor(Math.random() * SEATS) : t.dealer);
  const n = t.seats.filter(s => s && s.inHand).length;
  // heads-up the dealer posts the small blind
  const sb = n === 2 ? t.dealer : nextIn(t, t.dealer), bb = nextIn(t, sb);
  put(t.seats[sb], Math.min(S.sb, t.seats[sb].stack)); t.seats[sb].act = 'SB';
  put(t.seats[bb], Math.min(S.bb, t.seats[bb].stack)); t.seats[bb].act = 'BB';
  t.curBet = S.bb; t.minRaise = S.bb; t.street = 0;
  for (let r = 0; r < 2; r++) for (let k = 1; k <= SEATS; k++) {
    const s = t.seats[(t.dealer + k) % SEATS];
    if (s && s.inHand) s.hole.push(t.deck.pop());
  }
  startRound(t, nextIn(t, bb));
  return true;
}

function startRound(t, first) {
  t.pending = canAct(t).map(s => idx(t, s));
  t.acted = [];
  advance(t, first);
}

// Find the next player who has to act, starting at seat `from`; end the round if nobody does.
function advance(t, from) {
  t.toAct = -1;
  if (live(t).length > 1) {
    for (let k = 0; k < SEATS; k++) {
      const i = (from + k) % SEATS;
      if (!t.pending.includes(i)) continue;
      const s = t.seats[i];
      const others = canAct(t).filter(q => q !== s).length;
      const covered = s.bet >= Math.max(0, ...live(t).filter(q => q !== s).map(q => q.bet));
      if (others === 0 && (t.curBet - s.bet === 0 || covered)) { t.pending = t.pending.filter(x => x !== i); continue; } // nobody left to bet against
      t.toAct = i;
      return;
    }
  }
  endRound(t);
}

export function legal(t, i) {
  const s = t.seats[i];
  const toCall = t.curBet - s.bet;
  const others = canAct(t).filter(q => q !== s).length;
  const maxTo = s.stack + s.bet, minTo = Math.min(t.curBet + t.minRaise, maxTo);
  return { toCall: Math.min(toCall, s.stack), canCheck: toCall === 0, canRaise: !t.acted.includes(i) && s.stack > toCall && others > 0, minTo, maxTo };
}

// action: { type: 'fold' | 'check' | 'call' | 'raise', to }
export function act(t, i, a) {
  if (t.phase !== 'hand' || t.toAct !== i || t.await) return 'Not your turn';
  const s = t.seats[i], L = legal(t, i), toCall = t.curBet - s.bet;
  let type = a && a.type;
  if (type === 'raise' && !L.canRaise) type = 'call';
  if (type === 'check' && toCall > 0) return 'You can\'t check, there is a bet to call';
  if (type === 'call' && toCall === 0) type = 'check';
  if (!['fold', 'check', 'call', 'raise'].includes(type)) return 'Unknown action';
  let raised = null;
  if (type === 'fold') { s.folded = true; s.act = 'Fold'; }
  else if (type === 'check') { s.act = 'Check'; }
  else if (type === 'call') { put(s, Math.min(toCall, s.stack)); s.act = s.allIn ? 'All-in' : 'Call'; }
  else {
    const want = Math.floor(Number(a.to));
    if (!Number.isFinite(want)) return 'Bad raise amount';
    const to = Math.max(L.minTo, Math.min(L.maxTo, want));
    const inc = to - t.curBet, wasOpen = t.curBet === 0;
    put(s, to - s.bet);
    raised = inc >= t.minRaise ? 'full' : 'short';
    if (raised === 'full') t.minRaise = inc;
    t.curBet = to;
    s.act = s.allIn ? 'All-in' : wasOpen ? 'Bet' : 'Raise';
  }
  t.pending = t.pending.filter(x => x !== i);
  if (!t.acted.includes(i)) t.acted.push(i);
  if (raised) {
    // everyone else still in has to respond; a full raise also re-opens raising for them
    for (const q of canAct(t)) { const j = idx(t, q); if (j !== i && q.bet < t.curBet && !t.pending.includes(j)) t.pending.push(j); }
    if (raised === 'full') t.acted = [i];
  }
  advance(t, (i + 1) % SEATS);
  return null;
}

// Fold a player out of turn (they left or were removed).
export function forceFold(t, i) {
  const s = t.seats[i];
  if (t.phase !== 'hand' || !s || !s.inHand || s.folded) return;
  s.folded = true; s.act = 'Fold';
  t.pending = t.pending.filter(x => x !== i);
  if (t.await) return;               // between streets: nextStreet will notice
  if (t.toAct === i) advance(t, (i + 1) % SEATS);
  else if (live(t).length < 2) { t.toAct = -1; endRound(t); }
}

// The part of a bet nobody matched goes straight back to its owner.
function returnUncalled(t) {
  const bets = t.seats.filter(s => s && s.bet > 0).sort((a, b) => b.bet - a.bet);
  if (!bets.length) return;
  const extra = bets[0].bet - (bets[1] ? bets[1].bet : 0);
  if (extra > 0) { const s = bets[0]; s.bet -= extra; s.total -= extra; s.stack += extra; s.allIn = false; }
}
function collect(t) { returnUncalled(t); for (const s of t.seats) if (s) { t.pot += s.bet; s.bet = 0; } }

function endRound(t) {
  t.toAct = -1; t.pending = []; t.acted = [];
  collect(t);
  if (live(t).length < 2 || t.street === 3) { finishHand(t); return; }
  t.await = 'street';
}

// Deal the next street. Called by the server after a short pause.
export function nextStreet(t) {
  if (t.await !== 'street') return;
  t.await = null;
  if (live(t).length < 2) { finishHand(t); return; }
  if (canAct(t).length < 2) { t.runout = true; for (const s of live(t)) s.show = true; }
  t.deck.pop(); // burn
  const count = t.street === 0 ? 3 : 1;
  for (let k = 0; k < count; k++) t.board.push(t.deck.pop());
  t.street++;
  t.curBet = 0; t.minRaise = t.settings.bb;
  for (const s of live(t)) if (!s.allIn) s.act = '';
  if (t.runout) { if (t.street === 3) finishHand(t); else t.await = 'street'; return; }
  startRound(t, nextIn(t, t.dealer));
}

function buildPots(t) {
  const contrib = t.seats.filter(s => s && s.total > 0);
  const levels = [...new Set(contrib.map(s => s.total))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const L of levels) {
    let amt = 0;
    for (const s of contrib) amt += Math.max(0, Math.min(s.total, L) - prev);
    const elig = contrib.filter(s => s.inHand && !s.folded && s.total >= L);
    const last = pots[pots.length - 1];
    if (last && (elig.length === 0 || (elig.length === last.elig.length && elig.every(s => last.elig.includes(s))))) last.amt += amt;
    else pots.push({ amt, elig: elig.length ? elig : live(t) });
    prev = L;
  }
  return pots;
}

function finishHand(t) {
  t.toAct = -1; t.pending = []; t.acted = []; t.await = null;
  collect(t);
  const lv = live(t), pots = buildPots(t);
  const total = pots.reduce((a, p) => a + p.amt, 0);
  if (lv.length === 1) {
    const w = lv[0];
    w.stack += total; w.won = total;
    t.result = { msg: `${w.name} wins ${total.toLocaleString('en-US')}`, winners: [{ seat: idx(t, w), amount: total, hand: '' }], hl: [] };
  } else {
    const hands = new Map(lv.map(s => [s, bestHand(s.hole.concat(t.board))]));
    for (const s of lv) s.show = true;
    const order = []; // clockwise from the dealer, for odd chips
    for (let k = 1; k <= SEATS; k++) { const s = t.seats[(t.dealer + k) % SEATS]; if (s) order.push(s); }
    let main = null;
    for (const pot of pots) {
      let best = -1, ws = [];
      for (const s of pot.elig) {
        const sc = hands.get(s).score;
        if (sc > best) { best = sc; ws = [s]; } else if (sc === best) ws.push(s);
      }
      ws.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const share = Math.floor(pot.amt / ws.length);
      let rem = pot.amt - share * ws.length;
      for (const w of ws) { const amt = share + (rem > 0 ? 1 : 0); rem--; w.stack += amt; w.won += amt; }
      if (!main) main = ws;
    }
    const name = handName(hands.get(main[0]).score);
    const others = t.seats.filter(s => s && s.won > 0 && !main.includes(s));
    t.result = {
      msg: (main.length > 1 ? `Split pot with ${name}` : `${main[0].name} wins ${main[0].won.toLocaleString('en-US')} with ${name}`)
           + (others.length ? ` · side pot to ${others.map(s => s.name).join(' & ')}` : ''),
      winners: t.seats.map((s, i) => s && s.won > 0 ? { seat: i, amount: s.won, hand: s.show ? handName(hands.get(s).score) : '' } : null).filter(Boolean),
      hl: main.flatMap(s => hands.get(s).cards),
      hands: lv.map(s => ({ seat: idx(t, s), hand: handName(hands.get(s).score) })),
    };
  }
  t.pot = 0;
  t.phase = 'between';
  t.await = 'nextHand';
  // players who left mid-hand go now
  t.seats.forEach((s, i) => { if (s && s.leaving) removeSeat(t, i); });
}

// The winner of an uncontested pot may show their cards.
export function showCards(t, i) {
  const s = t.seats[i];
  if (t.phase === 'between' && s && s.hole.length === 2) s.show = true;
}

// A copy of the table safe to send to one player: no deck, and no hidden hole cards.
export function viewFor(t, playerId) {
  const v = { ...t, deck: undefined, ledger: undefined };
  v.seats = t.seats.map(s => {
    if (!s) return null;
    const mine = s.id === playerId;
    const c = { ...s };
    if (!mine && !s.show) c.hole = s.hole.map(() => null);
    return c;
  });
  return v;
}

export function results(t) {
  const out = Object.entries(t.ledger).map(([id, l]) => {
    const seat = t.seats.find(s => s && s.id === id);
    const inPot = seat && t.phase === 'hand' ? seat.total : 0;
    const now = (seat ? seat.stack + inPot : 0) + l.cashedOut;
    return { id, name: l.name, bought: l.bought, net: now - l.bought };
  });
  return out.sort((a, b) => b.net - a.net);
}
