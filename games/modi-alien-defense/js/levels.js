'use strict';
/* ===========================================================
   Level definitions, procedural level builder, and parallax
   cartoon backgrounds for each famous location
   =========================================================== */

const THEMES = {
  delhi: {
    sky: ['#287ed8', '#fce8cc'], grass: false, bricks: true,
    groundTop: '#d89e5a', groundTop2: '#ba803f', groundFill: '#7a3f22', groundDot: '#5e2e17',
    ledge: '#d48842', ledgeDark: '#935824', block: '#ad4b3b', blockDark: '#782b20', spikes: '#ff5522',
  },
  dc: null, // aliased to delhi below
  ny: {
    sky: ['#4a2f7f', '#ff9a5a'], grass: false, bricks: false,
    groundTop: '#c4bfb7', groundTop2: '#9d978f', groundFill: '#4f4d55', groundDot: '#3d3b42',
    ledge: '#e0603a', ledgeDark: '#9c3a1d', block: '#7b8496', blockDark: '#4f566a', spikes: '#2fffb0',
  },
  london: {
    sky: ['#141b3d', '#6f7fb3'], grass: false, bricks: true,
    groundTop: '#8a8693', groundTop2: '#6a6672', groundFill: '#45414d', groundDot: '#5a5664',
    ledge: '#a39cb3', ledgeDark: '#6e6880', block: '#8b4a3c', blockDark: '#5e2e24', spikes: '#ff4b8a',
  },
};
THEMES.dc = THEMES.delhi;

const LEVEL_DEFS = [
  {
    name: 'New Delhi', sub: 'Capital of India', theme: 'delhi', song: 'dc', seed: 1776,
    length: 6000, diff: 1.0, ufoEvery: 2300,
    enemies: { grunt: 3, flyer: 1.2 },
    chunks: { flat: 3, gap: 2, platforms: 3, pillar: 2, spikes: 1 },
    weapons: [[0.28, 'triple'], [0.68, 'cannon']],
    boss: 'overlord',
    intro: 'Mitron! No aliens allowed in New Delhi!',
    tip: 'Defeat the invasion and hoist the Tiranga at the Red Fort!',
  },
  {
    name: 'New York City', sub: 'The Big Apple', theme: 'ny', song: 'ny', seed: 1624,
    length: 7400, diff: 1.3, ufoEvery: 1600,
    enemies: { grunt: 3, flyer: 2, brute: 1.2 },
    chunks: { flat: 2, gap: 3, platforms: 3, pillar: 2, spikes: 2, moving: 2 },
    weapons: [[0.15, 'triple'], [0.3, 'cannon'], [0.5, 'plasma']],
    boss: 'mothership',
    intro: 'Not in my Big Apple, you little green men!',
    tip: 'New: armored Brutes and hover platforms. Watch for the Mothership beam!',
  },
  {
    name: 'London', sub: 'United Kingdom', theme: 'london', song: 'london', seed: 1066,
    length: 8600, diff: 1.6, ufoEvery: 1250,
    enemies: { grunt: 2.5, flyer: 2, brute: 1.5, hopper: 2 },
    chunks: { flat: 2, gap: 3, platforms: 3, pillar: 2, spikes: 2, moving: 3, pitledges: 2 },
    weapons: [[0.12, 'cannon'], [0.3, 'plasma']],
    boss: 'mecha',
    intro: "Time to show these aliens our special relationship!",
    tip: 'New: leaping Hoppers. Jump over Mecha-Zorg\'s shockwaves!',
  },
];

