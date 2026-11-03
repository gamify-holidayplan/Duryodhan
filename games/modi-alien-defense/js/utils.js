'use strict';
/* ===========================================================
   Shared constants, math helpers, cartoon drawing helpers, input
   =========================================================== */

const W = 960, H = 540;
const GROUND_Y = 460;
const GRAVITY = 0.6;
const OUTLINE = '#1b1b2a';
const TAU = Math.PI * 2;
const FONT = '"Bangers", "Impact", "Arial Black", sans-serif';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

function weightedPick(weights, rng = Math.random) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
  return entries[entries.length - 1][0];
}

/* ---------- Cartoon drawing helpers (thick outlines = flash-game look) ---------- */
function pathRoundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fillStroke(ctx, fill, lw = 3) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function drawCircle(ctx, x, y, r, fill, lw = 3) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); fillStroke(ctx, fill, lw);
}
function drawEllipse(ctx, x, y, rx, ry, fill, lw = 3, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); fillStroke(ctx, fill, lw);
}
function drawRRect(ctx, x, y, w, h, r, fill, lw = 3) {
  pathRoundRect(ctx, x, y, w, h, r); fillStroke(ctx, fill, lw);
}
function drawPoly(ctx, pts, fill, lw = 3) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath(); fillStroke(ctx, fill, lw);
}
function drawLine(ctx, x1, y1, x2, y2, color = OUTLINE, lw = 3) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
}
function drawStar(ctx, x, y, r, fill, lw = 2) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  drawPoly(ctx, pts, fill, lw);
}
/* Indian Rupee symbol (₹) */
function drawRupeeSymbol(ctx, x, y, s, color = '#b37700', lw = 1.6) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Top horizontal bar
  drawLine(ctx, x - s * 0.45, y - s * 0.52, x + s * 0.45, y - s * 0.52, color, lw);
  // Second horizontal bar
  drawLine(ctx, x - s * 0.45, y - s * 0.20, x + s * 0.35, y - s * 0.20, color, lw);
  // Vertical stem & upper rounded curve
  ctx.beginPath();
  ctx.moveTo(x - s * 0.16, y - s * 0.52);
  ctx.lineTo(x - s * 0.16, y - s * 0.04);
  ctx.bezierCurveTo(x + s * 0.42, y - s * 0.04, x + s * 0.42, y - s * 0.52, x - s * 0.16, y - s * 0.52);
  ctx.stroke();
  // Downward diagonal leg
  ctx.beginPath();
  ctx.moveTo(x - s * 0.06, y - s * 0.04);
  ctx.lineTo(x + s * 0.44, y + s * 0.54);
  ctx.stroke();
  ctx.restore();
}
/* Indian National Flag (Tiranga) */
function drawIndianFlag(ctx, x, y, w, h, t = 0) {
  const cols = 12, cw = w / cols, sh = h / 3;
  for (let i = 0; i < cols; i++) {
    const off = Math.sin(t * 0.1 + i * 0.6) * 2 * (i / cols);
    ctx.fillStyle = '#ff9933'; ctx.fillRect(x + i * cw, y + off, cw + 0.6, sh + 0.5);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + i * cw, y + off + sh, cw + 0.6, sh + 0.5);
    ctx.fillStyle = '#138808'; ctx.fillRect(x + i * cw, y + off + sh * 2, cw + 0.6, sh + 0.5);
  }
  // Ashoka Chakra in center
  const cx = x + w / 2, cy = y + h / 2 + Math.sin(t * 0.1 + (cols / 2) * 0.6) * 1;
  const cr = sh * 0.42;
  ctx.strokeStyle = '#000080'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.stroke();
  for (let s = 0; s < 12; s++) {
    const a = s * Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr);
    ctx.lineTo(cx - Math.cos(a) * cr, cy - Math.sin(a) * cr);
    ctx.stroke();
  }
  ctx.fillStyle = '#000080'; ctx.beginPath(); ctx.arc(cx, cy, 1.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
}
/* Union of circles with one shared outline (clouds, bushes, brains...) */
function drawBlob(ctx, circles, fill, lw = 3) {
  ctx.fillStyle = OUTLINE;
  for (const [x, y, r] of circles) { ctx.beginPath(); ctx.arc(x, y, r + lw / 2 + 0.5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = fill;
  for (const [x, y, r] of circles) { ctx.beginPath(); ctx.arc(x, y, r - lw / 2 + 0.5, 0, TAU); ctx.fill(); }
}
function cartoonText(ctx, text, x, y, size, fill = '#fff', align = 'center', strokeW) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = strokeW ?? Math.max(3, size / 6);
  ctx.strokeStyle = OUTLINE; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
  ctx.restore();
}
function plainText(ctx, text, x, y, size, fill = '#fff', align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

/* ---------- Input ---------- */
class Input {
  constructor(canvas, onFirstInteract) {
    this.canvas = canvas;
    this.keys = {}; this.pressed = {};
    this.mouse = { x: W / 2, y: H / 2, down: false, clicked: false };
    this.wheel = 0;
    this.lastMouseMove = 0;
    const first = () => onFirstInteract && onFirstInteract();
    const block = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

    window.addEventListener('keydown', e => {
      first();
      if (block.includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });

    const toCanvas = e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (W / r.width);
      this.mouse.y = (e.clientY - r.top) * (H / r.height);
    };
    canvas.addEventListener('mousemove', e => { toCanvas(e); this.lastMouseMove = performance.now(); });
    canvas.addEventListener('mousedown', e => {
      first(); toCanvas(e);
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      e.preventDefault();
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }
  down(...codes) { return codes.some(c => this.keys[c]); }
  hit(...codes) { return codes.some(c => this.pressed[c]); }
  anyHit() { return Object.keys(this.pressed).length > 0 || this.mouse.clicked; }
  endFrame() { this.pressed = {}; this.mouse.clicked = false; this.wheel = 0; }
}

