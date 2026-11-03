'use strict';
/* ===========================================================
   AudioManager - all music & SFX synthesized with Web Audio
   =========================================================== */

const midiFreq = m => 440 * Math.pow(2, (m - 69) / 12);

/* Each song: chord progression (root midi, minor?) one bar each, and a
   32-step lead pattern indexing into chord tones (-1 = rest). */
const SONGS = {
  title: { bpm: 112, wave: 'triangle', chords: [[60, 0], [57, 1], [53, 0], [55, 0]],
    lead: [0, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1, 0, -1, -1, -1, 0, -1, 2, -1, 4, -1, 3, -1, 2, -1, 1, -1, 2, -1, -1, -1] },
  dc: { bpm: 140, wave: 'square', chords: [[60, 0], [55, 0], [57, 1], [53, 0]],
    lead: [0, 0, 2, -1, 3, -1, 2, 3, 4, -1, 3, -1, 2, -1, 0, -1, 3, 3, 4, -1, 5, -1, 4, 3, 2, -1, 3, -1, 1, -1, -1, -1] },
  ny: { bpm: 150, wave: 'square', chords: [[57, 1], [53, 0], [60, 0], [55, 0]],
    lead: [0, -1, 0, 2, -1, 3, -1, 2, 0, -1, 0, 2, -1, 4, 3, -1, 0, -1, 0, 2, -1, 3, -1, 5, 4, -1, 3, -1, 2, -1, 1, -1] },
  london: { bpm: 132, wave: 'sawtooth', chords: [[62, 1], [58, 0], [60, 0], [57, 0]],
    lead: [3, -1, 2, -1, 0, -1, 2, -1, 3, -1, 4, -1, 3, -1, -1, -1, 2, -1, 1, -1, 0, -1, 1, -1, 2, -1, 3, -1, 2, -1, -1, -1] },
  boss: { bpm: 168, wave: 'sawtooth', octave: 12, chords: [[52, 1], [48, 0], [50, 0], [47, 0]],
    lead: [0, 3, 2, 3, 0, 3, 2, 3, 0, 4, 3, 4, 0, 4, 3, 4, 0, 3, 2, 3, 0, 3, 2, 3, 5, 4, 3, 2, 1, 2, 3, 4] },
  victory: { bpm: 120, wave: 'triangle', chords: [[60, 0], [65, 0], [67, 0], [60, 0]],
    lead: [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 3, -1, 4, -1, -1, -1, 3, -1, 4, -1, 5, -1, 4, -1, 3, -1, 2, -1, 0, -1, -1, -1] },
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.song = null; this.songName = null;
    this.step = 0; this.nextTime = 0;
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.75; this.sfx.connect(this.master);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.2; this.music.connect(this.master);

    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    if (this.song) this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
  }

  /* ---------- primitives ---------- */
  osc(f, at, dur, type = 'square', vol = 0.2, slide = null, dest = this.sfx) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest);
    o.start(at); o.stop(at + dur + 0.05);
  }
  tone(f, dur, type, vol, slide, delay = 0) {
    this.osc(f, this.ctx.currentTime + delay, dur, type, vol, slide);
  }
  noiseAt(at, dur, vol = 0.3, freq = 1000, dest = this.sfx, ftype = 'lowpass') {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(at, Math.random() * 0.5); src.stop(at + dur + 0.05);
  }
  noise(dur, vol, freq, delay = 0, ftype) { this.noiseAt(this.ctx.currentTime + delay, dur, vol, freq, this.sfx, ftype); }

  alien(dur = 0.45, vol = 0.1, base = rand(450, 900)) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * rand(0.5, 1.8), t + dur);
    lfo.frequency.value = rand(14, 30); lg.gain.value = base * 0.3;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  /* ---------- sound effects ---------- */
  play(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.04) return;
    this.lastPlay[name] = now;
    const T = (f, d, type, v, slide, delay) => this.tone(f, d, type, v, slide, delay);
    switch (name) {
      case 'shoot': T(1300, 0.12, 'square', 0.07, 300); T(650, 0.1, 'sawtooth', 0.04, 200); break;
      case 'triple': T(1600, 0.1, 'square', 0.06, 500); T(1100, 0.1, 'square', 0.05, 350, 0.02); break;
      case 'cannon': T(420, 0.35, 'sawtooth', 0.14, 60); this.noise(0.25, 0.14, 1500); break;
      case 'plasma': T(180, 0.5, 'sine', 0.25, 900); T(90, 0.45, 'square', 0.06, 400); break;
      case 'enemyShoot': T(480, 0.15, 'triangle', 0.08, 1400); break;
      case 'hit': T(320, 0.06, 'square', 0.06, 150); break;
      case 'explode': this.noise(0.45, 0.35, 900); T(140, 0.35, 'sine', 0.3, 35); break;
      case 'bigexplode': this.noise(1.3, 0.5, 600); T(90, 1.1, 'sine', 0.45, 25); break;
      case 'coin': T(988, 0.08, 'square', 0.08); T(1319, 0.25, 'square', 0.08, null, 0.07); break;
      case 'energy': [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, 0.14, 'triangle', 0.16, null, i * 0.055)); break;
      case 'health': [440, 554, 659, 880].forEach((f, i) => T(f, 0.16, 'sine', 0.18, null, i * 0.07)); break;
      case 'weapon': [392, 523, 659, 784, 1047].forEach((f, i) => T(f, 0.16, 'square', 0.08, null, i * 0.07)); break;
      case 'select': T(700, 0.06, 'square', 0.06); T(1050, 0.08, 'square', 0.06, null, 0.05); break;
      case 'jump': T(280, 0.16, 'square', 0.05, 620); break;
      case 'hurt': T(220, 0.3, 'sawtooth', 0.15, 70); break;
      case 'empty': T(120, 0.05, 'square', 0.08); break;
      case 'alien': this.alien(); break;
      case 'boss': T(70, 1.4, 'sawtooth', 0.22, 35); this.alien(1.0, 0.18, 220); this.noise(1.2, 0.15, 300); break;
      case 'stomp': this.noise(0.45, 0.45, 300); T(65, 0.45, 'sine', 0.45, 30); break;
      case 'beam': T(140, 1.1, 'sawtooth', 0.1, 320); T(280, 1.1, 'square', 0.04, 640); break;
      case 'warn': T(880, 0.12, 'square', 0.07); T(880, 0.12, 'square', 0.07, null, 0.2); break;
      case 'flag': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => T(f, i === 5 ? 0.6 : 0.15, 'square', 0.09, null, i * 0.12)); break;
      case 'gameover': [392, 349, 311, 262].forEach((f, i) => T(f, 0.35, 'triangle', 0.18, null, i * 0.28)); break;
      case 'start': [262, 392, 523, 784].forEach((f, i) => T(f, 0.18, 'square', 0.08, null, i * 0.08)); break;
    }
  }

  /* ---------- music sequencer ---------- */
  playSong(name) {
    if (this.songName === name) return;
    this.songName = name; this.song = SONGS[name] || null; this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.08;
  }
  stopSong() { this.song = null; this.songName = null; }

  schedule() {
    if (!this.ctx || !this.song) return;
    const spb = 60 / this.song.bpm / 4;
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb; this.step++;
    }
  }

  playStep(s, t, spb) {
    const S = this.song, M = this.music;
    const bar = Math.floor(s / 16) % S.chords.length, pos = s % 16;
    const [root, minor] = S.chords[bar];
    const third = minor ? 3 : 4;
    const tones = [0, third, 7, 12, 12 + third, 19];
    // bass (8th notes with octave bounce)
    if (pos % 2 === 0) this.osc(midiFreq(root - 24 + (pos % 4 === 2 ? 12 : 0)), t, spb * 1.8, 'triangle', 0.55, null, M);
    // chord pad on bar start
    if (pos === 0) [0, third, 7].forEach(iv => this.osc(midiFreq(root + iv - 12), t, spb * 14, 'sine', 0.07, null, M));
    // lead
    const li = S.lead[s % S.lead.length];
    if (li >= 0) this.osc(midiFreq(root + (S.octave || 0) + tones[li]), t, spb * 1.6, S.wave, 0.13, null, M);
    // drums
    if (pos % 4 === 0) this.osc(150, t, 0.18, 'sine', 0.6, 40, M);
    if (pos === 4 || pos === 12) this.noiseAt(t, 0.12, 0.25, 2500, M, 'bandpass');
    if (pos % 2 === 1 || S.octave) this.noiseAt(t, 0.03, 0.12, 7000, M, 'highpass');
  }
}

