'use strict';
/* ===========================================================
   Enemies: Grunt, Flyer, UFO, Brute, Hopper + 3 bosses
   =========================================================== */

class Enemy extends Entity {
  constructor(x, y, w, h, hp, score, diff = 1) {
    super(x, y, w, h);
    this.hp = hp; this.maxHp = hp; this.score = score; this.diff = diff;
    this.flash = 0; this.facing = -1; this.t = randInt(0, 200);
    this.active = false; this.shootTimer = rand(60, 140); this.contactDmg = 1;
  }
  activate(game) { this.active = true; if (Math.random() < 0.45) game.audio.play('alien'); }
  hit(dmg, game) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 6;
    if (this.hp <= 0) { this.dead = true; game.onEnemyKilled(this); }
    else game.audio.play('hit');
  }
  get bulletSpeed() { return 3.4 + this.diff * 0.9; }
  aim(game, fx = this.cx, fy = this.cy) { const p = game.player; return Math.atan2(p.cy - fy, p.cx - fx); }
  shoot(game, ang, speed = this.bulletSpeed, fx = this.cx, fy = this.cy, opts = {}) {
    game.enemyShot(fx, fy, Math.cos(ang) * speed, Math.sin(ang) * speed, opts);
  }
  physics(game) { this.vy = Math.min(this.vy + GRAVITY, 14); physicsMove(this, game.level.platforms); if (this.y > H + 80) this.dead = true; }
  canWalk(game, dir) {
    if (!this.onGround) return true;
    const fx = dir > 0 ? this.x + this.w + 4 : this.x - 4;
    return groundBelow(fx, this.y + this.h, game.level.platforms);
  }
  beginDraw(ctx) { if (this.flash > 0 && this.flash % 2 === 0) ctx.globalAlpha = 0.45; }
  endDraw(ctx) {
    ctx.globalAlpha = 1;
    if (this.hp < this.maxHp && !this.isBoss) {
      const bw = Math.max(30, this.w * 0.8), bx = this.cx - bw / 2, by = this.y - 12;
      drawRRect(ctx, bx, by, bw, 6, 3, '#331b1b', 2);
      ctx.fillStyle = '#ff5a5a'; ctx.fillRect(bx + 1, by + 1, (bw - 2) * Math.max(0, this.hp / this.maxHp), 4);
    }
  }
}

/* ---------- Basic alien: walks toward the player and shoots ---------- */
class Grunt extends Enemy {
  constructor(x, y, diff) { super(x, y, 30, 44, 3, 100, diff); this.speed = 1.1 + diff * 0.25; }
  update(game) {
    this.t++;
    const p = game.player, dx = p.cx - this.cx;
    this.facing = dx < 0 ? -1 : 1;
    let mv = 0;
    if (Math.abs(dx) > 170) mv = this.facing * this.speed;
    else if (Math.abs(dx) < 90) mv = -this.facing * this.speed * 0.6;
    if (mv && !this.canWalk(game, Math.sign(mv))) mv = 0;
    this.vx = mv; this.moving = mv !== 0;
    this.physics(game);
    if (--this.shootTimer <= 0 && Math.abs(dx) < 540 && Math.abs(p.cy - this.cy) < 250) {
      this.shootTimer = rand(100, 170) / this.diff;
      const fx = this.cx + this.facing * 20, fy = this.y + 24;
      this.shoot(game, this.aim(game, fx, fy) + rand(-0.08, 0.08), this.bulletSpeed, fx, fy);
    }
  }
  draw(ctx) {
    this.beginDraw(ctx);
    const bob = this.moving ? Math.sin(this.t * 0.3) * 2 : Math.sin(this.t * 0.08);
    const leg = this.moving ? Math.sin(this.t * 0.3) * 4 : 0;
    ctx.save(); ctx.translate(this.cx, this.y + this.h); ctx.scale(this.facing, 1);
    drawRRect(ctx, -9 + leg, -13, 7, 13, 3, '#3a9e3a', 2.5);
    drawRRect(ctx, 2 - leg, -13, 7, 13, 3, '#3a9e3a', 2.5);
    drawRRect(ctx, -10, -27 + bob * 0.5, 20, 17, 7, '#5bd65b', 2.5);
    ctx.fillStyle = '#2d6e2d'; ctx.fillRect(-9, -15 + bob * 0.5, 18, 3);
    drawLine(ctx, 0, -46 + bob, 4, -56 + bob, OUTLINE, 2.5);
    drawCircle(ctx, 4, -57 + bob, 3.5, '#ff5ad1', 2);
    drawEllipse(ctx, 0, -37 + bob, 15, 12.5, '#7cf07c', 3);
    drawEllipse(ctx, -4, -37 + bob, 4.5, 6.5, '#111', 1.5, -0.5);
    drawEllipse(ctx, 7, -37 + bob, 4.5, 6.5, '#111', 1.5, 0.5);
    drawCircle(ctx, -3, -39 + bob, 1.5, '#fff', 0); drawCircle(ctx, 8, -39 + bob, 1.5, '#fff', 0);
    drawLine(ctx, -1, -30 + bob, 4, -30.5 + bob, OUTLINE, 1.8);
    drawRRect(ctx, 5, -24 + bob * 0.5, 17, 7, 3, '#8a8fa0', 2.5);
    drawCircle(ctx, 22, -20.5 + bob * 0.5, 3, '#7dff5a', 1.5);
    drawCircle(ctx, 6, -18 + bob * 0.5, 3.5, '#7cf07c', 2);
    ctx.restore();
    this.endDraw(ctx);
  }
}

