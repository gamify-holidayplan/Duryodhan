'use strict';
/* ===========================================================
   Core entities: base Entity, physics, Platform, Hazard,
   Player (Modi), Projectile, Item, Flag, Particles
   =========================================================== */

class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.dead = false;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
}

/* Axis-separated movement against solid and one-way platforms */
function physicsMove(e, platforms, ignoreOneWay = false) {
  e.onGround = false; e.standingOn = null; e.hitWall = false;
  e.x += e.vx;
  for (const p of platforms) {
    if (p.oneWay || !overlap(e, p)) continue;
    if (e.vx > 0) e.x = p.x - e.w;
    else if (e.vx < 0) e.x = p.x + p.w;
    else e.x = e.cx < p.x + p.w / 2 ? p.x - e.w : p.x + p.w;
    e.hitWall = true;
  }
  const prevBottom = e.y + e.h;
  e.y += e.vy;
  for (const p of platforms) {
    if (!overlap(e, p)) continue;
    if (p.oneWay) {
      if (ignoreOneWay || e.vy < 0) continue;
      if (prevBottom <= p.prevY + 4) { e.y = p.y - e.h; e.vy = 0; e.onGround = true; e.standingOn = p; }
    } else if (e.vy > 0) { e.y = p.y - e.h; e.vy = 0; e.onGround = true; e.standingOn = p; }
    else if (e.vy < 0) { e.y = p.y + p.h; e.vy = 0; }
  }
}

function groundBelow(x, feetY, platforms) {
  for (const p of platforms) {
    if (x >= p.x && x <= p.x + p.w && p.y >= feetY - 4 && p.y <= feetY + 30) return true;
  }
  return false;
}

/* ---------------- Platforms ---------------- */
class Platform {
  constructor(x, y, w, h, kind, opts = {}) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.kind = kind; // ground | block | ledge | moving
    this.oneWay = kind === 'ledge' || kind === 'moving';
    this.dx = 0; this.dy = 0; this.prevY = y;
    this.ox = x; this.oy = y;
    this.rangeX = opts.rangeX || 0; this.rangeY = opts.rangeY || 0;
    this.speed = opts.speed || 0.02; this.t = opts.phase || 0;
  }
  update() {
    this.prevY = this.y;
    if (this.kind !== 'moving') return;
    this.t += this.speed;
    const nx = this.ox + Math.sin(this.t) * this.rangeX;
    const ny = this.oy + Math.sin(this.t) * this.rangeY;
    this.dx = nx - this.x; this.dy = ny - this.y;
    this.x = nx; this.y = ny;
  }
  draw(ctx, th, camX) {
    if (this.x > camX + W + 20 || this.x + this.w < camX - 20) return;
    const { x, y, w, h } = this;
    if (this.kind === 'ground') {
      const x0 = Math.max(x, camX - 20), x1 = Math.min(x + w, camX + W + 20);
      ctx.fillStyle = th.groundFill; ctx.fillRect(x, y, w, H - y + 10);
      // texture dots / bricks
      ctx.fillStyle = th.groundDot;
      const start = Math.floor(x0 / 40) * 40;
      for (let gx = start; gx < x1; gx += 40) {
        if (gx < x || gx > x + w - 10) continue;
        const k = (gx * 7919) % 97;
        if (th.bricks) {
          for (let row = 0; row < 4; row++) {
            const ox = row % 2 ? 20 : 0;
            ctx.fillRect(gx + ox, y + 26 + row * 16, 36, 2);
            ctx.fillRect(gx + ox, y + 26 + row * 16, 2, 14);
          }
        } else {
          ctx.beginPath(); ctx.ellipse(gx + (k % 30), y + 35 + (k % 40), 5, 3, 0, 0, TAU); ctx.fill();
        }
      }
      // top strip
      ctx.fillStyle = th.groundTop; ctx.fillRect(x, y, w, 16);
      ctx.fillStyle = th.groundTop2; ctx.fillRect(x, y + 12, w, 5);
      if (th.grass) {
        ctx.fillStyle = th.groundTop;
        for (let gx = Math.floor(x0 / 18) * 18; gx < x1; gx += 18) {
          if (gx < x || gx > x + w - 18) continue;
          ctx.beginPath(); ctx.arc(gx + 9, y + 16, 9, 0, Math.PI); ctx.fill();
        }
      } else {
        ctx.fillStyle = th.groundTop2;
        for (let gx = Math.floor(x0 / 60) * 60; gx < x1; gx += 60) if (gx > x && gx < x + w) ctx.fillRect(gx, y, 3, 14);
      }
      ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE;
      ctx.beginPath(); ctx.moveTo(x, H + 10); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, H + 10); ctx.stroke();
    } else if (this.kind === 'block') {
      drawRRect(ctx, x, y, w, h, 4, th.block, 4);
      ctx.strokeStyle = th.blockDark; ctx.lineWidth = 4;
      ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
      ctx.beginPath(); ctx.moveTo(x + 9, y + 9); ctx.lineTo(x + w - 9, y + h - 9);
      ctx.moveTo(x + w - 9, y + 9); ctx.lineTo(x + 9, y + h - 9); ctx.stroke();
      drawRRect(ctx, x, y, w, h, 4, null, 4);
    } else if (this.kind === 'ledge') {
      drawLine(ctx, x + 14, y + h, x + 24, y + h + 26, OUTLINE, 5);
      drawLine(ctx, x + w - 14, y + h, x + w - 24, y + h + 26, OUTLINE, 5);
      drawRRect(ctx, x, y, w, h, 5, th.ledge, 3);
      ctx.fillStyle = th.ledgeDark; ctx.fillRect(x + 4, y + h - 6, w - 8, 3);
      ctx.fillStyle = OUTLINE;
      for (let i = x + 12; i < x + w - 6; i += 24) { ctx.beginPath(); ctx.arc(i, y + 6, 2, 0, TAU); ctx.fill(); }
    } else if (this.kind === 'moving') {
      const g = ctx.createLinearGradient(0, y + h, 0, y + h + 30);
      g.addColorStop(0, 'rgba(90,255,220,0.6)'); g.addColorStop(1, 'rgba(90,255,220,0)');
      ctx.fillStyle = g; ctx.fillRect(x + 18, y + h, w - 36, 30);
      drawRRect(ctx, x, y, w, h, 8, '#9aa6bf', 3);
      ctx.fillStyle = '#5affdc'; ctx.fillRect(x + 10, y + h - 5, w - 20, 3);
      for (let i = 0; i < 3; i++) drawCircle(ctx, x + w / 2 - 24 + i * 24, y + 7, 3, (Math.floor(this.t * 6) % 3 === i) ? '#ffef5a' : '#57607a', 1.5);
    }
  }
}