function buildLevel(idx) {
  const def = LEVEL_DEFS[idx];
  const rng = mulberry32(def.seed);
  const r = (a, b) => a + rng() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const G = GROUND_Y;
  const L = {
    def, idx, theme: THEMES[def.theme], platforms: [], enemies: [], items: [], hazards: [],
    totalRupeeCoins: 0,
    get totalCoins() { return this.totalRupeeCoins; },
    set totalCoins(v) { this.totalRupeeCoins = v; }
  };

  const ground = (x, w) => L.platforms.push(new Platform(x, G, w, 140, 'ground'));
  const ledge = (x, y, w) => L.platforms.push(new Platform(x, y, w, 16, 'ledge'));
  const block = (x, w, h) => L.platforms.push(new Platform(x, G - h, w, h, 'block'));
  const coin = (x, y) => { L.items.push(new Item(x, y, 'coin')); L.totalRupeeCoins++; };
  const coinRow = (x, y, n, sp = 34) => { for (let i = 0; i < n; i++) coin(x + i * sp, y); };
  const coinArc = (x1, x2, y, n, h = 90) => { for (let i = 0; i < n; i++) { const t = i / (n - 1); coin(lerp(x1, x2, t), y - Math.sin(t * Math.PI) * h); } };
  const spawn = (type, x, y) => {
    const e = createEnemy(type, x, 0, def.diff);
    e.y = y !== undefined ? y : G - e.h;
    L.enemies.push(e); return e;
  };
  const spawnRandom = (x, groundY = G) => {
    const type = weightedPick(def.enemies, rng);
    if (type === 'flyer') spawn('flyer', x, ri(110, 170));
    else { const e = spawn(type, x); e.y = groundY - e.h; }
  };
  const extraEnemies = (x0, x1) => {
    let n = 1 + (rng() < (def.diff - 0.75) ? 1 : 0);
    for (let i = 0; i < n; i++) spawnRandom(lerp(x0, x1, (i + 0.5) / n));
  };

  // safe start
  ground(0, 820);
  coinRow(330, G - 60, 4);
  let x = 820;
  let lastEnergy = 300, lastHealth = 0, lastUfo = 0;
  const weaponsLeft = def.weapons.slice();

  while (x < def.length) {
    const type = weightedPick(def.chunks, rng);
    const sx = x;
    let spot = null; // ground spot for power-ups
    switch (type) {
      case 'flat': {
        const w = ri(480, 700); ground(x, w);
        coinRow(x + 80, G - 60, ri(3, 5));
        extraEnemies(x + 250, x + w - 60);
        spot = x + w - 80; x += w; break;
      }
      case 'gap': {
        const gw = ri(90, 120) + def.diff * 18;
        coinArc(x - 20, x + gw + 20, G - 70, 5, 80);
        x += gw;
        const w = ri(320, 420); ground(x, w);
        if (rng() < 0.5) spawnRandom(x + w - 100);
        spot = x + 60; x += w; break;
      }
      case 'platforms': {
        const w = 820; ground(x, w);
        ledge(x + 110, G - 115, 170); coinRow(x + 145, G - 145, 3);
        ledge(x + 330, G - 225, 170); coinRow(x + 365, G - 255, 3);
        ledge(x + 560, G - 115, 170); coinRow(x + 595, G - 145, 3);
        spawnRandom(x + 640);
        if (rng() < 0.5) { const e = spawn('grunt', x + 400); e.y = G - 225 - e.h; }
        if (sx - lastEnergy > 900) { L.items.push(new Item(x + 415, G - 255 - 30, 'energy')); lastEnergy = sx; }
        spot = x + 60; x += w; break;
      }
      case 'pillar': {
        const w = 620; ground(x, w);
        const bh = ri(70, 110);
        block(x + 260, 64, bh); coinRow(x + 275, G - bh - 30, 2);
        if (rng() < 0.4) block(x + 324, 64, Math.max(50, bh - 45));
        spawnRandom(x + 500);
        spot = x + 120; x += w; break;
      }
      case 'spikes': {
        const w = 640; ground(x, w);
        const sw = ri(110, 150) + Math.round(def.diff * 10);
        L.hazards.push(new Hazard(x + 220, sw));
        ledge(x + 190, G - 125, sw + 60); coinRow(x + 210, G - 155, Math.floor((sw + 40) / 34));
        spawnRandom(x + 560);
        spot = x + 100; x += w; break;
      }
      case 'moving': {
        const pit = 380;
        L.platforms.push(new Platform(x + 130, G - 30, 120, 18, 'moving', { rangeX: 95, speed: 0.018 + def.diff * 0.004, phase: rng() * TAU }));
        coinArc(x + 60, x + pit - 60, G - 80, 5, 70);
        if (rng() < 0.6) spawn('flyer', x + pit / 2, 130);
        x += pit;
        const w = ri(320, 420); ground(x, w);
        spot = x + 80; x += w; break;
      }
      case 'pitledges': {
        const pit = 360;
        ledge(x + 70, G - 70, 90); ledge(x + 210, G - 110, 90);
        coin(x + 115, G - 100); coin(x + 255, G - 140);
        spawn('flyer', x + 200, 120);
        x += pit;
        const w = ri(320, 420); ground(x, w);
        spot = x + 80; x += w; break;
      }
    }
    // power-ups
    if (spot !== null) {
      if (weaponsLeft.length && sx > weaponsLeft[0][0] * def.length) L.items.push(new Item(spot, G - 40, 'weapon', weaponsLeft.shift()[1]));
      else if (sx - lastEnergy > 1100) { L.items.push(new Item(spot, G - 40, 'energy')); lastEnergy = sx; }
      else if (sx - lastHealth > 2100) { L.items.push(new Item(spot, G - 40, 'health')); lastHealth = sx; }
    }
    if (x - lastUfo > def.ufoEvery && x > 1500) { spawn('ufo', x, ri(70, 100)); lastUfo = x; }
  }

  // pre-arena supplies
  L.items.push(new Item(x - 200, G - 40, 'energy'));
  L.items.push(new Item(x - 130, G - 40, 'health'));

  // boss arena
  L.arenaStart = x;
  ground(x, W + 200);
  ledge(x + 130, G - 125, 150);
  ledge(x + W - 280, G - 125, 150);
  ledge(x + W / 2 - 80, G - 230, 160);
  L.arenaEnd = x + W;
  L.width = x + W;
  L.flag = new Flag(x + W - 90);
  return L;
}

/* ===========================================================
   Backgrounds
   =========================================================== */
function repeatLayer(camX, par, spacing, offset, fn) {
  const shift = camX * par;
  const k0 = Math.floor((shift - offset - 700) / spacing);
  const k1 = Math.ceil((shift - offset + W + 700) / spacing);
  for (let k = k0; k <= k1; k++) fn(k * spacing + offset - shift, k);
}
const seeded = k => mulberry32((k * 2654435761) >>> 0);