/* ---------- Flying alien: hovers above and shoots down ---------- */
class Flyer extends Enemy {
  constructor(x, y, diff) { super(x, y, 40, 32, 2, 150, diff); this.homeY = y; this.offset = rand(-200, 200); }
  update(game) {
    this.t++;
    const p = game.player;
    const tx = p.cx + this.offset + Math.sin(this.t * 0.02) * 120 - this.w / 2;
    const ty = this.homeY + Math.sin(this.t * 0.05) * 35;
    this.x += clamp((tx - this.x) * 0.02, -2.5 - this.diff, 2.5 + this.diff);
    this.y += (ty - this.y) * 0.04;
    this.facing = p.cx < this.cx ? -1 : 1;
    if (--this.shootTimer <= 0 && Math.abs(p.cx - this.cx) < 450) {
      this.shootTimer = rand(110, 170) / this.diff;
      this.shoot(game, this.aim(game), this.bulletSpeed * 0.9, this.cx, this.y + this.h, { color: '#ff7af0' });
    }
  }
  draw(ctx, game) {
    this.beginDraw(ctx);
    const cx = this.cx, cy = this.cy, flap = Math.sin(this.t * 0.5) * 0.6;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(cx + s * 8, cy - 4); ctx.rotate(s * (-0.3 + flap));
      drawEllipse(ctx, s * 16, -4, 16, 7, 'rgba(210,180,255,0.75)', 2.5);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    drawCircle(ctx, cx, cy + 16 + Math.random() * 3, 5, '#ffa030', 0);
    ctx.globalCompositeOperation = 'source-over';
    drawEllipse(ctx, cx, cy + 3, 14, 13, '#9b59d9', 3);
    drawEllipse(ctx, cx, cy + 1, 9, 8, '#fff', 2);
    const a = Math.atan2(game.player.cy - cy, game.player.cx - cx);
    drawCircle(ctx, cx + Math.cos(a) * 3.5, cy + 1 + Math.sin(a) * 3.5, 4, '#d42020', 1.5);
    drawCircle(ctx, cx + Math.cos(a) * 3.5, cy + 1 + Math.sin(a) * 3.5, 1.8, '#111', 0);
    drawLine(ctx, cx - 6, cy - 10, cx - 9, cy - 18, OUTLINE, 2); drawLine(ctx, cx + 6, cy - 10, cx + 9, cy - 18, OUTLINE, 2);
    drawCircle(ctx, cx - 9, cy - 18, 2.5, '#ffef5a', 1.5); drawCircle(ctx, cx + 9, cy - 18, 2.5, '#ffef5a', 1.5);
    this.endDraw(ctx);
  }
}