/* Alien crystal spikes */
class Hazard extends Entity {
  constructor(x, w) { super(x, GROUND_Y - 22, w, 22); this.t = Math.random() * 10; }
  draw(ctx, th) {
    this.t += 0.05;
    const n = Math.max(2, Math.round(this.w / 20)), sw = this.w / n;
    ctx.save();
    ctx.shadowColor = th.spikes; ctx.shadowBlur = 8 + Math.sin(this.t) * 4;
    for (let i = 0; i < n; i++) {
      const bx = this.x + i * sw, hh = 22 + (i % 2) * 6;
      drawPoly(ctx, [bx, GROUND_Y, bx + sw / 2, GROUND_Y - hh, bx + sw, GROUND_Y], th.spikes, 2.5);
      ctx.shadowBlur = 0;
      drawPoly(ctx, [bx + sw * 0.35, GROUND_Y - 4, bx + sw / 2, GROUND_Y - hh + 6, bx + sw * 0.5, GROUND_Y - 4], 'rgba(255,255,255,0.6)', 0);
    }
    ctx.restore();
  }
}

/* ---------------- Weapons ---------------- */
const WEAPONS = {
  laser: { key: 'laser', name: 'Laser Gun', cost: 2, cooldown: 11, color: '#ff4848', sound: 'shoot' },
  triple: { key: 'triple', name: 'Triple Laser', cost: 4, cooldown: 14, color: '#45ff6a', sound: 'triple' },
  cannon: { key: 'cannon', name: 'Laser Cannon', cost: 7, cooldown: 24, color: '#3cc8ff', sound: 'cannon' },
  plasma: { key: 'plasma', name: 'Plasma Cannon', cost: 12, cooldown: 36, color: '#d050ff', sound: 'plasma' },
};
const WEAPON_ORDER = ['laser', 'triple', 'cannon', 'plasma'];

/* Draws a gun pointing along +x starting at the hand (0,0) */
function drawGun(ctx, key, s = 1) {
  const c = WEAPONS[key].color;
  ctx.save(); ctx.scale(s, s);
  switch (key) {
    case 'laser':
      drawRRect(ctx, -2, 0, 7, 9, 2, '#555c70', 2);
      drawRRect(ctx, -4, -6, 24, 9, 3, '#c9cfdc', 2.5);
      drawRRect(ctx, 18, -5, 6, 7, 2, c, 2);
      break;
    case 'triple':
      drawRRect(ctx, -2, 0, 7, 9, 2, '#3d5c45', 2);
      drawRRect(ctx, -4, -8, 22, 13, 3, '#9fe0ab', 2.5);
      for (let i = 0; i < 3; i++) drawRRect(ctx, 17, -8 + i * 4.5, 8, 4, 1.5, c, 1.5);
      break;
    case 'cannon':
      drawRRect(ctx, -2, 1, 8, 9, 2, '#2f4a66', 2);
      drawRRect(ctx, -8, -8, 22, 15, 4, '#5f87b3', 2.5);
      drawRRect(ctx, 12, -6, 22, 11, 3, '#a9c7e8', 2.5);
      drawRRect(ctx, 32, -7, 6, 13, 2, c, 2);
      break;
    case 'plasma':
      drawRRect(ctx, -2, 1, 8, 9, 2, '#4a2d5c', 2);
      drawRRect(ctx, -8, -6, 34, 11, 4, '#8a6aa3', 2.5);
      drawCircle(ctx, 8, -2, 9, c, 2.5);
      drawCircle(ctx, 6, -5, 3, 'rgba(255,255,255,0.8)', 0);
      drawRRect(ctx, 26, -8, 7, 14, 3, '#5d3d75', 2);
      break;
  }
  ctx.restore();
}

/* ---------------- Narendra Modi caricature ---------------- */
function drawLeg(ctx, hx, hy, ang, color = '#f5f6fa') {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
  drawRRect(ctx, -4.5, -2, 9, 22, 3, color, 2.5);
  drawRRect(ctx, -5, 17, 14, 7, 3.5, '#1e1b18', 2.5);
  ctx.restore();
}