function drawCloud(ctx, x, y, s, fill = '#ffffff') {
  drawBlob(ctx, [[x, y, 22 * s], [x + 26 * s, y - 12 * s, 26 * s], [x + 56 * s, y, 22 * s], [x + 28 * s, y + 6 * s, 20 * s]], fill, 3);
}
function drawTree(ctx, x, b, s, c = '#4caf3c') {
  drawRRect(ctx, x - 5 * s, b - 30 * s, 10 * s, 30 * s, 3, '#7a4a24', 2.5);
  drawBlob(ctx, [[x, b - 48 * s, 22 * s], [x - 16 * s, b - 34 * s, 16 * s], [x + 16 * s, b - 34 * s, 16 * s]], c, 3);
}
const drawUSFlag = drawIndianFlag;

/* ---------- New Delhi Landmarks & Street Elements ---------- */
function drawQutubMinar(ctx, x, b) {
  const cRed = '#aa3f2d', cLight = '#de8e75';
  // Base plinth
  drawRRect(ctx, x - 26, b - 12, 52, 12, 2, '#882b1d', 3);
  // Storey 1 (0 to 110)
  drawPoly(ctx, [x - 20, b - 12, x + 20, b - 12, x + 16, b - 120, x - 16, b - 120], cRed, 3);
  for (let i = -14; i <= 14; i += 7) {
    drawLine(ctx, x + i, b - 14, x + i * 0.8, b - 118, 'rgba(0,0,0,0.25)', 2);
  }
  // Balcony 1
  drawRRect(ctx, x - 21, b - 128, 42, 8, 2, '#731e13', 2.5);
  // Storey 2 (128 to 195)
  drawPoly(ctx, [x - 16, b - 128, x + 16, b - 128, x + 13, b - 195, x - 13, b - 195], cLight, 3);
  // Balcony 2
  drawRRect(ctx, x - 17, b - 202, 34, 7, 2, '#731e13', 2.5);
  // Storey 3 (202 to 255)
  drawPoly(ctx, [x - 13, b - 202, x + 13, b - 202, x + 10, b - 255, x - 10, b - 255], cRed, 3);
  // Balcony 3
  drawRRect(ctx, x - 13, b - 261, 26, 6, 2, '#731e13', 2.5);
  // Storey 4 & 5 (261 to 310)
  drawPoly(ctx, [x - 10, b - 261, x + 10, b - 261, x + 7, b - 310, x - 7, b - 310], '#f0eae1', 3);
  // Top cupola
  drawPoly(ctx, [x - 6, b - 310, x + 6, b - 310, x, b - 326], cRed, 2.5);
  drawLine(ctx, x, b - 326, x, b - 338, OUTLINE, 2);
  drawCircle(ctx, x, b - 340, 2.5, '#ffcc33', 1.5);
}

const drawMonument = drawQutubMinar;

function drawIndiaGate(ctx, x, b) {
  const cArch = '#d99c64', cDark = '#b57945';
  drawRRect(ctx, x - 70, b - 14, 140, 14, 2, '#935d2f', 3);
  drawRRect(ctx, x - 64, b - 180, 128, 166, 3, cArch, 3.5);
  drawRRect(ctx, x - 72, b - 196, 144, 16, 2, cDark, 3);
  drawRRect(ctx, x - 54, b - 216, 108, 20, 2, cArch, 2.8);
  drawRRect(ctx, x - 40, b - 228, 80, 12, 2, cDark, 2.5);
  drawEllipse(ctx, x, b - 232, 24, 6, '#dfab78', 2);
  // Central archway
  ctx.beginPath();
  ctx.moveTo(x - 28, b - 14);
  ctx.lineTo(x - 28, b - 110);
  ctx.arc(x, b - 110, 28, Math.PI, 0);
  ctx.lineTo(x + 28, b - 14);
  ctx.closePath();
  fillStroke(ctx, '#3d2516', 3.5);
  // Amar Jawan Jyoti flame glow
  ctx.save();
  ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 18;
  drawPoly(ctx, [x - 6, b - 16, x + 6, b - 16, x, b - 36], '#ffcc33', 0);
  ctx.restore();
}