/* ---------- UFO: large flying saucer ---------- */
class UFO extends Enemy {
  constructor(x, y, diff) { super(x, y, 96, 44, 14, 500, diff); this.homeY = y; this.bombTimer = 90; this.shootTimer = 160; }
  activate(game) { this.active = true; game.audio.play('alien'); }
  update(game) {
    this.t++;
    const p = game.player;
    const tx = p.cx + Math.sin(this.t * 0.012) * 220 - this.w / 2;
    this.vx = clamp((tx - this.x) * 0.02, -2.2 - this.diff * 0.4, 2.2 + this.diff * 0.4);
    this.x += this.vx;
    this.y = this.homeY + Math.sin(this.t * 0.04) * 10;
    if (--this.bombTimer <= 0 && Math.abs(p.cx - this.cx) < 260) {
      this.bombTimer = rand(70, 110) / this.diff;
      game.enemyShot(this.cx, this.y + this.h, this.vx * 0.5, 1, { kind: 'bomb', r: 8, gravity: 0.22, explode: 55, life: 300 });
    }
    if (--this.shootTimer <= 0) {
      this.shootTimer = rand(140, 200) / this.diff;
      const a = this.aim(game);
      for (const o of [-0.25, 0, 0.25]) this.shoot(game, a + o, this.bulletSpeed, this.cx, this.y + this.h - 6, { color: '#ffef5a' });
    }
  }
  draw(ctx) {
    this.beginDraw(ctx);
    const cx = this.cx, cy = this.cy, t = this.t;
    if (this.bombTimer < 25) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
      drawPoly(ctx, [cx - 16, cy + 14, cx + 16, cy + 14, cx + 34, cy + 60, cx - 34, cy + 60], '#9dff7a', 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      this.beginDraw(ctx);
    }
    drawEllipse(ctx, cx, cy - 6, 24, 20, 'rgba(160,240,255,0.55)', 3);
    drawEllipse(ctx, cx, cy - 6, 9, 8, '#7cf07c', 2);
    drawEllipse(ctx, cx - 3, cy - 7, 2.5, 3.5, '#111', 0); drawEllipse(ctx, cx + 4, cy - 7, 2.5, 3.5, '#111', 0);
    drawEllipse(ctx, cx, cy + 6, 48, 13, '#a3abbd', 3);
    drawEllipse(ctx, cx, cy + 3, 48, 5, '#c9d0de', 0);
    drawEllipse(ctx, cx, cy + 15, 18, 5, '#5d6577', 2);
    const cols = ['#ff4a4a', '#ffef5a', '#5affdc', '#ff5ad1'];
    for (let i = 0; i < 7; i++) drawCircle(ctx, cx - 36 + i * 12, cy + 8, 3, cols[(i + Math.floor(t / 6)) % 4], 1.5);
    this.endDraw(ctx);
  }
}

/* ---------- Brute: heavily armored alien with burst fire ---------- */
class Brute extends Enemy {
  constructor(x, y, diff) { super(x, y, 48, 64, 10, 300, diff); this.burst = 0; this.speed = 0.6 + diff * 0.2; }
  update(game) {
    this.t++;
    const p = game.player, dx = p.cx - this.cx;
    this.facing = dx < 0 ? -1 : 1;
    let mv = Math.abs(dx) > 220 ? this.facing * this.speed : 0;
    if (mv && !this.canWalk(game, Math.sign(mv))) mv = 0;
    this.vx = mv; this.moving = mv !== 0;
    this.physics(game);
    if (this.burst > 0) {
      if (this.t % 9 === 0) {
        this.burst--;
        const fx = this.cx + this.facing * 34, fy = this.y + 30;
        this.shoot(game, this.aim(game, fx, fy), this.bulletSpeed * 1.1, fx, fy, { color: '#ff8a3a', r: 7 });
      }
    } else if (--this.shootTimer <= 0 && Math.abs(dx) < 560) {
      this.shootTimer = rand(150, 220) / this.diff; this.burst = 3;
    }
  }
  draw(ctx) {
    this.beginDraw(ctx);
    const step = this.moving ? Math.sin(this.t * 0.18) * 4 : 0;
    ctx.save(); ctx.translate(this.cx, this.y + this.h); ctx.scale(this.facing, 1);
    drawRRect(ctx, -16 + step, -18, 13, 18, 4, '#8f2d2d', 3);
    drawRRect(ctx, 3 - step, -18, 13, 18, 4, '#8f2d2d', 3);
    drawRRect(ctx, -22, -48, 44, 34, 10, '#d94a3a', 3);
    drawRRect(ctx, -16, -44, 32, 22, 6, '#7b8496', 3);
    ctx.fillStyle = '#5d6577'; ctx.fillRect(-12, -37, 24, 3); ctx.fillRect(-12, -30, 24, 3);
    drawEllipse(ctx, 2, -56, 16, 12, '#e86a5a', 3);
    drawPoly(ctx, [-12, -62, -18, -74, -6, -66], '#f2e6c8', 2.5);
    drawPoly(ctx, [12, -64, 18, -76, 6, -67], '#f2e6c8', 2.5);
    drawRRect(ctx, -4, -60, 18, 6, 3, '#ffef5a', 2);
    drawRRect(ctx, 10, -36, 30, 12, 4, '#4f566a', 3);
    drawRRect(ctx, 36, -34, 7, 8, 2, '#ff8a3a', 2);
    ctx.restore();
    this.endDraw(ctx);
  }
}