function drawModiHead(ctx, hx, hy, o = {}) {
  const skin = '#c9936a', skinDark = '#a56f4d';
  // ears
  drawEllipse(ctx, hx - 12, hy, 4, 6.5, skin, 2.2);
  drawEllipse(ctx, hx + 12, hy, 4, 6.5, skin, 2.2);
  ctx.strokeStyle = skinDark; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(hx - 12, hy, 2.5, -1.2, 1.2, true); ctx.stroke();
  ctx.beginPath(); ctx.arc(hx + 12, hy, 2.5, Math.PI - 1.2, Math.PI + 1.2, true); ctx.stroke();

  // head shape
  drawEllipse(ctx, hx, hy - 1, 13.5, 15, skin, 2.8);

  // white styled hair
  ctx.beginPath();
  ctx.arc(hx, hy - 6, 14, Math.PI * 0.95, Math.PI * 2.05);
  ctx.quadraticCurveTo(hx + 13, hy - 3, hx + 11.5, hy + 1);
  ctx.quadraticCurveTo(hx, hy - 8, hx - 11.5, hy + 1);
  ctx.quadraticCurveTo(hx - 13, hy - 3, hx - 14, hy - 6);
  ctx.closePath(); fillStroke(ctx, '#f6f7fa', 2.4);

  // hair texture
  ctx.strokeStyle = '#d6dae4'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(hx, hy - 7, 11, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(hx + 4, hy - 6, 8, Math.PI * 1.5, Math.PI * 1.9); ctx.stroke();

  // white eyebrows
  const brow = o.angry ? 1.5 : 0;
  drawLine(ctx, hx - 8, hy - 6 + brow, hx - 1.5, hy - 7 + brow, OUTLINE, 2.8);
  drawLine(ctx, hx - 7.5, hy - 6 + brow, hx - 2, hy - 7 + brow, '#f4f5f9', 1.8);
  drawLine(ctx, hx + 1.5, hy - 7 + brow, hx + 8, hy - 6 + brow, OUTLINE, 2.8);
  drawLine(ctx, hx + 2, hy - 7 + brow, hx + 7.5, hy - 6 + brow, '#f4f5f9', 1.8);

  // eyes
  if (o.blink) {
    drawLine(ctx, hx - 6, hy - 2, hx - 1, hy - 2, OUTLINE, 2);
    drawLine(ctx, hx + 1, hy - 2, hx + 6, hy - 2, OUTLINE, 2);
  } else {
    drawEllipse(ctx, hx - 4, hy - 2, 2.8, 2.4, '#fff', 1.2);
    drawEllipse(ctx, hx + 4, hy - 2, 2.8, 2.4, '#fff', 1.2);
    ctx.fillStyle = '#241a14';
    ctx.beginPath(); ctx.arc(hx - 3.5, hy - 1.8, 1.4, 0, TAU); ctx.arc(hx + 4.5, hy - 1.8, 1.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx - 3.8, hy - 2.2, 0.6, 0, TAU); ctx.arc(hx + 4.2, hy - 2.2, 0.6, 0, TAU); ctx.fill();
  }

  // rimless glasses (rectangular frame with glint)
  drawRRect(ctx, hx - 8.5, hy - 5.5, 7.5, 6.5, 1.5, 'rgba(235,248,255,0.4)', 1.5);
  drawRRect(ctx, hx + 1, hy - 5.5, 7.5, 6.5, 1.5, 'rgba(235,248,255,0.4)', 1.5);
  drawLine(ctx, hx - 1, hy - 2.5, hx + 1, hy - 2.5, '#444', 1.8); // bridge
  drawLine(ctx, hx - 8.5, hy - 3, hx - 11.5, hy - 2.5, '#444', 1.4); // temple
  drawLine(ctx, hx + 8.5, hy - 3, hx + 11.5, hy - 2.5, '#444', 1.4);
  drawLine(ctx, hx - 7, hy - 4.5, hx - 3, hy - 1.5, 'rgba(255,255,255,0.7)', 1);
  drawLine(ctx, hx + 2.5, hy - 4.5, hx + 6.5, hy - 1.5, 'rgba(255,255,255,0.7)', 1);

  // nose
  ctx.strokeStyle = skinDark; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(hx, hy - 3); ctx.quadraticCurveTo(hx + 2.8, hy + 2, hx, hy + 3); ctx.stroke();

  // full trimmed white beard
  ctx.beginPath();
  ctx.moveTo(hx - 11, hy + 1);
  ctx.quadraticCurveTo(hx - 12, hy + 9, hx - 6, hy + 14);
  ctx.quadraticCurveTo(hx, hy + 16.5, hx + 6, hy + 14);
  ctx.quadraticCurveTo(hx + 12, hy + 9, hx + 11, hy + 1);
  ctx.quadraticCurveTo(hx + 6, hy + 4, hx, hy + 4.5);
  ctx.quadraticCurveTo(hx - 6, hy + 4, hx - 11, hy + 1);
  ctx.closePath(); fillStroke(ctx, '#f6f7fa', 2.5);

  // beard hair texture
  drawLine(ctx, hx - 4, hy + 10, hx - 3, hy + 14, '#d5d9e4', 1.2);
  drawLine(ctx, hx, hy + 10.5, hx, hy + 15, '#d5d9e4', 1.2);
  drawLine(ctx, hx + 4, hy + 10, hx + 3, hy + 14, '#d5d9e4', 1.2);

  // mouth / smile
  ctx.beginPath(); ctx.moveTo(hx - 4, hy + 5.5);
  ctx.quadraticCurveTo(hx, hy + (o.shout ? 10.5 : 7.5), hx + 4, hy + 5.5);
  fillStroke(ctx, '#fff', 1.5);

  // white mustache
  drawRRect(ctx, hx - 7, hy + 2.5, 14, 4.5, 2.2, '#f6f7fa', 2);
  drawLine(ctx, hx, hy + 2.5, hx, hy + 6.5, '#d5d9e4', 1.2);
}

const drawObamaHead = drawModiHead;

/* Full-body Narendra Modi in half-sleeve Kurta & tailored Modi jacket */
function drawModi(ctx, x, y, s, facing, o = {}) {
  const run = o.runPhase || 0;
  const aim = o.aim || 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * facing, s);
  const swing = o.moving ? Math.sin(run) * 0.7 : 0;
  const legA = o.air ? -0.55 : swing, legB = o.air ? 0.45 : -swing;
  const bob = o.moving && !o.air ? -Math.abs(Math.sin(run)) * 2 : 0;
  ctx.translate(0, bob);

  // back leg (crisp white pajama pants)
  drawLeg(ctx, -4, -26, legB, '#f0f2f8');

  // back arm (half-sleeve cream kurta + bare forearm)
  ctx.save(); ctx.translate(-6, -42); ctx.rotate(o.moving ? -swing * 0.6 + 0.25 : 0.25);
  // kurta half-sleeve
  drawRRect(ctx, -4, -2, 8, 10, 2.5, '#fff8ed', 2.5);
  // bare forearm
  drawRRect(ctx, -3, 8, 6, 9, 2.5, '#c9936a', 2.2);
  drawCircle(ctx, 0, 17, 3.6, '#c9936a', 2);
  ctx.restore();

  // Kurta under-hem extending below jacket
  drawRRect(ctx, -11, -21, 23, 6, 2, '#fff8ed', 2);

  // Tailored Saffron Modi Jacket (Nehru jacket)
  drawRRect(ctx, -12, -47, 25, 27, 6, '#ea5b18', 3);
  // center placket
  drawLine(ctx, 0.5, -47, 0.5, -20, '#c8460b', 2);
  // brass buttons
  for (let i = 0; i < 4; i++) {
    drawCircle(ctx, 0.5, -42 + i * 6.5, 1.3, '#ffcc33', 1);
  }
  // chest welt pocket with mini Indian tricolor pocket square
  drawRRect(ctx, 5, -43, 6, 3, 1, '#c8460b', 1.5);
  ctx.fillStyle = '#ff9933'; ctx.fillRect(5.5, -44.5, 5, 1.2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(5.5, -43.3, 5, 1.2);
  ctx.fillStyle = '#138808'; ctx.fillRect(5.5, -42.1, 5, 1.2);

  // Mandarin bandhgala collar
  drawRRect(ctx, -6, -51, 13, 5, 2, '#ea5b18', 2.5);
  drawLine(ctx, 0.5, -51, 0.5, -46, '#c8460b', 1.5);

  // front leg
  drawLeg(ctx, 4, -26, legA, '#f5f6fa');

  // neck + head
  ctx.fillStyle = '#b87f58'; ctx.fillRect(-3.5, -53, 8, 6);
  drawModiHead(ctx, 0, -63, o);

  // front gun arm
  ctx.save(); ctx.translate(4, -41); ctx.rotate(aim);
  ctx.translate(-(o.recoil || 0) * 0.6, 0);
  // kurta half-sleeve on upper bicep
  drawRRect(ctx, -3, -4.5, 9, 9, 2.5, '#fff8ed', 2.5);
  drawLine(ctx, 6, -4.5, 6, 4.5, '#d6d1c4', 1.5);
  // bare skin forearm
  drawRRect(ctx, 5, -3.5, 12, 7, 2.5, '#c9936a', 2.2);
  // sci-fi laser weapon
  drawGun(ctx, o.weapon || 'laser', 1);
  ctx.translate(15, 0);
  // hand holding weapon
  drawCircle(ctx, 2, 1, 4, '#c9936a', 2);
  ctx.restore();

  ctx.restore();
}

const drawObama = drawModi;

const PLAYER_SCALE = 0.84;

class Player extends Entity {
  constructor(x, y) {
    super(x, y, 28, 60);
    this.facing = 1;
    this.maxHp = 5; this.hp = 5;
    this.maxEnergy = 100; this.energy = 100;
    this.weapons = ['laser']; this.weaponIdx = 0;
    this.cooldown = 0; this.invuln = 0; this.dropTimer = 0;
    this.coyote = 0; this.jumpBuffer = 0;
    this.runPhase = 0; this.aimAngle = 0; this.aimTimer = 0; this.recoil = 0;
    this.speech = null; this.hidden = false; this.blinkT = 120;
    this.lastSafe = { x, y };
    this.frozen = false;
  }
  get weapon() { return WEAPONS[this.weapons[this.weaponIdx]]; }

  say(text, frames = 150) { this.speech = { text, t: frames }; }

  giveWeapon(key) {
    if (this.weapons.includes(key)) return false;
    this.weapons.push(key);
    this.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
    this.weaponIdx = this.weapons.indexOf(key);
    return true;
  }
  cycleWeapon(dir, game) {
    if (this.weapons.length < 2) return;
    this.weaponIdx = (this.weaponIdx + dir + this.weapons.length) % this.weapons.length;
    game.audio.play('select');
  }
  shoulder() {
    const s = PLAYER_SCALE;
    return { x: this.cx + 4 * s * this.facing, y: this.y + this.h - 41 * s };
  }

  update(game) {
    const I = game.input, lvl = game.level;
    if (this.cooldown > 0) this.cooldown--;
    if (this.invuln > 0) this.invuln--;
    if (this.recoil > 0) this.recoil--;
    if (this.speech && --this.speech.t <= 0) this.speech = null;
    if (--this.blinkT < 0) this.blinkT = randInt(120, 260);

    const ctrl = !this.frozen;
    const left = ctrl && I.down('ArrowLeft', 'KeyA'), right = ctrl && I.down('ArrowRight', 'KeyD');
    const jumpP = ctrl && I.hit('ArrowUp', 'KeyW', 'Space'), jumpH = ctrl && I.down('ArrowUp', 'KeyW', 'Space');
    const downP = ctrl && I.hit('ArrowDown', 'KeyS');

    // horizontal movement
    const accel = this.onGround ? 0.9 : 0.55;
    if (left && !right) { this.vx -= accel; if (this.aimTimer <= 0) this.facing = -1; }
    else if (right && !left) { this.vx += accel; if (this.aimTimer <= 0) this.facing = 1; }
    else this.vx *= this.onGround ? 0.72 : 0.94;
    this.vx = clamp(this.vx, -5.2, 5.2);
    if (Math.abs(this.vx) < 0.05) this.vx = 0;

    // jumping with coyote time + buffer
    this.coyote = this.onGround ? 7 : this.coyote - 1;
    this.jumpBuffer = jumpP ? 8 : this.jumpBuffer - 1;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -13; this.coyote = 0; this.jumpBuffer = 0;
      game.audio.play('jump');
      game.dust(this.cx, this.y + this.h, 6);
    }
    if (!jumpH && this.vy < 0) this.vy += 0.65; // variable jump height

    // drop through one-way platforms
    if (downP && this.onGround && this.standingOn && this.standingOn.oneWay) {
      this.dropTimer = 14; this.y += 2;
    }
    if (this.dropTimer > 0) this.dropTimer--;

    this.vy = Math.min(this.vy + GRAVITY, 15);
    const wasAir = !this.onGround;
    physicsMove(this, lvl.platforms, this.dropTimer > 0);
    if (wasAir && this.onGround && this.vy === 0) game.dust(this.cx, this.y + this.h, 3);

    // bounds
    const minX = game.arenaLocked ? lvl.arenaStart + 2 : 0;
    const maxX = (game.arenaLocked ? lvl.arenaStart + W - 2 : lvl.width) - this.w;
    if (this.x < minX) { this.x = minX; this.vx = Math.max(0, this.vx); }
    if (this.x > maxX) { this.x = maxX; this.vx = Math.min(0, this.vx); }

    // remember last safe ground for respawn
    if (this.onGround && this.standingOn && this.standingOn.kind === 'ground') {
      const p = this.standingOn;
      this.lastSafe = { x: clamp(this.x, p.x + 20, p.x + p.w - 60), y: p.y - this.h };
    }

    if (this.onGround && Math.abs(this.vx) > 0.3) this.runPhase += Math.abs(this.vx) * 0.075;

    // ----- shooting -----
    let a = null;
    if (ctrl) {
      if (I.mouse.down) {
        const m = game.mouseWorld(), sh = this.shoulder();
        a = Math.atan2(m.y - sh.y, m.x - sh.x);
      } else if (I.down('KeyJ', 'KeyZ')) a = this.facing > 0 ? 0 : Math.PI;
      else if (I.down('KeyK', 'KeyX')) a = this.facing > 0 ? -Math.PI / 4 : -3 * Math.PI / 4;
    }
    if (a !== null) {
      this.aimAngle = a; this.aimTimer = 30;
      this.facing = Math.cos(a) >= 0 ? 1 : -1;
      this.fire(game, a);
    } else if (this.aimTimer > 0) this.aimTimer--;
    else this.aimAngle = this.facing > 0 ? 0 : Math.PI;

    // weapon switching
    if (ctrl) {
      if (I.hit('KeyQ') || I.wheel < 0) this.cycleWeapon(-1, game);
      if (I.hit('KeyE') || I.wheel > 0) this.cycleWeapon(1, game);
      for (let i = 0; i < 4; i++) {
        if (I.hit('Digit' + (i + 1))) {
          const idx = this.weapons.indexOf(WEAPON_ORDER[i]);
          if (idx >= 0 && idx !== this.weaponIdx) { this.weaponIdx = idx; game.audio.play('select'); }
        }
      }
    }

    // trickle regen when nearly empty, so the player is never fully stuck
    if (this.energy < 25) this.energy = Math.min(25, this.energy + 0.05);

    if (this.y > H + 60) game.playerFell();
  }

  fire(game, a) {
    if (this.cooldown > 0) return;
    const w = this.weapon;
    if (this.energy < w.cost) {
      this.cooldown = 18; game.audio.play('empty'); game.energyFlash = 40;
      if (!this.speech) this.say(pick(["I'm out of energy!", "Need a 'Full energy!'", "Running on empty here!"]), 90);
      return;
    }
    this.energy -= w.cost; this.cooldown = w.cooldown; this.recoil = 6;
    const sh = this.shoulder(), len = (w.key === 'cannon' || w.key === 'plasma' ? 48 : 38) * PLAYER_SCALE;
    const mx = sh.x + Math.cos(a) * len, my = sh.y + Math.sin(a) * len;
    const P = (ang, spd, opts) => game.addProjectile(new Projectile(mx, my, Math.cos(ang) * spd, Math.sin(ang) * spd,
      Object.assign({ owner: 'player', color: w.color }, opts)));
    switch (w.key) {
      case 'laser': P(a, 14, { kind: 'laser', damage: 1, r: 4, life: 70 }); break;
      case 'triple': for (const o of [-0.17, 0, 0.17]) P(a + o, 13, { kind: 'laser', damage: 1, r: 4, life: 60 }); break;
      case 'cannon': P(a, 16, { kind: 'cannon', damage: 3, r: 9, life: 60, pierce: true }); this.vx -= Math.cos(a) * 2; break;
      case 'plasma': P(a, 9, { kind: 'plasma', damage: 5, r: 11, life: 90, explode: 85 }); this.vx -= Math.cos(a) * 3; game.shake = Math.max(game.shake, 4); break;
    }
    for (let i = 0; i < 5; i++) game.particles.push(new Particle(mx, my, Math.cos(a) * rand(1, 4) + rand(-1, 1), Math.sin(a) * rand(1, 4) + rand(-1, 1), 12, w.color, 4, { glow: true, gravity: 0 }));
    game.audio.play(w.sound);
  }

  draw(ctx, game) {
    if (this.hidden) return;
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) ctx.globalAlpha = 0.4;
    let local = this.aimAngle;
    if (this.facing < 0) local = Math.PI - local;
    local = Math.atan2(Math.sin(local), Math.cos(local));
    drawModi(ctx, this.cx, this.y + this.h + 1, PLAYER_SCALE, this.facing, {
      runPhase: this.runPhase, moving: Math.abs(this.vx) > 0.4, air: !this.onGround,
      aim: local, weapon: this.weapons[this.weaponIdx], recoil: this.recoil, blink: this.blinkT < 8,
      shout: this.recoil > 0,
    });
    ctx.globalAlpha = 1;
    if (this.speech) drawSpeech(ctx, this.cx, this.y - 26, this.speech.text);
  }
}