function drawRedFort(ctx, x, b, t) {
  const cRed = '#a83c2e', cDark = '#7f261a', cTrim = '#f3ede2';
  // Ramparts foundation
  drawRRect(ctx, x - 230, b - 100, 460, 100, 2, cRed, 3.5);
  // Kangura battlements
  for (let i = x - 226; i < x + 226; i += 14) {
    drawPoly(ctx, [i, b - 100, i + 3, b - 109, i + 8, b - 109, i + 11, b - 100], cRed, 2);
  }
  // Lahori Gate (Grand Portal)
  drawRRect(ctx, x - 95, b - 138, 190, 138, 3, cDark, 3.5);
  drawRRect(ctx, x - 102, b - 148, 204, 12, 2, cRed, 3);
  ctx.fillStyle = cTrim; ctx.fillRect(x - 90, b - 116, 180, 5);
  // Grand pointed Mughal archway
  ctx.beginPath();
  ctx.moveTo(x - 34, b);
  ctx.lineTo(x - 34, b - 65);
  ctx.quadraticCurveTo(x - 34, b - 96, x, b - 108);
  ctx.quadraticCurveTo(x + 34, b - 96, x + 34, b - 65);
  ctx.lineTo(x + 34, b);
  ctx.closePath();
  fillStroke(ctx, '#300a06', 3.5);
  drawRRect(ctx, x - 18, b - 44, 36, 44, 10, '#150302', 2.5);
  // Flanking octagonal towers with white marble chhatris
  for (const s of [-1, 1]) {
    const tx = x + s * 80;
    drawRRect(ctx, tx - 18, b - 162, 36, 62, 2, cRed, 3);
    for (let p = -14; p <= 14; p += 9) {
      drawRRect(ctx, tx + p - 1.5, b - 184, 3, 24, 1, cTrim, 1.5);
    }
    ctx.beginPath();
    ctx.arc(tx, b - 184, 18, Math.PI, 0);
    ctx.closePath();
    fillStroke(ctx, cTrim, 2.5);
    drawLine(ctx, tx, b - 202, tx, b - 212, OUTLINE, 2);
    drawCircle(ctx, tx, b - 214, 2.5, '#ffcc33', 1.5);
  }
  // Row of 7 decorative mini-chhatris on gate roofline
  for (let i = 0; i < 7; i++) {
    const mx = x - 42 + i * 14;
    drawRRect(ctx, mx - 4, b - 156, 8, 8, 1, cTrim, 1.5);
    drawPoly(ctx, [mx - 5, b - 156, mx + 5, b - 156, mx, b - 164], cRed, 1.5);
  }
  // Central flagpole with Indian Flag (Tiranga)
  drawLine(ctx, x, b - 148, x, b - 214, OUTLINE, 3);
  drawIndianFlag(ctx, x + 2, b - 213, 44, 28, t);
}

const drawWhiteHouse = drawRedFort;

/* Delhi Police Barricade */
function drawPoliceBarricade(ctx, x, b) {
  const w = 72, h = 42;
  drawLine(ctx, x + 10, b - 4, x + 10, b - h + 6, OUTLINE, 3);
  drawLine(ctx, x + w - 10, b - 4, x + w - 10, b - h + 6, OUTLINE, 3);
  drawPoly(ctx, [x + 2, b - 4, x + 10, b - 22, x + 18, b - 4], '#fcd116', 2.5);
  drawPoly(ctx, [x + w - 18, b - 4, x + w - 10, b - 22, x + w - 2, b - 4], '#fcd116', 2.5);
  drawCircle(ctx, x + 4, b - 3, 3, '#222', 1.5);
  drawCircle(ctx, x + 16, b - 3, 3, '#222', 1.5);
  drawCircle(ctx, x + w - 16, b - 3, 3, '#222', 1.5);
  drawCircle(ctx, x + w - 4, b - 3, 3, '#222', 1.5);
  drawRRect(ctx, x + 4, b - h, w - 8, h - 8, 4, '#fcd116', 3);
  drawRRect(ctx, x + 10, b - h + 7, w - 20, 16, 2, '#d82828', 2);
  ctx.save();
  ctx.beginPath();
  pathRoundRect(ctx, x + 10, b - h + 7, w - 20, 16, 2);
  ctx.clip();
  for (let i = -10; i < w; i += 12) {
    ctx.strokeStyle = '#fcd116'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + i, b - h + 24); ctx.lineTo(x + i + 10, b - h + 6); ctx.stroke();
  }
  ctx.restore();
  plainText(ctx, 'DELHI POLICE', x + w / 2, b - h + 15, 7, '#ffffff', 'center', '900');
  for (let i = x + 16; i < x + w - 14; i += 8) {
    drawLine(ctx, i, b - h + 23, i, b - 8, '#777', 1.2);
  }
}

/* Classic Indian Auto-Rickshaw */
function drawAutoRickshaw(ctx, x, b) {
  drawCircle(ctx, x + 18, b - 8, 8, '#222', 3);
  drawCircle(ctx, x + 18, b - 8, 3, '#aaa', 0);
  drawCircle(ctx, x + 66, b - 8, 8, '#222', 3);
  drawCircle(ctx, x + 66, b - 8, 3, '#aaa', 0);
  drawRRect(ctx, x + 6, b - 32, 54, 22, 4, '#15803d', 3);
  drawPoly(ctx, [x + 4, b - 32, x + 10, b - 50, x + 58, b - 50, x + 72, b - 32, x + 66, b - 32, x + 56, b - 46, x + 8, b - 46], '#ffca18', 2.8);
  drawRRect(ctx, x + 6, b - 51, 56, 7, 3, '#ffca18', 2.5);
  drawLine(ctx, x + 10, b - 46, x + 10, b - 32, OUTLINE, 2.5);
  drawLine(ctx, x + 38, b - 46, x + 38, b - 32, OUTLINE, 2.5);
  drawRRect(ctx, x + 12, b - 44, 24, 6, 2, '#2b2b2b', 1.5);
  drawPoly(ctx, [x + 58, b - 46, x + 70, b - 32, x + 60, b - 32, x + 52, b - 46], 'rgba(180,230,255,0.7)', 2);
  drawPoly(ctx, [x + 60, b - 32, x + 74, b - 32, x + 72, b - 16, x + 60, b - 20], '#ffca18', 2.5);
  drawCircle(ctx, x + 73, b - 24, 4, '#fff8c2', 1.8);
  drawLine(ctx, x + 54, b - 28, x + 58, b - 30, '#111', 2);
}