/* ---------- Hopper: leaps at the player ---------- */
class Hopper extends Enemy {
  constructor(x, y, diff) { super(x, y, 34, 32, 3, 200, diff); this.hopTimer = rand(40, 90); }
  update(game) {
    this.t++;
    const p = game.player, dx = p.cx - this.cx;
    if (this.onGround) {
      this.vx = 0; this.facing = dx < 0 ? -1 : 1;
      if (--this.hopTimer <= 0 && Math.abs(dx) < 600) {
        this.hopTimer = rand(50, 90) / this.diff;
        this.vy = -9 - rand(0, 3); this.vx = this.facing * clamp(Math.abs(dx) / 40, 2, 4.5);
        game.audio.play('jump');
      }
    }
    this.physics(game);
    if (!this.onGround && this.vy > 0 && this.vy < 0.7 && Math.random() < 0.5)
      this.shoot(game, this.aim(game), this.bulletSpeed, this.cx, this.cy, { color: '#5affdc', r: 5 });
  }
  draw(ctx) {
    this.beginDraw(ctx);
    const squash = this.onGround ? 1 + Math.max(0, 20 - this.hopTimer) * 0.012 : 0.85;
    ctx.save(); ctx.translate(this.cx, this.y + this.h); ctx.scale(this.facing * squash, 2 - squash);
    drawEllipse(ctx, -12, -6, 9, 6, '#2c7fd6', 2.5); drawEllipse(ctx, 12, -6, 9, 6, '#2c7fd6', 2.5);
    drawEllipse(ctx, 0, -17, 17, 14, '#4aa8ff', 3);
    drawEllipse(ctx, 0, -12, 10, 6, '#bfe3ff', 0);
    for (const [ex, ey] of [[-8, -28], [0, -32], [8, -28]]) { drawCircle(ctx, ex, ey, 5, '#fff', 2); drawCircle(ctx, ex + 1.5, ey, 2, '#111', 0); }
    ctx.beginPath(); ctx.arc(4, -15, 6, 0.2, Math.PI - 0.6); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    this.endDraw(ctx);
  }
}

function createEnemy(type, x, y, diff) {
  switch (type) {
    case 'grunt': return new Grunt(x, y, diff);
    case 'flyer': return new Flyer(x, y, diff);
    case 'ufo': return new UFO(x, y, diff);
    case 'brute': return new Brute(x, y, diff);
    case 'hopper': return new Hopper(x, y, diff);
  }
  throw new Error('Unknown enemy ' + type);
}

/* ===========================================================
   Bosses
   =========================================================== */
