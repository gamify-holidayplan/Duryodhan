'use strict';
/* ===========================================================
   Game - state machine, requestAnimationFrame loop, collisions,
   camera, HUD and menu screens
   =========================================================== */

const QUIPS = {
  weapon: ['Mitron, taste my laser!', 'Aatmanirbhar firepower!', 'Make in India technology!', 'Ab ki baar, full laser vaar!'],
  boss: ['Mitron! India will not bow down!', 'Direct surgical strike on these saucers!', 'Alien invasion cancelled!'],
  kill: ['Mitron, victory is ours!', 'Swachh Bharat - aliens cleaned!', 'Chak de Phatte!', 'Namaste!'],
  coin: ['Digital India, Rupee power!', 'Every Rupee counts!', 'Treasury strengthened!'],
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = new AudioManager();
    this.input = new Input(canvas, () => this.audio.init());
    this.state = 'title';
    this.t = 0; this.stateT = 0;
    this.levelIdx = 0; this.score = 0; this.lives = 3;
    this.persistWeapons = ['laser'];
    this.highScore = +(localStorage.getItem('mad_highscore') || localStorage.getItem('oad_highscore') || 0);
    this.camX = 0; this.shake = 0; this.energyFlash = 0;
    this.particles = []; this.texts = []; this.projectiles = [];
    this.titleCam = 0;
    this.audio.playSong('title');
    this.last = performance.now(); this.acc = 0;
    this.rupeeCoins = 0;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  get coins() { return this.rupeeCoins; }
  set coins(v) { this.rupeeCoins = v; }

  /* ---------- main loop: fixed 60Hz update, render every frame ---------- */
  loop(now) {
    let dt = now - this.last; this.last = now;
    if (dt > 100) dt = 100;
    this.acc += dt;
    const step = 1000 / 60;
    while (this.acc >= step) { this.update(); this.input.endFrame(); this.acc -= step; }
    this.render();
    requestAnimationFrame(this.loop);
  }

  setState(s) { this.state = s; this.stateT = 0; }

  /* ---------- lifecycle ---------- */
  startGame() {
    this.score = 0; this.lives = 3; this.levelIdx = 0; this.persistWeapons = ['laser'];
    this.audio.play('start');
    this.startLevel(0);
  }

  startLevel(idx) {
    this.levelIdx = idx;
    this.level = buildLevel(idx);
    this.player = new Player(120, GROUND_Y - 60);
    this.player.weapons = this.persistWeapons.slice();
    this.player.weaponIdx = this.player.weapons.length - 1;
    this.projectiles = []; this.particles = []; this.texts = [];
    this.camX = 0; this.shake = 0;
    this.boss = null; this.bossTriggered = false; this.arenaLocked = false; this.bossBanner = 0;
    this.rupeeCoins = 0; this.kills = 0;
    this.levelStartScore = this.score;
    this.respawnTimer = 0; this.arenaEnergyTimer = 600;
    this.audio.playSong(this.level.def.song);
    this.setState('intro');
  }

  /* ---------- helpers used by entities ---------- */
  mouseWorld() { return { x: this.input.mouse.x + this.camX, y: this.input.mouse.y }; }
  addProjectile(p) { this.projectiles.push(p); }
  enemyShot(x, y, vx, vy, o = {}) {
    this.projectiles.push(new Projectile(x, y, vx, vy, Object.assign({ owner: 'enemy', kind: 'orb', r: 6, color: '#7dff5a', life: 300 }, o)));
    if (o.kind !== 'wave') this.audio.play('enemyShoot');
  }
  addText(x, y, text, color = '#fff', size = 22) { this.texts.push(new FloatText(x, y, text, color, size)); }
  addScore(n, x, y, color = '#ffe14a') { this.score += n; if (x !== undefined) this.addText(x, y, '+' + n, color, 20); }

  sparks(x, y, color, n = 6) {
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, rand(-3, 3), rand(-3, 3), rand(10, 20), color, rand(2, 4), { glow: true, gravity: 0.05 }));
  }
  dust(x, y, n = 5) {
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x + rand(-10, 10), y - 2, rand(-1.5, 1.5), rand(-1.2, -0.2), rand(18, 30), 'rgba(230,220,200,0.9)', rand(4, 7), { kind: 'smoke', gravity: 0 }));
  }
  explode(x, y, size = 1) {
    const n = Math.floor(14 * size);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(1, 5) * Math.sqrt(size);
      this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(20, 40), pick(['#ffef5a', '#ffa020', '#ff4a20', '#fff']), rand(4, 8) * Math.sqrt(size), { glow: true, gravity: 0.05 }));
    }
    for (let i = 0; i < n / 2; i++) this.particles.push(new Particle(x + rand(-10, 10) * size, y + rand(-10, 10) * size, rand(-1, 1), rand(-1.5, 0), rand(30, 55), '#666', rand(6, 12) * Math.sqrt(size), { kind: 'smoke', gravity: -0.03 }));
    for (let i = 0; i < n / 3; i++) this.particles.push(new Particle(x, y, rand(-5, 5), rand(-8, -2), rand(30, 50), pick(['#7cf07c', '#a3abbd', '#5d6577']), rand(3, 6), { kind: 'debris', gravity: 0.3, drag: 0.99 }));
    this.particles.push(new Particle(x, y, 0, 0, 18, '#fff', 40 * size, { kind: 'ring', gravity: 0 }));
    this.shake = Math.max(this.shake, 4 * size);
  }
  detonate(p) {
    const R = p.explode;
    this.explode(p.cx, p.cy, R / 50);
    this.audio.play('explode');
    if (p.owner === 'player') {
      for (const e of this.level.enemies) {
        if (e.dead || !e.active) continue;
        if (dist(p.cx, p.cy, e.cx, e.cy) < R + Math.max(e.w, e.h) / 2) e.hit(3, this);
      }
    } else if (!this.player.hidden && dist(p.cx, p.cy, this.player.cx, this.player.cy) < R) {
      this.hurtPlayer(1, p.cx);
    }
  }

  hurtPlayer(dmg, fromX) {
    const pl = this.player;
    if (pl.invuln > 0 || pl.hidden || this.state !== 'play' || pl.frozen) return;
    pl.hp -= dmg; pl.invuln = 90;
    pl.vx = (pl.cx < fromX ? -1 : 1) * 6; pl.vy = -6;
    this.audio.play('hurt'); this.shake = Math.max(this.shake, 7);
    this.sparks(pl.cx, pl.cy, '#ff5050', 10);
    if (pl.hp <= 0) this.loseLife();
  }
  playerFell() {
    const pl = this.player;
    if (pl.hidden) return;
    pl.hp -= 2;
    this.audio.play('hurt');
    if (pl.hp <= 0) { this.loseLife(); return; }
    this.respawnAt(pl.lastSafe);
    pl.say("Whoa! Let's try that again.", 90);
  }
  loseLife() {
    const pl = this.player;
    this.explode(pl.cx, pl.cy, 1.5); this.audio.play('explode');
    pl.hidden = true; pl.vx = pl.vy = 0;
    this.lives--;
    this.respawnTimer = 80;
  }
  respawnAt(pos) {
    const pl = this.player;
    pl.x = pos.x; pl.y = pos.y; pl.vx = pl.vy = 0;
    pl.invuln = 120; pl.hidden = false;
  }

  onEnemyKilled(e) {
    this.kills++;
    this.addScore(e.score, e.cx, e.y);
    this.explode(e.cx, e.cy, e instanceof UFO ? 2 : 1);
    this.audio.play(e instanceof UFO ? 'bigexplode' : 'explode');
    if (e instanceof UFO) { this.level.items.push(Object.assign(new Item(e.cx, e.cy, 'energy'), { falling: true })); }
    else if (Math.random() < 0.08) this.level.items.push(Object.assign(new Item(e.cx, e.cy, 'coin'), { falling: true, bonus: true }));
    if (Math.random() < 0.12 && !this.player.speech) this.player.say(pick(QUIPS.kill), 70);
  }
  onBossDying() {
    this.audio.play('bigexplode');
    for (const e of this.level.enemies) if (!e.isBoss && !e.dead && e.active) { e.dead = true; this.explode(e.cx, e.cy); }
    this.projectiles = this.projectiles.filter(p => p.owner === 'player');
  }
  onBossDefeated(b) {
    this.addScore(b.score, b.cx, b.cy, '#ff8a3a');
    this.audio.play('bigexplode'); this.audio.play('flag');
    this.audio.playSong(this.level.def.song);
    this.level.flag.active = true;
    this.player.say('Mitron, victory is near! Now to the flagpole!', 160);
    this.bossBanner = 0;
  }

  completeLevel() {
    const pl = this.player, L = this.level;
    L.flag.captured = true; pl.frozen = true; pl.invuln = 9999;
    this.audio.play('flag'); this.audio.playSong('victory');
    const totalRupees = L.totalRupeeCoins !== undefined ? L.totalRupeeCoins : L.totalCoins;
    const perfect = this.rupeeCoins >= totalRupees;
    this.tally = {
      rupeeCoins: this.rupeeCoins * 100, coins: this.rupeeCoins * 100, perfect: perfect ? 5000 : 0,
      energy: Math.floor(pl.energy) * 10, health: pl.hp * 200,
    };
    this.score += this.tally.rupeeCoins + this.tally.perfect + this.tally.energy + this.tally.health;
    this.persistWeapons = pl.weapons.slice();
    this.saveHigh();
    pl.say(pick(['Mitron, we have saved India and the world!', 'Aatmanirbhar Bharat prevails!', 'Jai Hind! Vande Mataram!']), 400);
    this.setState('complete');
  }
  saveHigh() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('mad_highscore', this.score);
      localStorage.setItem('oad_highscore', this.score);
    }
  }

  /* ===================== UPDATE ===================== */
  update() {
    this.t++; this.stateT++;
    const I = this.input;
    if (I.hit('KeyM')) this.audio.toggleMute();

    switch (this.state) {
      case 'title':
        this.titleCam += 1.2;
        if (I.hit('Enter', 'Space') || I.mouse.clicked) { this.audio.init(); this.startGame(); }
        break;
      case 'intro':
        this.updateWorldAmbient();
        if (this.stateT > 170 || (this.stateT > 40 && I.anyHit())) {
          this.setState('play');
          this.player.say(this.level.def.intro, 200);
        }
        break;
      case 'play':
        if (I.hit('KeyP', 'Escape')) { this.setState('paused'); break; }
        this.updatePlay();
        break;
      case 'paused':
        if (I.hit('KeyP', 'Escape', 'Enter')) this.setState('play');
        if (I.hit('KeyQ')) { this.audio.playSong('title'); this.setState('title'); }
        break;
      case 'complete':
        this.updateWorldAmbient();
        this.player.update(this);
        if (this.stateT > 90 && (I.hit('Enter', 'Space') || I.mouse.clicked)) {
          if (this.levelIdx + 1 < LEVEL_DEFS.length) this.startLevel(this.levelIdx + 1);
          else { this.saveHigh(); this.audio.playSong('victory'); this.setState('victory'); }
        }
        break;
      case 'gameover':
        if (this.stateT > 60 && (I.hit('Enter', 'Space') || I.mouse.clicked)) {
          this.lives = 3; this.score = this.levelStartScore;
          this.startLevel(this.levelIdx);
        }
        if (I.hit('Escape')) { this.audio.playSong('title'); this.setState('title'); }
        break;
      case 'victory':
        if (this.t % 25 === 0) this.firework();
        this.particles.forEach(p => p.update()); this.particles = this.particles.filter(p => !p.dead);
        if (this.stateT > 120 && (I.hit('Enter', 'Space') || I.mouse.clicked)) { this.audio.playSong('title'); this.setState('title'); }
        break;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.6);
    if (this.energyFlash > 0) this.energyFlash--;
  }

  updateWorldAmbient() {
    for (const p of this.level.platforms) p.update();
    for (const it of this.level.items) it.update(this);
    this.level.flag.update();
    this.particles.forEach(p => p.update()); this.particles = this.particles.filter(p => !p.dead);
    this.texts.forEach(t => t.update()); this.texts = this.texts.filter(t => !t.dead);
  }

  updatePlay() {
    const L = this.level, pl = this.player;

    // platforms (+ carry the player on moving ones)
    for (const p of L.platforms) p.update();
    if (pl.onGround && pl.standingOn && pl.standingOn.kind === 'moving') { pl.x += pl.standingOn.dx; pl.y += pl.standingOn.dy; }

    // respawn handling
    if (this.respawnTimer > 0) {
      if (--this.respawnTimer === 0) {
        if (this.lives <= 0) { this.saveHigh(); this.audio.play('gameover'); this.audio.playSong(null); this.setState('gameover'); return; }
        pl.hp = pl.maxHp; pl.energy = Math.max(pl.energy, 60);
        this.respawnAt(pl.lastSafe);
        pl.say(pick(["I'm not going anywhere!", 'Four more years!', 'Back in action!']), 100);
      }
    } else pl.update(this);

    // camera
    let target = pl.cx - W / 2 + pl.facing * 70;
    target = clamp(target, 0, L.width - W);
    if (this.arenaLocked) target = L.arenaStart;
    this.camX += (target - this.camX) * 0.1;

    // boss trigger
    if (!this.bossTriggered && pl.x > L.arenaStart + 160) {
      this.bossTriggered = true; this.arenaLocked = true;
      const B = { overlord: OverlordBoss, mothership: MothershipBoss, mecha: MechaBoss }[L.def.boss];
      this.boss = new B(this);
      L.enemies.push(this.boss);
      this.bossBanner = 200;
      this.audio.playSong('boss'); this.audio.play('boss');
      pl.say(pick(QUIPS.boss), 150);
    }
    if (this.bossBanner > 0) this.bossBanner--;

    // energy drops during boss fight
    if (this.boss && !this.boss.dead && !this.boss.dying && --this.arenaEnergyTimer <= 0) {
      this.arenaEnergyTimer = 540;
      if (!L.items.some(i => i.kind === 'energy')) {
        L.items.push(Object.assign(new Item(L.arenaStart + rand(120, W - 120), -20, 'energy'), { falling: true }));
        this.addText(L.arenaStart + W / 2, 170, 'SUPPLY DROP!', '#7dffb0', 26);
      }
    }

    // enemies
    for (let i = 0; i < L.enemies.length; i++) {
      const e = L.enemies[i];
      if (e.dead) continue;
      if (!e.active) {
        if (e.x < this.camX + W + 60 && e.x + e.w > this.camX - 100) e.activate(this);
        else continue;
      }
      if (e.flash > 0) e.flash--;
      e.update(this);
    }
    L.enemies = L.enemies.filter(e => !e.dead);
    if (this.boss && this.boss.dead) this.boss = null;

    // projectiles
    for (const p of this.projectiles) p.update(this);
    for (const p of this.projectiles) {
      if (p.dead) continue;
      if (p.owner === 'player') {
        for (const e of L.enemies) {
          if (e.dead || !e.active || e.dying) continue;
          if (p.pierce && p.hitSet.has(e)) continue;
          if (overlap(p, e)) {
            e.hit(p.damage, this);
            this.sparks(p.cx, p.cy, p.color, 5);
            if (p.pierce) p.hitSet.add(e);
            else { p.dead = true; if (p.explode) this.detonate(p); break; }
          }
        }
      } else if (!pl.hidden && overlap(p, pl)) {
        if (p.explode) { p.dead = true; this.detonate(p); }
        else { if (p.kind !== 'wave') p.dead = true; this.hurtPlayer(p.damage, p.cx); }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);

    if (!pl.hidden) {
      // enemy contact
      for (const e of L.enemies) {
        if (e.active && !e.dead && !e.dying && overlap(e, pl)) this.hurtPlayer(e.contactDmg || 1, e.cx);
      }
      // hazards
      for (const hz of L.hazards) {
        if (overlap({ x: hz.x + 4, y: hz.y + 6, w: hz.w - 8, h: hz.h }, pl)) {
          if (pl.invuln <= 0) { this.hurtPlayer(1, pl.cx - pl.vx); pl.vy = -10; }
        }
      }
      // items
      for (const it of L.items) {
        if (!it.dead && overlap(it, pl)) this.collect(it);
      }
      // flag
      if (L.flag.active && L.flag.appear >= 1 && overlap(L.flag.rect, pl)) this.completeLevel();
    }
    for (const it of L.items) it.update(this);
    L.items = L.items.filter(i => !i.dead);
    L.flag.update();

    this.particles.forEach(p => p.update()); this.particles = this.particles.filter(p => !p.dead);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    this.texts.forEach(t => t.update()); this.texts = this.texts.filter(t => !t.dead);
  }

  collect(it) {
    const pl = this.player;
    it.dead = true;
    switch (it.kind) {
      case 'coin': {
        if (!it.bonus) this.rupeeCoins++;
        this.addScore(250, it.cx, it.y, '#ffd84a');
        this.audio.play('coin');
        this.sparks(it.cx, it.cy, '#ffe14a', 8);
        const totalRupees = this.level.totalRupeeCoins !== undefined ? this.level.totalRupeeCoins : this.level.totalCoins;
        if (!it.bonus && this.rupeeCoins === totalRupees) {
          this.addText(pl.cx, pl.y - 50, 'ALL RUPEES!', '#ffd84a', 30);
          pl.say(pick(QUIPS.coin), 90);
        }
        break;
      }
      case 'energy':
        pl.energy = pl.maxEnergy;
        this.addText(it.cx, it.y, 'Full energy!', '#7dffb0', 26);
        this.audio.play('energy');
        this.particles.push(new Particle(pl.cx, pl.cy, 0, 0, 20, '#7dffb0', 60, { kind: 'ring', gravity: 0 }));
        break;
      case 'health':
        pl.hp = Math.min(pl.maxHp, pl.hp + 2);
        this.addText(it.cx, it.y, '+2 HEALTH', '#ff7a9a', 24);
        this.audio.play('health');
        break;
      case 'weapon': {
        const w = WEAPONS[it.data];
        if (pl.giveWeapon(it.data)) {
          this.addText(it.cx, it.y - 10, w.name.toUpperCase() + '!', w.color, 30);
          pl.say(pick(QUIPS.weapon), 120);
          this.audio.play('weapon');
        } else {
          pl.weaponIdx = pl.weapons.indexOf(it.data);
          this.addText(it.cx, it.y - 10, 'Full energy!', '#7dffb0', 24);
          this.audio.play('energy');
        }
        pl.energy = pl.maxEnergy;
        this.particles.push(new Particle(pl.cx, pl.cy, 0, 0, 24, w.color, 70, { kind: 'ring', gravity: 0 }));
        break;
      }
    }
  }

  firework() {
    const x = rand(100, W - 100), y = rand(60, 260), c = pick(['#ff4a4a', '#ffef5a', '#5affdc', '#ff5ad1', '#7dff5a', '#fff']);
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * TAU, s = rand(2, 4.5);
      this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(40, 60), c, 3.5, { glow: true, gravity: 0.05, drag: 0.96 }));
    }
    this.audio.play('explode');
  }

  /* ===================== RENDER ===================== */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    switch (this.state) {
      case 'title': this.renderTitle(ctx); break;
      case 'victory': this.renderVictory(ctx); break;
      default:
        this.renderWorld(ctx);
        this.renderHUD(ctx);
        if (this.state === 'intro') this.renderIntro(ctx);
        if (this.state === 'paused') this.renderPause(ctx);
        if (this.state === 'complete') this.renderComplete(ctx);
        if (this.state === 'gameover') this.renderGameOver(ctx);
    }
  }

  renderWorld(ctx) {
    const L = this.level, th = L.theme;
    drawBackground(ctx, L.def.theme, this.camX, this.t);
    const sx = this.shake ? rand(-this.shake, this.shake) : 0, sy = this.shake ? rand(-this.shake, this.shake) : 0;
    ctx.save();
    ctx.translate(Math.round(-this.camX + sx), Math.round(sy));
    const inView = e => e.x + e.w > this.camX - 150 && e.x < this.camX + W + 150;
    for (const p of L.platforms) p.draw(ctx, th, this.camX);
    for (const hz of L.hazards) if (inView(hz)) hz.draw(ctx, th);
    L.flag.draw(ctx, this.t);
    for (const it of L.items) if (inView(it)) it.draw(ctx);
    for (const e of L.enemies) if (inView(e) || e.isBoss) e.draw(ctx, this);
    this.player.draw(ctx, this);
    for (const p of this.projectiles) p.draw(ctx);
    for (const p of this.particles) p.draw(ctx);
    for (const t of this.texts) t.draw(ctx);
    ctx.restore();
  }

  renderHUD(ctx) {
    const pl = this.player, L = this.level;
    // ---- left panel: energy + weapon ----
    ctx.globalAlpha = 0.85; drawRRect(ctx, 10, 10, 300, 92, 12, '#1d2240', 3); ctx.globalAlpha = 1;
    cartoonText(ctx, 'ENERGY', 22, 28, 18, '#7dffb0', 'left', 4);
    const ex = 92, ey = 19, ew = 206, eh = 18, k = pl.energy / pl.maxEnergy;
    drawRRect(ctx, ex, ey, ew, eh, 9, '#0b0e1c', 3);
    const flash = this.energyFlash > 0 && Math.floor(this.energyFlash / 5) % 2 === 0;
    if (k > 0) {
      const g = ctx.createLinearGradient(ex, 0, ex + ew, 0);
      g.addColorStop(0, '#2fd47a'); g.addColorStop(1, '#a8ffde');
      pathRoundRect(ctx, ex + 3, ey + 3, (ew - 6) * k, eh - 6, 6);
      ctx.fillStyle = flash || k < 0.2 && this.t % 30 < 15 ? '#ff5050' : g; ctx.fill();
    }
    plainText(ctx, Math.floor(pl.energy) + '%', ex + ew / 2, ey + eh / 2 + 1, 12, '#fff', 'center');
    // weapon
    const w = pl.weapon;
    drawRRect(ctx, 20, 46, 56, 46, 8, '#0b0e1c', 2.5);
    ctx.save(); ctx.translate(34, 70); drawGun(ctx, w.key, 1); ctx.restore();
    cartoonText(ctx, w.name.toUpperCase(), 88, 58, 20, w.color, 'left', 4);
    plainText(ctx, `Cost ${w.cost}/shot`, 88, 78, 11, '#aab3d9');
    WEAPON_ORDER.forEach((key, i) => {
      const owned = pl.weapons.includes(key), sel = key === w.key;
      const bx = 196 + i * 27, by = 66;
      drawRRect(ctx, bx, by, 23, 23, 5, sel ? WEAPONS[key].color : owned ? '#3a4270' : '#151a30', sel ? 3 : 2);
      plainText(ctx, owned ? String(i + 1) : '?', bx + 11.5, by + 12.5, 12, sel ? OUTLINE : owned ? '#fff' : '#555', 'center');
    });
    // hearts
    for (let i = 0; i < pl.maxHp; i++) {
      const hx = 26 + i * 26, hy = 118;
      ctx.save(); ctx.translate(hx, hy);
      ctx.beginPath(); ctx.moveTo(0, 9); ctx.bezierCurveTo(-14, -1, -9, -13, 0, -5); ctx.bezierCurveTo(9, -13, 14, -1, 0, 9);
      fillStroke(ctx, i < pl.hp ? '#ff4a6a' : '#3a2430', 2.5);
      ctx.restore();
    }
    // ---- right panel: score, coins, lives ----
    ctx.globalAlpha = 0.85; drawRRect(ctx, W - 250, 10, 240, 92, 12, '#1d2240', 3); ctx.globalAlpha = 1;
    cartoonText(ctx, 'SCORE', W - 236, 30, 18, '#ffcc33', 'left', 4);
    cartoonText(ctx, String(this.score).padStart(7, '0'), W - 22, 30, 24, '#fff', 'right', 4);
    drawCircle(ctx, W - 226, 60, 10, '#ffc933', 2.5);
    drawCircle(ctx, W - 226, 60, 7, '#ffe58a', 1);
    drawRupeeSymbol(ctx, W - 226, 60, 6, '#b37700', 1.6);
    cartoonText(ctx, `${this.rupeeCoins} / ${L.totalRupeeCoins || L.totalCoins}`, W - 208, 61, 20, '#ffe58a', 'left', 4);
    plainText(ctx, 'RUPEE COINS', W - 22, 61, 10, '#aab3d9', 'right');
    for (let i = 0; i < this.lives; i++) {
      ctx.save(); ctx.translate(W - 222 + i * 30, 88); ctx.scale(0.62, 0.62);
      drawModiHead(ctx, 0, 0, {}); ctx.restore();
    }
    plainText(ctx, 'LIVES', W - 22, 88, 11, '#aab3d9', 'right');
    // ---- level name ----
    cartoonText(ctx, `LEVEL ${this.levelIdx + 1}: ${L.def.name.toUpperCase()}`, W / 2, 22, 20, '#fff');
    // progress bar
    const prog = clamp(pl.x / L.arenaStart, 0, 1);
    drawRRect(ctx, W / 2 - 120, 38, 240, 10, 5, '#0b0e1c', 2.5);
    ctx.fillStyle = '#5affdc'; ctx.fillRect(W / 2 - 117, 41, 234 * prog, 4);
    drawCircle(ctx, W / 2 - 117 + 234 * prog, 43, 5, '#fff', 2);
    drawLine(ctx, W / 2 + 120, 48, W / 2 + 120, 30, OUTLINE, 2.5);
    ctx.fillStyle = '#ff4a4a'; ctx.fillRect(W / 2 + 121, 30, 10, 7);
    // ---- boss bar ----
    const b = this.boss;
    if (b && !b.dead) {
      const bw = 520, bx = W / 2 - bw / 2, by = H - 42;
      drawRRect(ctx, bx, by, bw, 22, 11, '#1a0b14', 3);
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#ff3030'); g.addColorStop(1, '#ff9a3a');
      pathRoundRect(ctx, bx + 4, by + 4, (bw - 8) * (b.hp / b.maxHp), 14, 7); ctx.fillStyle = g; ctx.fill();
      cartoonText(ctx, b.name, W / 2, by - 12, 22, '#ff9a3a');
    }
    if (this.bossBanner > 0 && b) {
      const a = Math.min(1, this.bossBanner / 30, (200 - this.bossBanner) / 20);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(120,0,0,0.55)'; ctx.fillRect(0, H / 2 - 60, W, 110);
      cartoonText(ctx, 'WARNING! BOSS APPROACHING', W / 2, H / 2 - 28, 26, '#ffef5a');
      cartoonText(ctx, b.name, W / 2, H / 2 + 14, 54, '#ff5a3a');
      ctx.globalAlpha = 1;
    }
    if (this.audio.muted) plainText(ctx, '🔇 muted (M)', W - 14, H - 14, 12, '#fff', 'right');
  }

  overlay(ctx, alpha = 0.55) { ctx.fillStyle = `rgba(8,10,25,${alpha})`; ctx.fillRect(0, 0, W, H); }

  renderIntro(ctx) {
    const d = this.level.def;
    const slide = Math.min(1, this.stateT / 25);
    this.overlay(ctx, 0.45 * slide);
    ctx.save(); ctx.translate(0, (1 - slide) * -200);
    drawRRect(ctx, W / 2 - 290, 150, 580, 220, 20, '#1d2240', 4);
    cartoonText(ctx, `LEVEL ${this.levelIdx + 1}`, W / 2, 190, 30, '#ffcc33');
    cartoonText(ctx, d.name.toUpperCase(), W / 2, 240, 58, '#fff');
    cartoonText(ctx, d.sub, W / 2, 288, 24, '#9fd6ff');
    plainText(ctx, d.tip, W / 2, 325, 14, '#c9d0f0', 'center', '600');
    plainText(ctx, 'Press any key to begin', W / 2, 350, 12, '#7f88b0', 'center', '600');
    ctx.restore();
  }

  renderPause(ctx) {
    this.overlay(ctx, 0.65);
    cartoonText(ctx, 'PAUSED', W / 2, 170, 72, '#ffcc33');
    const lines = ['Move: A/D or ←/→     Jump: W/↑/Space     Drop down: S/↓',
      'Shoot: hold Mouse to aim & fire, or J (forward) / K (diagonal up)',
      'Switch weapon: Q/E, 1-4 or mouse wheel     Mute: M',
      '', 'Press P / Esc to resume  •  Q to quit to title'];
    lines.forEach((l, i) => plainText(ctx, l, W / 2, 260 + i * 30, 17, '#e8ecff', 'center', '600'));
  }

  renderComplete(ctx) {
    if (this.stateT < 50) return;
    const a = Math.min(1, (this.stateT - 50) / 20);
    ctx.globalAlpha = a;
    this.overlay(ctx, 0.5);
    drawRRect(ctx, W / 2 - 260, 110, 520, 330, 20, '#1d2240', 4);
    cartoonText(ctx, `${this.level.def.name.toUpperCase()} IS SAVED!`, W / 2, 150, 40, '#7dffb0');
    const T = this.tally;
    const totalRupees = this.level.totalRupeeCoins !== undefined ? this.level.totalRupeeCoins : this.level.totalCoins;
    const rows = [
      [`Rupee Coins  ${this.rupeeCoins}/${totalRupees}`, T.rupeeCoins || T.coins],
      ['All coins bonus', T.perfect],
      ['Energy bonus', T.energy],
      ['Health bonus', T.health],
    ];
    rows.forEach(([label, v], i) => {
      const show = this.stateT > 70 + i * 15;
      if (!show) return;
      plainText(ctx, label, W / 2 - 220, 205 + i * 36, 19, '#e8ecff', 'left', '700');
      cartoonText(ctx, '+' + v, W / 2 + 220, 205 + i * 36, 24, v ? '#ffe14a' : '#666', 'right', 4);
    });
    if (this.stateT > 140) {
      cartoonText(ctx, 'TOTAL  ' + this.score, W / 2, 365, 36, '#fff');
      if (this.t % 60 < 40) plainText(ctx, this.levelIdx + 1 < LEVEL_DEFS.length ? 'Press ENTER for the next city' : 'Press ENTER to finish', W / 2, 410, 16, '#ffcc33', 'center');
    }
    ctx.globalAlpha = 1;
  }

  renderGameOver(ctx) {
    this.overlay(ctx, Math.min(0.75, this.stateT / 60));
    cartoonText(ctx, 'GAME OVER', W / 2, 190, 90, '#ff4a4a');
    cartoonText(ctx, 'The aliens have taken ' + this.level.def.name + '...', W / 2, 265, 26, '#fff');
    plainText(ctx, 'Score: ' + this.score + '     High score: ' + this.highScore, W / 2, 315, 18, '#ffcc33', 'center');
    if (this.stateT > 60 && this.t % 60 < 40) plainText(ctx, 'Press ENTER to retry this level  •  Esc for title', W / 2, 370, 17, '#e8ecff', 'center');
  }

  renderTitle(ctx) {
    drawBackground(ctx, 'delhi', this.titleCam, this.t);
    ctx.save(); ctx.translate(-((this.titleCam) % 40), 0);
    const th = THEMES.delhi;
    new Platform(0, GROUND_Y, W + 80, 140, 'ground').draw(ctx, th, 0);
    ctx.restore();
    this.overlay(ctx, 0.25);
    // title
    const bob = Math.sin(this.t * 0.05) * 4;
    ctx.save(); ctx.translate(W / 2, 92 + bob); ctx.rotate(-0.03);
    cartoonText(ctx, 'MODI', 0, -30, 84, '#ffcc33', 'center', 12);
    cartoonText(ctx, 'ALIEN DEFENSE', 0, 40, 64, '#ff7700', 'center', 11);
    ctx.restore();
    // hero
    const run = this.t * 0.18;
    drawModi(ctx, 300, GROUND_Y + 1, 2.3, 1, { runPhase: run, moving: true, aim: -0.15, weapon: 'plasma', blink: this.t % 200 < 8 });
    // aliens
    const g = new Grunt(640, GROUND_Y - 44, 1); g.t = this.t; g.moving = true; g.facing = -1;
    ctx.save(); ctx.translate(640, GROUND_Y); ctx.scale(1.8, 1.8); ctx.translate(-640, -GROUND_Y); g.draw(ctx); ctx.restore();
    const u = new UFO(700, 150 + Math.sin(this.t * 0.04) * 15, 1); u.t = this.t; u.bombTimer = 100;
    ctx.save(); ctx.translate(750, 170); ctx.scale(1.5, 1.5); ctx.translate(-750, -170); u.draw(ctx); ctx.restore();
    // laser shots
    for (let i = 0; i < 3; i++) {
      const lx = 380 + ((this.t * 9 + i * 120) % 360);
      drawLine(ctx, lx, 340 - (lx - 380) * 0.15, lx + 26, 340 - (lx + 26 - 380) * 0.15, '#d050ff', 7);
    }
    if (this.t % 60 < 42) cartoonText(ctx, 'CLICK OR PRESS ENTER TO START', W / 2, 205, 30, '#fff');
    ctx.globalAlpha = 0.9; drawRRect(ctx, 560, 250, 380, 150, 14, '#1d2240', 3); ctx.globalAlpha = 1;
    const lines = ['A/D or ←/→  — Run', 'W/↑/Space  — Jump      S/↓ — Drop down', 'Mouse  — Aim & shoot (or J / K)', 'Q/E or 1-4  — Switch weapons', 'Grab "Full energy!" to recharge your laser'];
    lines.forEach((l, i) => plainText(ctx, l, 580, 275 + i * 25, 14, '#e8ecff', 'left', '600'));
    plainText(ctx, 'HIGH SCORE: ' + this.highScore, W / 2, H - 16, 14, '#ffcc33', 'center');
  }

  renderVictory(ctx) {
    drawBackground(ctx, 'delhi', 0, this.t);
    this.overlay(ctx, 0.45);
    for (const p of this.particles) p.draw(ctx);
    new Platform(-10, GROUND_Y, W + 20, 140, 'ground').draw(ctx, THEMES.delhi, 0);
    drawLine(ctx, 640, GROUND_Y, 640, 250, '#e0e0ea', 7);
    const fl = new Flag(640); fl.top = 250; fl.active = true; fl.appear = 1; fl.captured = true; fl.raise = 1;
    fl.draw(ctx, this.t);
    drawModi(ctx, 420, GROUND_Y + 1, 2.4, 1, { aim: -1.2, weapon: 'plasma', shout: true, air: Math.sin(this.t * 0.1) > 0.6 });
    cartoonText(ctx, 'INDIA & THE WORLD SAVED!', W / 2, 90, 56, '#ffcc33');
    cartoonText(ctx, 'JAI HIND!', W / 2, 150, 44, '#ff7700');
    cartoonText(ctx, 'FINAL SCORE: ' + this.score, W / 2, 200, 32, '#fff');
    plainText(ctx, 'High score: ' + this.highScore, W / 2, 235, 16, '#ffe58a', 'center');
    if (this.stateT > 120 && this.t % 60 < 40) plainText(ctx, 'Press ENTER to return to the title screen', W / 2, H - 20, 16, '#fff', 'center');
  }
}