/* Indian Street Food / Chai Stall */
function drawChaiStall(ctx, x, b) {
  const w = 74, h = 56;
  drawCircle(ctx, x + 18, b - 9, 9, '#5a3418', 2.5);
  drawCircle(ctx, x + w - 18, b - 9, 9, '#5a3418', 2.5);
  for (let a = 0; a < 4; a++) {
    const ang = a * Math.PI / 4;
    drawLine(ctx, x + 18 + Math.cos(ang) * 8, b - 9 + Math.sin(ang) * 8, x + 18 - Math.cos(ang) * 8, b - 9 - Math.sin(ang) * 8, '#5a3418', 1.5);
    drawLine(ctx, x + w - 18 + Math.cos(ang) * 8, b - 9 + Math.sin(ang) * 8, x + w - 18 - Math.cos(ang) * 8, b - 9 - Math.sin(ang) * 8, '#5a3418', 1.5);
  }
  drawRRect(ctx, x + 4, b - 26, w - 8, 16, 2, '#8b5329', 2.5);
  drawLine(ctx, x + 6, b - 18, x + w - 6, b - 18, '#633917', 2);
  drawLine(ctx, x + 8, b - 26, x + 8, b - h, OUTLINE, 2);
  drawLine(ctx, x + w - 8, b - 26, x + w - 8, b - h, OUTLINE, 2);
  const sw = (w + 4) / 5;
  for (let i = 0; i < 5; i++) {
    drawRRect(ctx, x - 2 + i * sw, b - h - 4, sw + 0.5, 9, 1, i % 2 === 0 ? '#ff9933' : '#ffffff', 1.8);
  }
  // Brass samovar / kettle
  drawRRect(ctx, x + 16, b - 38, 12, 12, 3, '#d4af37', 2);
  drawCircle(ctx, x + 22, b - 40, 3, '#c99e28', 1.5);
  drawLine(ctx, x + 28, b - 36, x + 31, b - 33, '#d4af37', 2);
  drawRRect(ctx, x + 36, b - 34, 18, 8, 1, '#4a5568', 1.5);
  for (let g = 0; g < 3; g++) {
    drawRRect(ctx, x + 38 + g * 5, b - 35, 3.5, 6, 0.5, 'rgba(210,240,255,0.8)', 1);
  }
  drawRRect(ctx, x + w - 18, b - 40, 16, 11, 1, '#fff', 1.5);
  plainText(ctx, 'CHAI', x + w - 10, b - 35, 6, '#d82828', 'center', '900');
}

function bgDelhi(ctx, camX, t) {
  ctx.globalAlpha = 0.5; drawCircle(ctx, 830, 90, 62, '#ffe0a0', 0); ctx.globalAlpha = 1;
  drawCircle(ctx, 830, 90, 42, '#ffd070', 3);
  repeatLayer(camX + t * 2, 0.06, 360, 0, (sx, k) => {
    const rr = seeded(k); drawCloud(ctx, sx, 60 + rr() * 90, 0.8 + rr() * 0.6);
  });
  repeatLayer(camX, 0.15, 2400, 900, sx => drawQutubMinar(ctx, sx, 420));
  // Delhi Ridge silhouette
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, 385 + Math.sin((x + camX * 0.2) * 0.006) * 16 + Math.sin((x + camX * 0.2) * 0.017) * 8);
  ctx.lineTo(W, H); ctx.closePath(); fillStroke(ctx, '#c48f58', 3);
  repeatLayer(camX, 0.28, 2200, 1600, sx => drawIndiaGate(ctx, sx, 430));
  repeatLayer(camX, 0.45, 1800, 500, sx => drawRedFort(ctx, sx, 435, t));
  repeatLayer(camX, 0.45, 1800, 150, sx => { drawTree(ctx, sx, 435, 1.1, '#388e3c'); drawTree(ctx, sx + 750, 435, 1.2, '#2e7d32'); });
  // Authentic Indian street elements in foreground
  repeatLayer(camX, 0.85, 340, 0, (sx, k) => {
    const mod = Math.abs(k) % 3;
    if (mod === 0) drawPoliceBarricade(ctx, sx, 462);
    else if (mod === 1) drawAutoRickshaw(ctx, sx + 40, 462);
    else drawChaiStall(ctx, sx + 50, 462);
  });
}

const bgDC = bgDelhi;