class Boss extends Enemy {
  constructor(x, y, w, h, hp, name, game) {
    super(x, y, w, h, hp, 5000, game.level.def.diff);
    this.isBoss = true; this.name = name; this.active = true;
    this.dying = 0; this.atkTimer = 140; this.atkIdx = 0; this.introT = 140; this.st = null;
    this.arenaX = game.level.arenaStart;
  }
  activate() { this.active = true; }
  get phase2() { return this.hp < this.maxHp * 0.5; }
  hit(dmg, game) {
    if (this.dying || this.dead || this.introT > 40) return;
    this.hp -= dmg; this.flash = 4;
    if (this.hp <= 0) { this.hp = 0; this.dying = 150; game.onBossDying(this); }
    else if (Math.random() < 0.35) game.audio.play('hit');
  }
  update(game) {
    this.t++;
    if (this.introT > 0) this.introT--;
    if (this.dying > 0) {
      this.dying--;
      if (this.dying % 7 === 0) {
        game.explode(this.x + Math.random() * this.w, this.y + Math.random() * this.h, 1.2);
        game.shake = Math.max(game.shake, 8);
      }
      if (this.dying === 0) { this.dead = true; game.explode(this.cx, this.cy, 4); game.onBossDefeated(this); }
      return;
    }
    this.behave(game);
  }
  minions(game, cls) { return game.level.enemies.filter(e => !e.dead && e instanceof cls).length; }
  spawnMinion(game, e) { e.active = true; game.level.enemies.push(e); game.particles.push(new Particle(e.cx, e.cy, 0, 0, 25, '#7dff5a', 50, { kind: 'ring', gravity: 0 })); }
  draw(ctx, game) {
    this.beginDraw(ctx);
    if (this.dying) { ctx.save(); ctx.translate(rand(-3, 3), rand(-3, 3)); }
    this.drawBody(ctx, game);
    if (this.dying) ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/* --- Level 1: Zorg the Overlord - a giant brain in a hover-pod --- */
class OverlordBoss extends Boss {
  constructor(game) {
    super(game.level.arenaStart + 480 - 65, -200, 130, 110, 70, 'ZORG THE OVERLORD', game);
  }
  behave(game) {
    const spd = this.phase2 ? 0.02 : 0.013;
    const tx = this.arenaX + 480 + Math.sin(this.t * spd) * 320 - this.w / 2;
    const ty = this.introT > 0 ? lerp(110, -200, this.introT / 140) : 105 + Math.sin(this.t * 0.035) * 35;
    this.x += (tx - this.x) * 0.05; this.y += (ty - this.y) * 0.08;
    if (this.introT > 0 || --this.atkTimer > 0) return;
    const pats = this.phase2 ? ['spread', 'ring', 'summon', 'rain', 'spread', 'ring'] : ['spread', 'rain', 'spread', 'summon'];
    const pat = pats[this.atkIdx++ % pats.length];
    const sp = this.bulletSpeed;
    switch (pat) {
      case 'spread': {
        const n = this.phase2 ? 7 : 5, a = this.aim(game);
        for (let i = 0; i < n; i++) this.shoot(game, a + (i - (n - 1) / 2) * 0.17, sp, this.cx, this.cy + 10, { color: '#ff7af0', r: 7 });
        this.atkTimer = this.phase2 ? 65 : 95; break;
      }
      case 'ring': {
        for (let i = 0; i < 16; i++) this.shoot(game, i / 16 * TAU + this.t * 0.1, sp * 0.8, this.cx, this.cy, { color: '#ffef5a' });
        this.atkTimer = 80; break;
      }
      case 'summon': {
        if (this.minions(game, Grunt) < 3) {
          this.spawnMinion(game, new Grunt(this.arenaX + 60, 80, this.diff));
          this.spawnMinion(game, new Grunt(this.arenaX + 870, 80, this.diff));
          game.audio.play('alien');
        }
        this.atkTimer = 90; break;
      }
      case 'rain': {
        for (let i = 0; i < 9; i++) {
          const x = this.arenaX + 50 + i * 108 + rand(-20, 20);
          game.enemyShot(x, -20 - i * 30, 0, 3.2, { color: '#7dff5a', r: 9, noCollide: false });
        }
        game.audio.play('warn');
        this.atkTimer = 110; break;
      }
    }
  }
  drawBody(ctx, game) {
    const cx = this.cx, cy = this.cy, t = this.t;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const bx = cx - 40 + i * 20;
      ctx.beginPath(); ctx.moveTo(bx, cy + 30);
      for (let k = 1; k <= 4; k++) ctx.lineTo(bx + Math.sin(t * 0.08 + i + k) * 9, cy + 30 + k * 12);
      ctx.lineWidth = 10; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#8d4bbd'; ctx.stroke();
    }
    drawEllipse(ctx, cx, cy + 24, 64, 19, '#8f97a8', 3.5);
    drawEllipse(ctx, cx, cy + 20, 60, 8, '#b5bccb', 0);
    for (let i = 0; i < 6; i++) drawCircle(ctx, cx - 45 + i * 18, cy + 28, 4, (i + Math.floor(t / 8)) % 2 ? '#ff4a4a' : '#ffef5a', 1.5);
    ctx.beginPath(); ctx.arc(cx, cy + 16, 50, Math.PI, 0); ctx.closePath();
    fillStroke(ctx, 'rgba(170,230,255,0.3)', 3);
    const pulse = Math.sin(t * 0.1) * 1.5;
    drawBlob(ctx, [[cx - 20, cy - 2, 19 + pulse], [cx + 20, cy - 2, 19 + pulse], [cx, cy - 16, 22 + pulse], [cx - 8, cy + 6, 17], [cx + 10, cy + 6, 17]], this.phase2 ? '#ff7ab0' : '#ffa3cc', 3);
    ctx.strokeStyle = '#d0608f'; ctx.lineWidth = 2.5;
    for (const [x, y, r, a0] of [[-22, -6, 9, 0.5], [18, -8, 10, 2.5], [0, -24, 9, 4], [-6, 8, 7, 1], [22, 8, 6, 3]]) {
      ctx.beginPath(); ctx.arc(cx + x, cy + y, r, a0, a0 + 2.6); ctx.stroke();
    }
    drawEllipse(ctx, cx, cy - 2, 15, 12, '#fff', 3);
    const a = Math.atan2(game.player.cy - cy, game.player.cx - cx);
    drawCircle(ctx, cx + Math.cos(a) * 5, cy - 2 + Math.sin(a) * 4, 6, '#d42020', 2);
    drawCircle(ctx, cx + Math.cos(a) * 6, cy - 2 + Math.sin(a) * 5, 2.5, '#111', 0);
    drawLine(ctx, cx - 18, cy - 20, cx + 2, cy - 12, OUTLINE, 5);
    drawLine(ctx, cx + 18, cy - 20, cx - 2, cy - 12, OUTLINE, 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy + 16, 42, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
  }
}

/* --- Level 2: The Mothership - giant saucer with a death beam --- */
class MothershipBoss extends Boss {
  constructor(game) {
    super(game.level.arenaStart + 480 - 135, -200, 270, 96, 110, 'THE MOTHERSHIP', game);
    this.beamX = 0;
  }
  behave(game) {
    const p = game.player;
    if (this.introT > 0) { this.y = lerp(55, -200, this.introT / 140); return; }
    if (!this.st) {
      const tx = this.arenaX + 480 + Math.sin(this.t * (this.phase2 ? 0.013 : 0.009)) * 280 - this.w / 2;
      this.x += (tx - this.x) * 0.04;
      this.y = 55 + Math.sin(this.t * 0.03) * 10;
      if (--this.atkTimer <= 0) {
        const pats = this.phase2 ? ['beam', 'bombs', 'spread', 'flyers', 'beam', 'spread'] : ['bombs', 'spread', 'beam', 'flyers'];
        this.st = { n: pats[this.atkIdx++ % pats.length], t: 0 };
      }
      return;
    }
    const st = this.st; st.t++;
    const done = () => { this.st = null; this.atkTimer = this.phase2 ? 45 : 75; };
    switch (st.n) {
      case 'bombs':
        this.x += Math.sin(this.t * 0.03) * 2;
        if (st.t % (this.phase2 ? 8 : 11) === 0)
          game.enemyShot(this.cx + rand(-100, 100), this.y + this.h - 10, rand(-1.5, 1.5), 0, { kind: 'bomb', r: 9, gravity: 0.2, explode: 60, life: 300 });
        if (st.t > 70) done();
        break;
      case 'spread':
        if (st.t % 16 === 0) {
          for (const tx of [-90, 90]) {
            const fx = this.cx + tx, fy = this.y + this.h - 12, a = this.aim(game, fx, fy);
            for (const o of [-0.2, 0, 0.2]) this.shoot(game, a + o, this.bulletSpeed, fx, fy, { color: '#ffef5a' });
          }
        }
        if (st.t > 50) done();
        break;
      case 'flyers':
        if (st.t === 10 && this.minions(game, Flyer) < 3) {
          this.spawnMinion(game, new Flyer(this.cx - 60, this.y + 60, this.diff));
          this.spawnMinion(game, new Flyer(this.cx + 30, this.y + 60, this.diff));
          game.audio.play('alien');
        }
        if (st.t > 30) done();
        break;
      case 'beam':
        if (st.t < 45) this.x += clamp(p.cx - this.cx, -6, 6);
        if (st.t === 45) { this.beamX = this.cx; game.audio.play('warn'); }
        if (st.t === 85) { game.audio.play('beam'); game.shake = 6; }
        if (st.t > 85 && st.t < 150) {
          if (Math.abs(p.cx - this.beamX) < 40) game.hurtPlayer(1, this.beamX);
          if (st.t % 3 === 0) game.particles.push(new Particle(this.beamX + rand(-35, 35), GROUND_Y, rand(-2, 2), rand(-6, -2), 25, '#cfff7a', 5, { glow: true }));
        }
        if (st.t > 160) done();
        break;
    }
  }
  drawBody(ctx, game) {
    const cx = this.cx, cy = this.cy, t = this.t;
    if (this.st && this.st.n === 'beam' && this.st.t >= 45 && this.st.t <= 150) {
      const top = this.y + this.h - 10, bx = this.beamX;
      ctx.save();
      if (this.st.t < 85) {
        ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 2;
        drawLine(ctx, bx - 40, top, bx - 40, GROUND_Y, 'rgba(255,60,60,0.8)', 3);
        drawLine(ctx, bx + 40, top, bx + 40, GROUND_Y, 'rgba(255,60,60,0.8)', 3);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const wv = 40 + Math.sin(t * 0.8) * 4;
        const g = ctx.createLinearGradient(bx - wv, 0, bx + wv, 0);
        g.addColorStop(0, 'rgba(160,255,90,0)'); g.addColorStop(0.3, 'rgba(160,255,90,0.7)');
        g.addColorStop(0.5, 'rgba(255,255,220,0.95)'); g.addColorStop(0.7, 'rgba(160,255,90,0.7)'); g.addColorStop(1, 'rgba(160,255,90,0)');
        ctx.fillStyle = g; ctx.fillRect(bx - wv, top, wv * 2, GROUND_Y - top);
      }
      ctx.restore();
      this.beginDraw(ctx);
    }
    drawEllipse(ctx, cx, cy - 14, 64, 40, 'rgba(160,255,200,0.4)', 3.5);
    for (const ax of [-28, 0, 28]) {
      const bob = Math.sin(t * 0.1 + ax) * 2;
      drawEllipse(ctx, cx + ax, cy - 20 + bob, 9, 8, '#7cf07c', 2);
      drawCircle(ctx, cx + ax - 3, cy - 21 + bob, 2, '#111', 0); drawCircle(ctx, cx + ax + 3, cy - 21 + bob, 2, '#111', 0);
    }
    drawEllipse(ctx, cx, cy + 10, 135, 32, '#7d8597', 4);
    drawEllipse(ctx, cx, cy + 4, 132, 13, '#a3abbd', 0);
    drawEllipse(ctx, cx, cy + 10, 135, 32, null, 4);
    const cols = ['#ff4a4a', '#ffef5a', '#5affdc', '#ff5ad1', '#7dff5a'];
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.08 + i / 13 * 0.84);
      drawCircle(ctx, cx - Math.cos(a) * 118, cy + 12 + Math.sin(a) * 14, 4.5, cols[(i + Math.floor(t / 5)) % 5], 1.5);
    }
    for (const tx of [-90, 90]) drawRRect(ctx, cx + tx - 9, cy + 30, 18, 14, 4, '#4f566a', 3);
    const hatch = this.st && this.st.n === 'beam' && this.st.t >= 45 ? '#eaff9a' : '#5d6577';
    drawEllipse(ctx, cx, cy + 36, 36, 9, hatch, 3);
  }
}