function drawSpeech(ctx, x, y, text) {
  ctx.save();
  ctx.font = `bold 15px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const tw = ctx.measureText(text).width, bw = tw + 22, bh = 30;
  const bx = clamp(x - bw / 2, game.camX + 6, game.camX + W - bw - 6), by = y - bh;
  pathRoundRect(ctx, bx, by, bw, bh, 12);
  ctx.moveTo(x - 6, by + bh - 1); ctx.lineTo(x, by + bh + 10); ctx.lineTo(x + 6, by + bh - 1);
  fillStroke(ctx, '#fff', 2.5);
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, by + bh - 4, 10, 4);
  plainText(ctx, text, bx + bw / 2, by + bh / 2 + 1, 15, OUTLINE, 'center');
  ctx.restore();
}

/* ---------------- Projectiles ---------------- */
class Projectile extends Entity {
  constructor(x, y, vx, vy, o) {
    super(x - o.r, y - o.r, o.r * 2, o.r * 2);
    this.vx = vx; this.vy = vy;
    this.owner = o.owner; this.kind = o.kind; this.color = o.color || '#7dff5a';
    this.damage = o.damage || 1; this.r = o.r; this.life = o.life || 120;
    this.pierce = !!o.pierce; this.hitSet = new Set();
    this.gravity = o.gravity || 0; this.explode = o.explode || 0;
    this.noCollide = !!o.noCollide; this.t = 0;
  }
  update(game) {
    this.t++;
    this.vy += this.gravity;
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) { this.dead = true; if (this.explode && this.owner === 'player') game.detonate(this); }
    if (this.y > H + 60 || this.x < game.camX - 300 || this.x > game.camX + W + 300) this.dead = true;
    if (!this.noCollide && !this.dead) {
      for (const p of game.level.platforms) {
        if (!p.oneWay && overlap(this, p)) {
          this.dead = true;
          if (this.explode) game.detonate(this);
          else game.sparks(this.cx, this.cy, this.color, 5);
          break;
        }
      }
    }
    if (this.kind === 'missile' && this.t % 2 === 0)
      game.particles.push(new Particle(this.cx, this.cy, rand(-0.5, 0.5), rand(-0.5, 0.5), 25, '#aaa', 6, { gravity: -0.02, kind: 'smoke' }));
    if (this.kind === 'plasma' && this.t % 2 === 0)
      game.particles.push(new Particle(this.cx, this.cy, rand(-1, 1), rand(-1, 1), 18, this.color, 5, { glow: true, gravity: 0 }));
  }
  draw(ctx) {
    const cx = this.cx, cy = this.cy, a = Math.atan2(this.vy, this.vx);
    ctx.save();
    switch (this.kind) {
      case 'laser':
      case 'cannon': {
        const L = this.kind === 'cannon' ? 42 : 22, wd = this.kind === 'cannon' ? 16 : 7;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(cx, cy); ctx.rotate(a); ctx.lineCap = 'round';
        drawLine(ctx, -L, 0, 0, 0, this.color, wd);
        drawLine(ctx, -L + 4, 0, 0, 0, '#ffffff', wd * 0.35);
        break;
      }
      case 'plasma': {
        ctx.globalCompositeOperation = 'lighter';
        const pr = this.r + Math.sin(this.t * 0.5) * 2;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, pr * 2);
        g.addColorStop(0, '#fff'); g.addColorStop(0.35, this.color); g.addColorStop(1, 'rgba(208,80,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, pr * 2, 0, TAU); ctx.fill();
        break;
      }
      case 'orb': {
        ctx.shadowColor = this.color; ctx.shadowBlur = 10;
        drawCircle(ctx, cx, cy, this.r, this.color, 2);
        ctx.shadowBlur = 0;
        drawCircle(ctx, cx - 1, cy - 1, this.r * 0.4, '#fff', 0);
        break;
      }
      case 'bomb': {
        drawCircle(ctx, cx, cy, this.r, '#2b2b3a', 2.5);
        drawCircle(ctx, cx, cy, 3, Math.floor(this.t / 5) % 2 ? '#ff3030' : '#ffdd30', 1.5);
        drawLine(ctx, cx, cy - this.r, cx + 3, cy - this.r - 5, '#a07040', 2);
        break;
      }
      case 'missile': {
        ctx.translate(cx, cy); ctx.rotate(a);
        drawPoly(ctx, [-10, -4, -14, -8, -12, 0, -14, 8, -10, 4], '#555', 1.5);
        drawRRect(ctx, -11, -4, 18, 8, 3, '#d8d8e0', 2);
        drawPoly(ctx, [7, -4, 14, 0, 7, 4], '#ff4040', 2);
        ctx.globalCompositeOperation = 'lighter';
        drawCircle(ctx, -15, 0, 4 + Math.random() * 2, '#ffa020', 0);
        break;
      }
      case 'wave': {
        ctx.globalCompositeOperation = 'lighter';
        const bottom = this.y + this.h;
        const g = ctx.createLinearGradient(0, bottom - 40, 0, bottom);
        g.addColorStop(0, 'rgba(255,200,50,0)'); g.addColorStop(1, 'rgba(255,140,30,0.9)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(this.x - 6, bottom);
        ctx.quadraticCurveTo(cx, bottom - 50 - Math.sin(this.t * 0.6) * 6, this.x + this.w + 6, bottom);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
}

/* ---------------- Items ---------------- */
class Item extends Entity {
  constructor(cx, cy, kind, data) {
    const sz = { coin: 24, energy: 30, health: 26, weapon: 38 }[kind] || 24;
    super(cx - sz / 2, cy - sz / 2, sz, sz);
    this.kind = kind; this.data = data;
    this.baseY = this.y; this.t = Math.random() * TAU;
    this.falling = false;
  }
  update(game) {
    this.t += 0.07;
    if (this.falling) {
      this.vy = Math.min(this.vy + 0.3, 8); this.y += this.vy;
      for (const p of game.level.platforms) {
        if (p.kind === 'ground' && this.cx > p.x && this.cx < p.x + p.w && this.y + this.h >= p.y - 6) {
          this.y = p.y - this.h - 8; this.baseY = this.y; this.falling = false; break;
        }
      }
      if (this.y > H + 50) this.dead = true;
    } else this.y = this.baseY + Math.sin(this.t) * 4;
  }
  draw(ctx) {
    const cx = this.cx, cy = this.cy, t = this.t;
    ctx.save();
    switch (this.kind) {
      case 'coin': {
        ctx.translate(cx, cy);
        ctx.scale(Math.max(0.15, Math.abs(Math.cos(t * 0.8))), 1);
        drawCircle(ctx, 0, 0, 11, '#ffc933', 2.5);
        drawCircle(ctx, 0, 0, 7.5, '#ffe58a', 1.5);
        drawRupeeSymbol(ctx, 0, 0, 6.5, '#b37700', 1.8);
        break;
      }
      case 'energy': {
        ctx.globalAlpha = 0.35 + Math.sin(t * 2) * 0.15;
        drawCircle(ctx, cx, cy, 22, '#7dffb0', 0);
        ctx.globalAlpha = 1;
        drawRRect(ctx, cx - 4, cy - 17, 8, 5, 2, '#bbb', 2);
        drawRRect(ctx, cx - 11, cy - 13, 22, 28, 5, '#2fd47a', 3);
        drawPoly(ctx, [cx + 2, cy - 10, cx - 6, cy + 2, cx - 0.5, cy + 2, cx - 2.5, cy + 12, cx + 6, cy - 1, cx + 0.5, cy - 1], '#fff35a', 1.6);
        cartoonText(ctx, 'FULL ENERGY!', cx, cy - 28, 13, '#7dffb0', 'center', 3);
        break;
      }
      case 'health': {
        const s = 1 + Math.sin(t * 3) * 0.08;
        ctx.translate(cx, cy); ctx.scale(s, s);
        ctx.beginPath(); ctx.moveTo(0, 10);
        ctx.bezierCurveTo(-16, -1, -10, -15, 0, -6);
        ctx.bezierCurveTo(10, -15, 16, -1, 0, 10);
        fillStroke(ctx, '#ff4a6a', 2.5);
        drawCircle(ctx, -5, -5, 2.5, 'rgba(255,255,255,0.8)', 0);
        break;
      }
      case 'weapon': {
        const w = WEAPONS[this.data];
        ctx.globalAlpha = 0.4 + Math.sin(t * 2) * 0.2;
        drawCircle(ctx, cx, cy, 28, w.color, 0);
        ctx.globalAlpha = 1;
        drawRRect(ctx, cx - 20, cy - 16, 40, 32, 6, '#2c3350', 3);
        ctx.strokeStyle = w.color; ctx.lineWidth = 2; ctx.strokeRect(cx - 15, cy - 11, 30, 22);
        ctx.save(); ctx.translate(cx - 12, cy + 1); drawGun(ctx, this.data, 0.75); ctx.restore();
        cartoonText(ctx, w.name.toUpperCase(), cx, cy - 30, 15, w.color, 'center', 3.5);
        break;
      }
    }
    ctx.restore();
  }
}

/* ---------------- Flagpole ---------------- */
class Flag {
  constructor(x) {
    this.x = x; this.top = GROUND_Y - 230;
    this.active = false; this.appear = 0; this.captured = false; this.raise = 0;
  }
  get rect() { return { x: this.x - 14, y: this.top, w: 28, h: GROUND_Y - this.top }; }
  update() {
    if (this.active && this.appear < 1) this.appear = Math.min(1, this.appear + 0.02);
    if (this.captured && this.raise < 1) this.raise = Math.min(1, this.raise + 0.012);
  }
  draw(ctx, t) {
    if (!this.active) return;
    const h = (GROUND_Y - this.top) * this.appear, top = GROUND_Y - h;
    drawRRect(ctx, this.x - 18, GROUND_Y - 16, 36, 16, 3, '#9a9aa8', 3);
    drawRRect(ctx, this.x - 3.5, top, 7, h - 14, 3, '#e0e0ea', 2.5);
    drawCircle(ctx, this.x, top - 4, 7, '#ffcc33', 2.5);
    if (this.appear < 1) return;
    // alien flag at top until captured, then Indian flag rises
    if (!this.captured) {
      this.drawWavy(ctx, this.x + 4, this.top + 6, 60, 40, t, (c, i, x, y, w, h) => {
        ctx.fillStyle = '#5bd65b'; ctx.fillRect(x, y, w, h);
        if (i > 4 && i < 11) { ctx.fillStyle = '#1b1b2a'; ctx.fillRect(x, y + 12, w, 6); }
      });
    } else {
      const fy = lerp(GROUND_Y - 60, this.top + 6, this.raise);
      this.drawWavy(ctx, this.x + 4, fy, 64, 42, t, (c, i, x, y, w, h) => {
        const sh = h / 3;
        ctx.fillStyle = '#ff9933'; ctx.fillRect(x, y, w, sh + 0.5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + sh, w, sh + 0.5);
        ctx.fillStyle = '#138808'; ctx.fillRect(x, y + sh * 2, w, sh + 0.5);
        if (i >= 6 && i <= 9) {
          ctx.strokeStyle = '#000080'; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, sh * 0.4, 0, TAU); ctx.stroke();
        }
      });
    }
  }
  drawWavy(ctx, x, y, w, h, t, painter) {
    const cols = 16, cw = w / cols;
    for (let i = 0; i < cols; i++) {
      const off = Math.sin(t * 0.12 + i * 0.5) * 3 * (i / cols);
      painter(ctx, i, x + i * cw, y + off, cw + 0.6, h);
    }
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 0; i <= cols; i++) ctx.lineTo(x + i * cw, y + Math.sin(t * 0.12 + i * 0.5) * 3 * (i / cols));
    for (let i = cols; i >= 0; i--) ctx.lineTo(x + i * cw, y + h + Math.sin(t * 0.12 + i * 0.5) * 3 * (i / cols));
    ctx.closePath(); ctx.stroke();
  }
}

/* ---------------- Particles & floating text ---------------- */
class Particle {
  constructor(x, y, vx, vy, life, color, size, o = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color; this.size = size;
    this.gravity = o.gravity ?? 0.15; this.glow = !!o.glow; this.kind = o.kind || 'dot';
    this.drag = o.drag ?? 0.97; this.dead = false;
  }
  update() {
    this.vx *= this.drag; this.vy *= this.drag; this.vy += this.gravity;
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const k = this.life / this.maxLife;
    ctx.save();
    if (this.kind === 'ring') {
      ctx.globalAlpha = k; ctx.strokeStyle = this.color; ctx.lineWidth = 6 * k + 1;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size * (1 - k) + 4, 0, TAU); ctx.stroke();
    } else if (this.kind === 'smoke') {
      ctx.globalAlpha = k * 0.6; ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size * (1.6 - k), 0, TAU); ctx.fill();
    } else if (this.kind === 'debris') {
      ctx.translate(this.x, this.y); ctx.rotate(this.life * 0.3);
      ctx.fillStyle = this.color; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size); ctx.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);
    } else {
      if (this.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, Math.max(0.5, this.size * k), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

class FloatText {
  constructor(x, y, text, color = '#fff', size = 22) {
    this.x = x; this.y = y; this.text = text; this.color = color; this.size = size;
    this.life = 70; this.dead = false;
  }
  update() { this.y -= 0.7; if (--this.life <= 0) this.dead = true; }
  draw(ctx) {
    ctx.globalAlpha = Math.min(1, this.life / 20);
    cartoonText(ctx, this.text, this.x, this.y, this.size, this.color);
    ctx.globalAlpha = 1;
  }
}