/* ---------- New York ---------- */
function drawEmpireState(ctx, x, b, c) {
  drawRRect(ctx, x - 50, b - 200, 100, 200, 0, c, 3);
  drawRRect(ctx, x - 36, b - 260, 72, 62, 0, c, 3);
  drawRRect(ctx, x - 24, b - 310, 48, 52, 0, c, 3);
  drawRRect(ctx, x - 14, b - 345, 28, 37, 0, c, 3);
  drawPoly(ctx, [x - 6, b - 345, x + 6, b - 345, x + 2, b - 400, x - 2, b - 400], c, 3);
  ctx.fillStyle = 'rgba(255,230,140,0.7)';
  for (let y = b - 340; y < b - 10; y += 14) for (let i = -40; i < 40; i += 12) {
    if (Math.abs(i) < (y < b - 308 ? 10 : y < b - 258 ? 20 : y < b - 198 ? 32 : 46)) ctx.fillRect(x + i, y, 4, 7);
  }
}
function drawLiberty(ctx, x, b, t) {
  const c = '#5fae9a';
  drawPoly(ctx, [x - 40, b, x + 40, b, x + 30, b - 70, x - 30, b - 70], '#8a8a7a', 3);
  drawRRect(ctx, x - 34, b - 82, 68, 14, 2, '#9a9a8a', 3);
  drawPoly(ctx, [x - 22, b - 82, x + 22, b - 82, x + 12, b - 170, x - 12, b - 170], c, 3);
  drawRRect(ctx, x + 6, b - 230, 9, 70, 4, c, 3);
  drawRRect(ctx, x + 3, b - 240, 15, 12, 2, '#c9a54a', 2.5);
  drawEllipse(ctx, x + 10, b - 252 + Math.sin(t * 0.2) * 1.5, 7, 11, '#ffb02e', 2.5);
  drawCircle(ctx, x, b - 182, 11, c, 3);
  for (let i = -2; i <= 2; i++) drawPoly(ctx, [x + i * 5 - 2, b - 190, x + i * 9, b - 205, x + i * 5 + 2, b - 190], c, 2);
  drawRRect(ctx, x - 22, b - 150, 12, 22, 3, '#4d9a86', 2.5);
}
function drawTaxi(ctx, x, b) {
  drawRRect(ctx, x, b - 26, 78, 18, 6, '#ffcc22', 3);
  drawRRect(ctx, x + 16, b - 40, 42, 16, 6, '#ffcc22', 3);
  drawRRect(ctx, x + 21, b - 37, 15, 10, 2, '#9fd6ff', 2); drawRRect(ctx, x + 39, b - 37, 15, 10, 2, '#9fd6ff', 2);
  ctx.fillStyle = OUTLINE; for (let i = 0; i < 8; i++) ctx.fillRect(x + 4 + i * 9, b - 19, 5, 4);
  drawCircle(ctx, x + 18, b - 6, 8, '#222', 3); drawCircle(ctx, x + 60, b - 6, 8, '#222', 3);
  drawCircle(ctx, x + 18, b - 6, 3, '#999', 0); drawCircle(ctx, x + 60, b - 6, 3, '#999', 0);
}
function drawStreetLamp(ctx, x, b, color = '#3a3a48') {
  drawRRect(ctx, x - 3, b - 110, 6, 110, 2, color, 2.5);
  drawRRect(ctx, x - 3, b - 112, 26, 6, 3, color, 2.5);
  ctx.globalAlpha = 0.25; drawCircle(ctx, x + 20, b - 100, 22, '#fff4a8', 0); ctx.globalAlpha = 1;
  drawEllipse(ctx, x + 20, b - 103, 8, 5, '#fff4a8', 2.5);
}
function bgNY(ctx, camX, t) {
  ctx.globalAlpha = 0.45; drawCircle(ctx, 640, 330, 130, '#ffd27a', 0); ctx.globalAlpha = 1;
  drawCircle(ctx, 640, 330, 85, '#ffb85a', 3);
  repeatLayer(camX + t * 2, 0.05, 420, 100, (sx, k) => {
    const rr = seeded(k + 3); drawCloud(ctx, sx, 60 + rr() * 80, 0.7 + rr() * 0.5, '#ffc6b0');
  });
  repeatLayer(camX, 0.1, 2700, 1500, sx => drawLiberty(ctx, sx, 400, t));
  repeatLayer(camX, 0.14, 72, 0, (sx, k) => {
    const rr = seeded(k + 11), h = 110 + rr() * 150, w = 58 + rr() * 16;
    drawRRect(ctx, sx, 420 - h, w, h + 20, 0, '#6e4a8a', 2.5);
    ctx.fillStyle = 'rgba(255,220,140,0.45)';
    for (let y = 420 - h + 10; y < 420; y += 16) for (let i = 6; i < w - 8; i += 12) if (rr() < 0.35) ctx.fillRect(sx + i, y, 5, 8);
  });
  repeatLayer(camX, 0.14, 1900, 600, sx => drawEmpireState(ctx, sx, 420, '#5d3d7a'));
  repeatLayer(camX, 0.38, 118, 30, (sx, k) => {
    const rr = seeded(k + 29), h = 120 + rr() * 140, w = 92 + rr() * 20;
    const col = ['#3d2b5a', '#4a3060', '#36284f'][k & 1 ? 1 : (k % 3 === 0 ? 2 : 0)];
    drawRRect(ctx, sx, 440 - h, w, h + 30, 0, col, 3);
    drawRRect(ctx, sx - 4, 440 - h - 6, w + 8, 8, 0, '#2a1d40', 2.5);
    for (let y = 440 - h + 14; y < 430; y += 20) for (let i = 10; i < w - 12; i += 18) {
      ctx.fillStyle = rr() < 0.55 ? '#ffd86a' : '#2a1d40'; ctx.fillRect(sx + i, y, 9, 12);
    }
    if (rr() < 0.35) {
      const wx = sx + w * 0.6;
      drawLine(ctx, wx - 8, 440 - h - 6, wx - 8, 440 - h - 22, OUTLINE, 2.5); drawLine(ctx, wx + 8, 440 - h - 6, wx + 8, 440 - h - 22, OUTLINE, 2.5);
      drawRRect(ctx, wx - 13, 440 - h - 46, 26, 26, 4, '#8a5a3a', 2.5);
      drawPoly(ctx, [wx - 15, 440 - h - 46, wx, 440 - h - 58, wx + 15, 440 - h - 46], '#6e4529', 2.5);
    }
  });
  repeatLayer(camX, 0.85, 560, 0, (sx, k) => {
    drawStreetLamp(ctx, sx, 462);
    if (k % 2 === 0) drawTaxi(ctx, sx + 140, 462);
  });
}