/* --- Level 3: Mecha-Zorg - a stomping walker with Big Ben's stolen clock --- */
class MechaBoss extends Boss {
  constructor(game) {
    super(game.level.arenaStart + 740, -300, 124, 176, 150, 'MECHA-ZORG', game);
    this.landed = false;
  }
  behave(game) {
    const p = game.player;
    const minX = this.arenaX + 10, maxX = this.arenaX + W - 10 - this.w;
    if (!this.landed) {
      this.vx = 0; this.physics(game);
      if (this.onGround) { this.landed = true; this.stompFx(game); }
      return;
    }
    if (this.introT > 0) { this.physics(game); return; }
    if (!this.st) {
      this.facing = p.cx < this.cx ? -1 : 1;
      this.vx = Math.abs(p.cx - this.cx) > 160 ? this.facing * (this.phase2 ? 1.6 : 1) : 0;
      this.walking = this.vx !== 0;
      if (--this.atkTimer <= 0) {
        const pats = this.phase2 ? ['stomp', 'charge', 'cannon', 'missiles', 'charge', 'stomp'] : ['cannon', 'stomp', 'missiles', 'cannon', 'stomp'];
        this.st = { n: pats[this.atkIdx++ % pats.length], t: 0 };
        this.vx = 0;
      }
    } else {
      const st = this.st; st.t++;
      const done = (w = 0) => { this.st = null; this.atkTimer = (this.phase2 ? 40 : 70) + w; this.contactDmg = 1; };
      switch (st.n) {
        case 'stomp':
          if (st.t === 1) { this.vy = -14; this.vx = clamp((p.cx - this.cx) / 50, -4, 4); }
          if (st.t > 5 && this.onGround) { this.vx = 0; this.stompFx(game, true); done(10); }
          break;
        case 'cannon': {
          this.facing = p.cx < this.cx ? -1 : 1;
          const n = this.phase2 ? 7 : 5;
          if (st.t % 9 === 0 && st.t <= n * 9) {
            const fx = this.cx + this.facing * 80, fy = this.y + 82;
            this.shoot(game, this.aim(game, fx, fy), this.bulletSpeed * 1.3, fx, fy, { color: '#ff4a4a', r: 7 });
          }
          if (st.t > n * 9 + 15) done();
          break;
        }
        case 'missiles':
          if (st.t % 12 === 0 && st.t <= 60) {
            const fx = this.cx - this.facing * 50, fy = this.y + 20;
            game.enemyShot(fx, fy, (p.cx - fx) / 70 + rand(-1.5, 1.5), rand(-12, -9), { kind: 'missile', r: 7, gravity: 0.3, explode: 50, life: 300 });
          }
          if (st.t > 75) done();
          break;
        case 'charge':
          if (st.t === 1) { this.facing = p.cx < this.cx ? -1 : 1; game.audio.play('warn'); }
          if (st.t < 40) this.vx = 0;
          else {
            this.vx = this.facing * 9; this.contactDmg = 2;
            if (st.t % 4 === 0) game.dust(this.cx, this.y + this.h, 3);
            if (this.x <= minX + 2 || this.x >= maxX - 2) { game.shake = 14; game.audio.play('stomp'); done(30); }
          }
          break;
      }
    }
    this.physics(game);
    this.x = clamp(this.x, minX, maxX);
  }
  stompFx(game, waves) {
    game.shake = 16; game.audio.play('stomp'); game.dust(this.cx, this.y + this.h, 16);
    if (waves) for (const d of [-1, 1]) {
      game.addProjectile(new Projectile(this.cx + d * 60, GROUND_Y - 16, d * (5 + this.diff), 0,
        { owner: 'enemy', kind: 'wave', r: 16, life: 150, noCollide: true, damage: 1 }));
    }
  }
  drawBody(ctx, game) {
    const t = this.t, step = this.walking && !this.st ? Math.sin(t * 0.12) : 0;
    ctx.save(); ctx.translate(this.cx, this.y + this.h); ctx.scale(this.facing, 1);
    for (const [lx, ph] of [[-30, step], [30, -step]]) {
      drawRRect(ctx, lx - 10, -70 - ph * 4, 20, 40, 6, '#57627e', 3.5);
      drawRRect(ctx, lx - 8 + ph * 6, -36, 16, 30, 5, '#6c7a96', 3.5);
      drawRRect(ctx, lx - 20 + ph * 6, -10, 40, 12, 5, '#3e4660', 3.5);
      drawCircle(ctx, lx, -70 - ph * 4, 8, '#9aa6bf', 3);
    }
    drawRRect(ctx, -58, -82, 22, 40, 6, '#4f566a', 3.5);
    for (let i = 0; i < 3; i++) drawCircle(ctx, -47, -74 + i * 12, 4, '#ff4a4a', 2);
    drawRRect(ctx, -50, -140, 100, 70, 16, this.phase2 ? '#7d6a8a' : '#6c7a96', 4);
    drawCircle(ctx, 0, -100, 17, '#f4ecd0', 3);
    ctx.save(); ctx.translate(0, -100);
    drawLine(ctx, 0, 0, Math.cos(t * 0.05) * 11, Math.sin(t * 0.05) * 11, OUTLINE, 2.5);
    drawLine(ctx, 0, 0, Math.cos(t * 0.005) * 7, Math.sin(t * 0.005) * 7, OUTLINE, 3);
    ctx.restore();
    drawCircle(ctx, 0, -100, 2.5, OUTLINE, 0);
    ctx.beginPath(); ctx.arc(0, -138, 34, Math.PI, 0); ctx.closePath(); fillStroke(ctx, 'rgba(160,240,255,0.45)', 3.5);
    drawEllipse(ctx, 4, -150, 14, 12, '#7cf07c', 2.5);
    drawEllipse(ctx, 0, -151, 3.5, 5, '#111', 0, -0.4); drawEllipse(ctx, 10, -151, 3.5, 5, '#111', 0, 0.4);
    drawLine(ctx, -6, -160, 6, -156, OUTLINE, 2.5);
    const aimDy = clamp((game.player.cy - (this.y + 82)) / 200, -0.5, 0.5) * this.facing;
    ctx.save(); ctx.translate(46, -96); ctx.rotate(aimDy * this.facing);
    drawRRect(ctx, -10, -14, 28, 28, 8, '#57627e', 3.5);
    drawRRect(ctx, 14, -9, 36, 18, 5, '#3e4660', 3.5);
    drawRRect(ctx, 46, -11, 8, 22, 3, this.st && this.st.n === 'cannon' ? '#ff4a4a' : '#9aa6bf', 3);
    ctx.restore();
    if (this.st && this.st.n === 'charge' && this.st.t < 40 && this.st.t % 6 < 3) {
      ctx.globalAlpha = 0.4; drawRRect(ctx, -50, -140, 100, 70, 16, '#ff3030', 0); ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (this.phase2 && t % 6 === 0) game.particles.push(new Particle(this.cx + rand(-40, 40), this.y + 40, rand(-0.5, 0.5), -1, 40, '#555', 7, { kind: 'smoke', gravity: -0.02 }));
  }
}