/* ---------- London ---------- */
function drawBigBen(ctx, x, b, t) {
  const c = '#c9a86a', d = '#a88a50';
  // Parliament body
  drawRRect(ctx, x + 20, b - 90, 300, 90, 0, d, 3);
  ctx.fillStyle = '#7d653a';
  for (let i = x + 30; i < x + 315; i += 16) { ctx.fillRect(i, b - 80, 6, 16); ctx.fillRect(i, b - 50, 6, 16); }
  for (let i = x + 30; i < x + 320; i += 24) drawPoly(ctx, [i - 4, b - 90, i, b - 106, i + 4, b - 90], d, 2);
  drawRRect(ctx, x + 250, b - 150, 50, 150, 0, d, 3);
  drawPoly(ctx, [x + 250, b - 150, x + 275, b - 180, x + 300, b - 150], d, 3);
  // Clock tower
  drawRRect(ctx, x - 28, b - 230, 56, 230, 0, c, 3);
  ctx.fillStyle = d; for (let y = b - 200; y < b; y += 22) ctx.fillRect(x - 20, y, 40, 4);
  drawRRect(ctx, x - 34, b - 300, 68, 74, 2, c, 3);
  ctx.save(); ctx.shadowColor = '#fff2a0'; ctx.shadowBlur = 18;
  drawCircle(ctx, x, b - 263, 25, '#fff8d2', 3); ctx.restore();
  drawCircle(ctx, x, b - 263, 25, null, 3);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; drawLine(ctx, x + Math.cos(a) * 20, b - 263 + Math.sin(a) * 20, x + Math.cos(a) * 23, b - 263 + Math.sin(a) * 23, OUTLINE, 1.5); }
  drawLine(ctx, x, b - 263, x + Math.cos(t * 0.01 - 1.5) * 16, b - 263 + Math.sin(t * 0.01 - 1.5) * 16, OUTLINE, 2.5);
  drawLine(ctx, x, b - 263, x + Math.cos(t * 0.001) * 11, b - 263 + Math.sin(t * 0.001) * 11, OUTLINE, 3);
  drawRRect(ctx, x - 30, b - 322, 60, 22, 0, c, 3);
  drawPoly(ctx, [x - 30, b - 322, x, b - 400, x + 30, b - 322], '#4f5a6e', 3);
  drawLine(ctx, x, b - 400, x, b - 418, OUTLINE, 3);
  drawCircle(ctx, x, b - 420, 3, '#ffcc33', 1.5);
}
function drawTowerBridge(ctx, x, b) {
  const c = '#cdbb98';
  drawRRect(ctx, x - 200, b - 40, 400, 14, 0, '#5b7fae', 3);
  drawRRect(ctx, x - 120, b - 200, 240, 10, 0, '#5b7fae', 3);
  drawRRect(ctx, x - 120, b - 182, 240, 8, 0, '#5b7fae', 3);
  for (const tx of [-120, 120]) {
    drawRRect(ctx, x + tx - 30, b - 230, 60, 230, 0, c, 3);
    drawRRect(ctx, x + tx - 14, b - 200, 28, 40, 12, '#2a3048', 2.5);
    drawRRect(ctx, x + tx - 10, b - 120, 20, 40, 10, '#2a3048', 2.5);
    drawPoly(ctx, [x + tx - 34, b - 230, x + tx, b - 280, x + tx + 34, b - 230], '#4f5a6e', 3);
    for (const sx of [-30, 30]) drawPoly(ctx, [x + tx + sx - 6, b - 230, x + tx + sx, b - 256, x + tx + sx + 6, b - 230], '#4f5a6e', 2);
  }
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(x + s * 150, b - 190); ctx.quadraticCurveTo(x + s * 190, b - 80, x + s * 260, b - 40); ctx.stroke();
  }
}
function drawLondonEye(ctx, x, b, t) {
  const R = 120, cy = b - R - 30;
  drawLine(ctx, x, cy, x - 60, b, '#d9dbe8', 6); drawLine(ctx, x, cy, x + 60, b, '#d9dbe8', 6);
  ctx.strokeStyle = '#d9dbe8'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, cy, R, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.5;
  const rot = t * 0.002;
  for (let i = 0; i < 16; i++) {
    const a = rot + i / 16 * TAU;
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const a = rot + i / 16 * TAU;
    drawEllipse(ctx, x + Math.cos(a) * R, cy + Math.sin(a) * R + 4, 6, 5, '#ffe9a8', 2);
  }
  drawCircle(ctx, x, cy, 9, '#d9dbe8', 3);
}
function drawStPauls(ctx, x, b) {
  const c = '#9da3b8';
  drawRRect(ctx, x - 90, b - 70, 180, 70, 0, c, 3);
  drawRRect(ctx, x - 50, b - 120, 100, 52, 0, c, 3);
  ctx.beginPath(); ctx.arc(x, b - 120, 50, Math.PI, 0); ctx.closePath(); fillStroke(ctx, '#8b92a8', 3);
  drawRRect(ctx, x - 8, b - 188, 16, 22, 2, c, 3);
  drawLine(ctx, x, b - 188, x, b - 205, OUTLINE, 3);
  drawCircle(ctx, x, b - 208, 4, '#ffcc33', 2);
}
function drawPhoneBooth(ctx, x, b) {
  drawRRect(ctx, x, b - 70, 30, 70, 3, '#d8282e', 3);
  drawPoly(ctx, [x - 2, b - 70, x + 15, b - 80, x + 32, b - 70], '#d8282e', 3);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) drawRRect(ctx, x + 5 + c * 11, b - 58 + r * 11, 9, 9, 1, '#ffe9a8', 1.5);
}
function drawBus(ctx, x, b) {
  drawRRect(ctx, x, b - 74, 140, 64, 10, '#d8282e', 3);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) drawRRect(ctx, x + 8 + i * 22, b - 68 + r * 28, 18, 16, 3, '#bfe3ff', 2);
  ctx.fillStyle = '#ffcc33'; ctx.fillRect(x + 4, b - 47, 132, 4);
  drawCircle(ctx, x + 28, b - 8, 10, '#222', 3); drawCircle(ctx, x + 112, b - 8, 10, '#222', 3);
}
function bgLondon(ctx, camX, t) {
  const st = seeded(42);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 70; i++) {
    const sx = ((st() * 2000 - camX * 0.02) % W + W) % W, sy = st() * 260;
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.03 + i));
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 0.3; drawCircle(ctx, 800, 95, 58, '#fdf6d8', 0); ctx.globalAlpha = 1;
  drawCircle(ctx, 800, 95, 38, '#fdf6d8', 3);
  drawCircle(ctx, 788, 86, 7, '#e8dfb8', 0); drawCircle(ctx, 810, 104, 5, '#e8dfb8', 0);
  repeatLayer(camX, 0.1, 2400, 400, sx => drawLondonEye(ctx, sx, 420, t));
  repeatLayer(camX, 0.1, 2400, 1500, sx => drawStPauls(ctx, sx, 420));
  repeatLayer(camX, 0.15, 90, 0, (sx, k) => {
    const rr = seeded(k + 17), h = 40 + rr() * 70;
    drawRRect(ctx, sx, 430 - h, 80, h + 20, 0, '#3a4268', 2.5);
    drawPoly(ctx, [sx, 430 - h, sx + 40, 430 - h - 25, sx + 80, 430 - h], '#323a5e', 2.5);
  });
  repeatLayer(camX, 0.32, 2000, 900, sx => drawBigBen(ctx, sx, 440, t));
  repeatLayer(camX, 0.32, 2000, 1900, sx => drawTowerBridge(ctx, sx, 440));
  // fog
  const g = ctx.createLinearGradient(0, 360, 0, 460);
  g.addColorStop(0, 'rgba(180,190,220,0)'); g.addColorStop(1, 'rgba(180,190,220,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 360, W, 100);
  repeatLayer(camX, 0.85, 600, 0, (sx, k) => {
    drawStreetLamp(ctx, sx, 462, '#262a3a');
    if (k % 3 === 0) drawBus(ctx, sx + 160, 462); else drawPhoneBooth(ctx, sx + 200, 462);
  });
}

/* Alien invasion ambience for every level */
function drawInvasion(ctx, camX, t, n = 3) {
  for (let i = 0; i < n; i++) {
    const span = W + 300;
    const x = (((t * (0.4 + i * 0.15) + i * 420 - camX * 0.04) % span) + span) % span - 150;
    const y = 50 + i * 38 + Math.sin(t * 0.02 + i) * 8;
    ctx.globalAlpha = 0.55;
    if ((Math.floor(t / 200) + i) % 3 === 0) {
      ctx.fillStyle = 'rgba(160,255,120,0.25)';
      ctx.beginPath(); ctx.moveTo(x - 6, y + 4); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x + 30, 430); ctx.lineTo(x - 30, 430); ctx.fill();
    }
    drawEllipse(ctx, x, y - 4, 8, 6, '#9fe8ff', 1.5);
    drawEllipse(ctx, x, y, 20, 5, '#4a4f60', 1.5);
    ctx.globalAlpha = 1;
  }
}

function drawBackground(ctx, themeKey, camX, t) {
  const th = THEMES[themeKey] || THEMES.delhi;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.sky[0]); g.addColorStop(0.8, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (themeKey === 'delhi' || themeKey === 'dc') bgDelhi(ctx, camX, t);
  else if (themeKey === 'ny') bgNY(ctx, camX, t);
  else bgLondon(ctx, camX, t);
  drawInvasion(ctx, camX, t, (themeKey === 'delhi' || themeKey === 'dc') ? 2 : themeKey === 'ny' ? 3 : 4);
}

