import { sfx, buzz } from './audio.js';

// All gameplay happens in "units" (U); main.js maps 1 unit to N screen pixels
// so the game plays identically on every screen size.
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export const CFG = {
  segSpacing: 0.5,
  bodyR: 0.42,
  headR: 0.55,
  baseSpeed: 5.0,
  turnRate: 4.8,
  startLen: 8,
  fuseAfterLanding: 0.45,
};

// Everything that changes between difficulty levels lives here.
export const DIFFICULTY = {
  easy: {
    label: 'Easy', startAmmo: 5, maxAmmo: 8, pickupEvery: [3, 4.5], maxPickups: 3, starveDelay: 1,
    enemyCap: 0.6, spawnRate: 0.65, enemySpeed: 0.8, snakeSpeed: 0.92, blastR: 3.8, waveTime: 28,
    dasherWave: 3, bruteWave: 6, bruteHp: 2, dropChance: 0.12, crateDrop: 0.45, scoreMult: 0.5,
  },
  normal: {
    label: 'Normal', startAmmo: 3, maxAmmo: 5, pickupEvery: [4.5, 7], maxPickups: 2, starveDelay: 1.5,
    enemyCap: 1, spawnRate: 1, enemySpeed: 1, snakeSpeed: 1, blastR: 3.2, waveTime: 22,
    dasherWave: 2, bruteWave: 4, bruteHp: 3, dropChance: 0.06, crateDrop: 0.3, scoreMult: 1,
  },
  hard: {
    label: 'Hard', startAmmo: 2, maxAmmo: 4, pickupEvery: [7, 10], maxPickups: 1, starveDelay: 3,
    enemyCap: 1.4, spawnRate: 1.45, enemySpeed: 1.2, snakeSpeed: 1.08, blastR: 2.8, waveTime: 18,
    dasherWave: 1, bruteWave: 3, bruteHp: 4, dropChance: 0.03, crateDrop: 0.18, scoreMult: 2,
  },
};

export const MODES = {
  classic: { label: 'Classic' },
  walls: { label: 'Walls' },
};

const ENEMY = {
  crawler: { r: 0.5, speed: 2.3, hp: 1, score: 100, color: '#ff4d6d', dark: '#8f1d33' },
  dasher: { r: 0.48, speed: 1.6, hp: 1, score: 150, color: '#ffb703', dark: '#8a5a00' },
  brute: { r: 0.95, speed: 1.2, hp: 3, score: 300, color: '#c77dff', dark: '#5a2a85' },
};

// ------------------------------------------------------------- wall helpers
function circleRect(cx, cy, r, b) {
  const nx = clamp(cx, b.x, b.x + b.w), ny = clamp(cy, b.y, b.y + b.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Move a circle {x,y} of radius r so it no longer overlaps rect b.
function pushOut(o, r, b) {
  const nx = clamp(o.x, b.x, b.x + b.w), ny = clamp(o.y, b.y, b.y + b.h);
  const dx = o.x - nx, dy = o.y - ny;
  const dd = dx * dx + dy * dy;
  if (dd >= r * r) return false;
  if (dd > 1e-8) {
    const d = Math.sqrt(dd);
    o.x = nx + (dx / d) * r;
    o.y = ny + (dy / d) * r;
  } else {
    const l = o.x - b.x, rt = b.x + b.w - o.x, t = o.y - b.y, bt = b.y + b.h - o.y;
    const m = Math.min(l, rt, t, bt);
    if (m === l) o.x = b.x - r;
    else if (m === rt) o.x = b.x + b.w + r;
    else if (m === t) o.y = b.y - r;
    else o.y = b.y + b.h + r;
  }
  return true;
}

// Does the segment (x0,y0)-(x1,y1) pass through rect b? (slab test)
function segRect(x0, y0, x1, y1, b, pad = 0) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - (b.x - pad), b.x + b.w + pad - x0, y0 - (b.y - pad), b.y + b.h + pad - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

function overlaps(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

// Wall layouts in normalized arena coordinates, so they fit any screen shape.
const LAYOUTS = [
  { name: 'Pillars', start: [0.5, 0.62, -Math.PI / 2], blocks: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] },
  { name: 'Bars', start: [0.5, 0.62, -Math.PI / 2], h: [[0.1, 0.42, 0.3], [0.58, 0.9, 0.3], [0.1, 0.42, 0.8], [0.58, 0.9, 0.8]] },
  { name: 'Rooms', start: [0.28, 0.68, 0], v: [[0.5, 0.06, 0.32], [0.5, 0.74, 0.94]], h: [[0.06, 0.3, 0.5], [0.7, 0.94, 0.5]] },
  {
    name: 'Corners', start: [0.5, 0.62, -Math.PI / 2],
    h: [[0.12, 0.34, 0.14], [0.66, 0.88, 0.14], [0.12, 0.34, 0.86], [0.66, 0.88, 0.86]],
    v: [[0.12, 0.14, 0.3], [0.88, 0.14, 0.3], [0.12, 0.7, 0.86], [0.88, 0.7, 0.86]],
  },
];

// Pre-rendered radial glow sprites: much cheaper than shadowBlur on mobile GPUs.
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color + 'cc');
    gr.addColorStop(0.4, color + '44');
    gr.addColorStop(1, color + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
  }
  return c;
}

class Snake {
  constructor(x, y, angle = -Math.PI / 2) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.target = this.angle;
    this.len = CFG.startLen;
    this.path = [];
    const bx = -Math.cos(angle) * 0.1, by = -Math.sin(angle) * 0.1;
    for (let i = 0; i <= this.len * CFG.segSpacing * 10 + 4; i++) this.path.push({ x: x + bx * i, y: y + by * i });
    this.segs = [];
    this.updateSegs();
  }

  // Sample evenly spaced body segments along the recorded head path.
  updateSegs() {
    const sp = CFG.segSpacing;
    const segs = this.segs;
    let n = 0;
    let need = sp, acc = 0, px = this.x, py = this.y;
    let i = 0;
    for (; i < this.path.length && n < this.len; i++) {
      const p = this.path[i];
      const dx = p.x - px, dy = p.y - py;
      const d = Math.hypot(dx, dy);
      while (d > 0 && acc + d >= need && n < this.len) {
        const t = (need - acc) / d;
        const s = segs[n] || (segs[n] = { x: 0, y: 0 });
        s.x = px + dx * t;
        s.y = py + dy * t;
        n++;
        need += sp;
      }
      acc += d;
      px = p.x;
      py = p.y;
    }
    if (n >= this.len && i + 2 < this.path.length) this.path.length = i + 2;
    while (n < this.len) {
      const s = segs[n] || (segs[n] = { x: 0, y: 0 });
      s.x = px;
      s.y = py;
      n++;
    }
    segs.length = this.len;
  }
}

export class Game {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.W = 18;
    this.H = 30;
    this.state = 'idle';
    this.t = 0;
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
    this.idleSeed = [];
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    if (this.state === 'idle') this.makeIdleScene();
    const keepIn = (o, r = 0.5) => { o.x = clamp(o.x, r, W - r); o.y = clamp(o.y, r, H - r); };
    if (this.snake) {
      // Shift the whole snake back inside if the arena shrank.
      const s = this.snake;
      const ox = clamp(s.x, 2, W - 2) - s.x, oy = clamp(s.y, 2, H - 2) - s.y;
      if (ox || oy) {
        s.x += ox; s.y += oy;
        for (const p of s.path) { p.x += ox; p.y += oy; }
        s.updateSegs();
      }
      for (const list of [this.enemies, this.foods, this.pickups, this.bombs, this.warns]) list.forEach((o) => keepIn(o));
      if (this.mode === 'walls') {
        // Rotation mid-game: rescale the layout and give the player a moment.
        this.buildWalls();
        this.crates = this.crates.filter((c) => c.x + c.w < W && c.y + c.h < H && !this.walls.some((w) => overlaps(c, w)));
        this.rebuildObstacles();
        this.grace = 1.2;
      }
    }
  }

  buildWalls() {
    const L = this.layout, W = this.W, H = this.H, t = 0.9;
    const walls = [];
    for (const [x0, x1, y] of L.h || []) walls.push({ x: x0 * W, y: y * H - t / 2, w: (x1 - x0) * W, h: t });
    for (const [x, y0, y1] of L.v || []) walls.push({ x: x * W - t / 2, y: y0 * H, w: t, h: (y1 - y0) * H });
    const s = Math.min(2.4, Math.min(W, H) * 0.14);
    for (const [x, y] of L.blocks || []) walls.push({ x: x * W - s / 2, y: y * H - s / 2, w: s, h: s });
    this.walls = walls;
  }

  rebuildObstacles() {
    this.obstacles = this.walls.concat(this.crates);
    this.flowDirty = true;
  }

  blocked(x, y, r) {
    for (const b of this.obstacles) if (circleRect(x, y, r, b)) return true;
    return false;
  }

  lineOfSight(x0, y0, x1, y1, pad = 0) {
    for (const b of this.obstacles) if (segRect(x0, y0, x1, y1, b, pad)) return false;
    return true;
  }

  // How far the snake could travel from (x,y) along angle a before hitting something.
  runway(x, y, a, max = 7) {
    for (let d = 0; d <= max; d += 0.25) {
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (px < 1 || py < 1 || px > this.W - 1 || py > this.H - 1 || this.blocked(px, py, 0.8)) return d;
    }
    return max;
  }

  // Use the layout's start if it has room ahead, otherwise find a spot that does.
  safeStart([nx, ny, a]) {
    const x = nx * this.W, y = ny * this.H;
    if (!this.blocked(x, y, 1) && this.runway(x, y, a) >= 6) return [nx, ny, a];
    let best = [nx, ny, a], bestRun = -1;
    for (let i = 0; i < 80; i++) {
      const px = rand(2, this.W - 2), py = rand(2, this.H - 2);
      if (this.blocked(px, py, 1.2)) continue;
      for (const pa of [-Math.PI / 2, 0, Math.PI, Math.PI / 2]) {
        const run = this.runway(px, py, pa);
        if (run > bestRun) { bestRun = run; best = [px / this.W, py / this.H, pa]; }
      }
      if (bestRun >= 7) break;
    }
    return best;
  }

  addCrates(n) {
    const s = this.snake;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = Math.floor(rand(1, this.W - 2)) + 0.1, y = Math.floor(rand(1, this.H - 2)) + 0.1;
        const c = { x, y, w: 0.9, h: 0.9, crate: true };
        if (d2(x + 0.45, y + 0.45, s.x, s.y) < 16) continue;
        // Keep the lane in front of the snake clear so a crate never appears in its face.
        const rx = x + 0.45 - s.x, ry = y + 0.45 - s.y;
        const along = rx * Math.cos(s.angle) + ry * Math.sin(s.angle);
        const perp = Math.abs(ry * Math.cos(s.angle) - rx * Math.sin(s.angle));
        if (along > -1 && along < 10 && perp < 2.2) continue;
        if (this.obstacles.some((o) => overlaps(c, o, 0.9))) continue;
        if (s.segs.some((g) => circleRect(g.x, g.y, 0.6, c))) continue;
        this.crates.push(c);
        this.rebuildObstacles();
        break;
      }
    }
  }

  // Breadth-first distance field from the snake's head on a 1-unit grid,
  // so enemies can path around walls instead of pushing into them.
  updateFlow() {
    const gw = Math.ceil(this.W), gh = Math.ceil(this.H);
    let f = this.flow;
    if (!f || f.gw !== gw || f.gh !== gh) {
      f = this.flow = { gw, gh, solid: new Uint8Array(gw * gh), dist: new Int16Array(gw * gh), queue: new Int32Array(gw * gh) };
      this.flowDirty = true;
    }
    if (this.flowDirty) {
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) f.solid[y * gw + x] = this.blocked(x + 0.5, y + 0.5, 0.45) ? 1 : 0;
      this.flowDirty = false;
    }
    f.dist.fill(-1);
    const hx = clamp(Math.floor(this.snake.x), 0, gw - 1), hy = clamp(Math.floor(this.snake.y), 0, gh - 1);
    let head = 0, tail = 0;
    f.dist[hy * gw + hx] = 0;
    f.queue[tail++] = hy * gw + hx;
    while (head < tail) {
      const i = f.queue[head++];
      const x = i % gw, y = (i / gw) | 0, nd = f.dist[i] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const j = ny * gw + nx;
        if (f.solid[j] || f.dist[j] !== -1) continue;
        f.dist[j] = nd;
        f.queue[tail++] = j;
      }
    }
  }

  // Heading toward the neighbouring cell that is closest to the snake.
  flowAngle(x, y) {
    const f = this.flow;
    if (!f) return null;
    const cx = clamp(Math.floor(x), 0, f.gw - 1), cy = clamp(Math.floor(y), 0, f.gh - 1);
    let best = -1, bx = 0, by = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= f.gw || ny >= f.gh) continue;
        if (ox && oy && (f.solid[cy * f.gw + nx] || f.solid[ny * f.gw + cx])) continue;
        const d = f.dist[ny * f.gw + nx];
        if (d < 0) continue;
        if (best < 0 || d < best) { best = d; bx = nx; by = ny; }
      }
    }
    return best < 0 ? null : Math.atan2(by + 0.5 - y, bx + 0.5 - x);
  }

  makeIdleScene() {
    this.idleSeed = Array.from({ length: 14 }, () => ({ x: rand(1, this.W - 1), y: rand(1, this.H - 1), p: rand(0, TAU) }));
  }

  reset({ mode = 'classic', difficulty = 'normal' } = {}) {
    this.mode = MODES[mode] ? mode : 'classic';
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'normal';
    this.diff = DIFFICULTY[this.difficulty];
    this.time = 0;
    this.wave = 1;
    this.score = 0;
    this.kills = 0;
    this.bestCombo = 0;
    this.combo = 0;
    this.comboT = 0;
    this.thrown = 0;
    this.grace = 0;
    this.walls = [];
    this.crates = [];
    this.obstacles = [];
    this.flow = null;
    this.flowT = 0;
    let start = [0.5, 0.62, -Math.PI / 2];
    if (this.mode === 'walls') {
      this.layout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
      this.buildWalls();
      this.rebuildObstacles();
      start = this.safeStart(this.layout.start);
    }
    this.snake = new Snake(start[0] * this.W, start[1] * this.H, start[2]);
    this.ammo = this.diff.startAmmo;
    this.enemies = [];
    this.foods = [];
    this.pickups = [];
    this.bombs = [];
    this.blasts = [];
    this.warns = [];
    this.particles = [];
    this.texts = [];
    this.spawnT = 1.6;
    this.pickupT = 5;
    this.shake = 0;
    this.hitstop = 0;
    this.flash = 0;
    this.deathT = 0;
    for (let i = 0; i < this.foodTarget(); i++) this.spawnFood('orb');
    if (this.mode === 'walls') this.addCrates(this.crateTarget());
    this.state = 'play';
  }

  foodTarget() { return 3 + Math.floor((this.W * this.H) / 220); }
  crateTarget() { return 4 + Math.floor((this.W * this.H) / 160); }
  maxEnemies() { return Math.round(Math.min(10 + this.wave * 3, 45) * this.diff.enemyCap); }
  speed() { return (CFG.baseSpeed + Math.min(this.wave - 1, 8) * 0.22) * this.diff.snakeSpeed; }

  // ---------------------------------------------------------------- spawning
  freeSpot(minHead = 4, margin = 1.2) {
    const s = this.snake;
    for (let tries = 0; tries < 30; tries++) {
      const x = rand(margin, this.W - margin), y = rand(margin, this.H - margin);
      if (d2(x, y, s.x, s.y) < minHead * minHead) continue;
      if (this.blocked(x, y, 0.9)) continue;
      let ok = true;
      for (const g of s.segs) if (d2(x, y, g.x, g.y) < 1) { ok = false; break; }
      if (ok) return { x, y };
    }
    for (let tries = 0; tries < 50; tries++) {
      const x = rand(margin, this.W - margin), y = rand(margin, this.H - margin);
      if (!this.blocked(x, y, 0.9)) return { x, y };
    }
    return { x: rand(margin, this.W - margin), y: rand(margin, this.H - margin) };
  }

  spawnFood(kind, x, y) {
    const p = x === undefined ? this.freeSpot(2.5) : { x, y };
    this.foods.push({ x: p.x, y: p.y, kind, t: 0, life: kind === 'gem' ? 9 : Infinity, ph: rand(0, TAU) });
  }

  spawnPickup(x, y) {
    const p = x === undefined ? this.freeSpot(3) : { x, y };
    this.pickups.push({ x: p.x, y: p.y, t: 0, ph: rand(0, TAU) });
  }

  queueEnemy() {
    const s = this.snake;
    let x = 0, y = 0;
    for (let tries = 0; tries < 20; tries++) {
      const edge = Math.floor(Math.random() * 4);
      const m = 1.2;
      x = edge === 0 ? m : edge === 1 ? this.W - m : rand(m, this.W - m);
      y = edge === 2 ? m : edge === 3 ? this.H - m : rand(m, this.H - m);
      if (d2(x, y, s.x, s.y) > 36 && !this.blocked(x, y, 1.1)) break;
    }
    const r = Math.random();
    let type = 'crawler';
    if (this.wave >= this.diff.bruteWave && r < 0.14) type = 'brute';
    else if (this.wave >= this.diff.dasherWave && r < 0.38) type = 'dasher';
    this.warns.push({ x, y, t: 0, dur: 0.9, type });
  }

  spawnEnemy(w) {
    const def = ENEMY[w.type];
    this.enemies.push({
      type: w.type, x: w.x, y: w.y, r: def.r, hp: w.type === 'brute' ? this.diff.bruteHp : def.hp, angle: Math.atan2(this.snake.y - w.y, this.snake.x - w.x),
      vx: 0, vy: 0, t: rand(0, 10), hitT: 0, mode: 'walk', modeT: 0, cool: rand(1, 2.5), dead: false,
    });
    this.burst(w.x, w.y, def.color, 10, 4);
    sfx.spawn();
  }

  // ------------------------------------------------------------------ update
  update(dt, input) {
    this.t += dt;
    if (this.state === 'idle') return;
    if (this.state === 'dying' || this.state === 'over') {
      if (this.state === 'dying') {
        this.deathT += dt;
        if (this.deathT > 1.4) {
          this.state = 'over';
          this.hooks.onGameOver?.(this.summary());
        }
      }
      this.updateFx(dt * (this.state === 'dying' ? 0.4 : 1));
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }

    this.time += dt;
    const wave = 1 + Math.floor(this.time / this.diff.waveTime);
    if (wave > this.wave) {
      this.wave = wave;
      this.hooks.onWave?.(wave);
      sfx.wave();
      if (this.ammo < this.diff.maxAmmo) this.spawnPickup();
      if (this.mode === 'walls') this.addCrates(Math.max(0, Math.min(3, this.crateTarget() - this.crates.length)));
    }

    this.updateSnake(dt, input);
    if (this.state !== 'play') return;
    if (this.obstacles.length) {
      this.flowT -= dt;
      if (this.flowT <= 0) { this.updateFlow(); this.flowT = 0.2; }
    }
    this.updateBombs(dt);
    this.updateEnemies(dt);
    if (this.state !== 'play') return;
    this.updateSpawns(dt);
    this.updateFx(dt);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
  }

  updateSnake(dt, input) {
    const s = this.snake;
    const a = input.angle;
    if (a !== null) s.target = a;
    const turn = CFG.turnRate * dt;
    s.angle += clamp(angleDiff(s.angle, s.target), -turn, turn);
    const v = this.speed();
    s.x += Math.cos(s.angle) * v * dt;
    s.y += Math.sin(s.angle) * v * dt;
    s.path.unshift({ x: s.x, y: s.y });
    s.updateSegs();

    const req = input.consumeThrow();
    if (req) this.throwBomb(req);

    const wr = CFG.headR * 0.7;
    if (s.x < wr || s.y < wr || s.x > this.W - wr || s.y > this.H - wr) return this.die();
    if (this.grace > 0) this.grace -= dt;
    else if (this.blocked(s.x, s.y, CFG.headR * 0.65)) return this.die();
    const hitR = (CFG.headR + CFG.bodyR) * 0.75;
    for (let i = 5; i < s.segs.length; i++) {
      const g = s.segs[i];
      if (d2(s.x, s.y, g.x, g.y) < hitR * hitR) return this.die();
    }

    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      f.t += dt;
      if (f.t > f.life) { this.foods.splice(i, 1); continue; }
      const r = CFG.headR + 0.45;
      if (d2(s.x, s.y, f.x, f.y) < r * r) {
        this.foods.splice(i, 1);
        s.len++;
        if (f.kind === 'gem') {
          this.addScore(25, f.x, f.y, '#7df9ff');
          sfx.gem();
        } else {
          this.addScore(10, f.x, f.y, '#ff8fd8');
          sfx.eat();
          this.spawnFood('orb');
        }
        this.burst(f.x, f.y, f.kind === 'gem' ? '#7df9ff' : '#ff8fd8', 8, 3);
        buzz(8);
      }
    }
    while (this.foods.filter((f) => f.kind === 'orb').length < this.foodTarget()) this.spawnFood('orb');

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      const r = CFG.headR + 0.55;
      if (d2(s.x, s.y, p.x, p.y) < r * r) {
        this.pickups.splice(i, 1);
        if (this.ammo < this.diff.maxAmmo) {
          this.ammo++;
          this.text(p.x, p.y, '+1 GRENADE', '#b6ff6e', 0.9);
        } else {
          this.addScore(50, p.x, p.y, '#b6ff6e');
        }
        this.burst(p.x, p.y, '#b6ff6e', 12, 4);
        sfx.pickup();
        buzz(15);
      }
    }
  }

  // Throw a grenade to the tapped point (or straight ahead for keyboard play).
  throwBomb(req = { fwd: true }) {
    const s = this.snake;
    if (this.ammo <= 0) {
      sfx.empty();
      this.text(s.x, s.y - 1.2, 'NO GRENADES', '#ff4d6d', 0.6);
      return;
    }
    let tx, ty;
    if (req.fwd || !this.view) {
      tx = s.x + Math.cos(s.angle) * 6;
      ty = s.y + Math.sin(s.angle) * 6;
    } else {
      tx = (req.sx - this.view.x) / this.view.U;
      ty = (req.sy - this.view.y) / this.view.U;
    }
    const t = { x: clamp(tx, 0.4, this.W - 0.4), y: clamp(ty, 0.4, this.H - 0.4) };
    for (let k = 0; k < 3; k++) for (const b of this.obstacles) pushOut(t, 0.45, b);
    t.x = clamp(t.x, 0.4, this.W - 0.4);
    t.y = clamp(t.y, 0.4, this.H - 0.4);

    this.ammo--;
    this.thrown++;
    const ox = s.x + Math.cos(s.angle) * 0.6, oy = s.y + Math.sin(s.angle) * 0.6;
    const dx = t.x - ox, dy = t.y - oy;
    const flight = clamp(0.22 + Math.hypot(dx, dy) / 16, 0.25, 0.9);
    const z0 = 0.4, g = 20;
    this.bombs.push({
      x: ox, y: oy, vx: dx / flight, vy: dy / flight, z: z0, vz: (g * flight) / 2 - z0 / flight,
      tx: t.x, ty: t.y, flight, landed: false,
      t: 0, fuse: flight + CFG.fuseAfterLanding, spin: rand(-12, 12), rot: 0,
    });
    sfx.throw();
    buzz(10);
  }

  updateBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt;
      b.rot += b.spin * dt;
      if (!b.landed) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vz -= 20 * dt;
        b.z = Math.max(0, b.z + b.vz * dt);
        if (b.t >= b.flight) {
          b.landed = true;
          b.x = b.tx;
          b.y = b.ty;
          b.z = 0;
          b.spin = 0;
          sfx.bounce();
          this.burst(b.x, b.y, '#8ea3c4', 5, 2);
        }
      }
      if (b.t >= b.fuse) {
        this.bombs.splice(i, 1);
        this.explode(b.x, b.y);
      }
    }
  }

  explode(x, y) {
    const R = this.diff.blastR;
    this.blasts.push({ x, y, t: 0, r: R });
    this.shake = Math.min(1, this.shake + 0.55);
    this.hitstop = Math.max(this.hitstop, 0.035);
    this.flash = Math.min(0.5, this.flash + 0.22);
    sfx.boom();
    buzz(45);

    for (let i = 0; i < 28; i++) {
      const a = rand(0, TAU), sp = rand(4, 16);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.6), t: 0, size: rand(0.08, 0.18), color: Math.random() < 0.5 ? '#ffd166' : '#ff7b39', kind: 'spark' });
    }
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), sp = rand(0.5, 2.5);
      this.particles.push({ x: x + Math.cos(a) * 0.5, y: y + Math.sin(a) * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.6, 1.1), t: 0, size: rand(0.6, 1.2), color: '#4a4f66', kind: 'smoke' });
    }

    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = R + e.r;
      const dd = d2(x, y, e.x, e.y);
      if (dd > rr * rr) continue;
      const d = Math.sqrt(dd) || 0.01;
      e.hp -= d < R * 0.5 ? 2 : 1;
      const kb = 9 * (1 - d / rr) + 3;
      e.vx += ((e.x - x) / d) * kb;
      e.vy += ((e.y - y) / d) * kb;
      e.hitT = 0.12;
      if (e.hp <= 0) this.killEnemy(e);
      else sfx.hit();
    }

    // Grenade pickups caught in the blast cook off -> chain reactions.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (d2(x, y, p.x, p.y) < R * R) {
        this.pickups.splice(i, 1);
        this.bombs.push({ x: p.x, y: p.y, tx: p.x, ty: p.y, vx: 0, vy: 0, z: 0, vz: 0, t: 0, flight: 0, landed: true, fuse: 0.14, spin: 0, rot: 0 });
      }
    }
    for (const b of this.bombs) if (b.landed && b.fuse - b.t > 0.14 && d2(x, y, b.x, b.y) < R * R) b.t = b.fuse - 0.14;

    // Crates in the blast break open and drop loot.
    let broke = false;
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      if (!circleRect(x, y, R * 0.9, c)) continue;
      this.crates.splice(i, 1);
      broke = true;
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      this.burst(cx, cy, '#ffb347', 16, 6);
      this.addScore(50, cx, cy, '#ffb347');
      if (Math.random() < this.diff.crateDrop) this.spawnPickup(cx, cy);
      else this.spawnFood('gem', cx, cy);
    }
    if (broke) this.rebuildObstacles();
  }

  killEnemy(e) {
    e.dead = true;
    const def = ENEMY[e.type];
    this.kills++;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.6;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = Math.min(this.combo, 10);
    this.addScore(def.score * mult, e.x, e.y, def.color, mult > 1 ? ` x${mult}` : '');
    this.burst(e.x, e.y, def.color, 18, 7);
    sfx.kill();
    if (Math.random() < 0.6) this.spawnFood('gem', e.x, e.y);
    if (e.type === 'brute' || Math.random() < this.diff.dropChance) this.spawnPickup(clamp(e.x, 1, this.W - 1), clamp(e.y, 1, this.H - 1));
    this.hooks.onCombo?.(this.combo);
  }

  updateEnemies(dt) {
    const s = this.snake;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const def = ENEMY[e.type];
      e.t += dt;
      e.hitT -= dt;
      const toHead = Math.atan2(s.y - e.y, s.x - e.x);
      const dist = Math.sqrt(d2(e.x, e.y, s.x, s.y));
      let speed = (def.speed + Math.min(this.wave - 1, 10) * 0.07) * this.diff.enemySpeed;
      // In Walls mode, follow the flow field when the head is out of sight.
      let chase = toHead, pathing = false;
      if (this.obstacles.length && !this.lineOfSight(e.x, e.y, s.x, s.y, e.r * 0.8)) {
        const fa = this.flowAngle(e.x, e.y);
        if (fa !== null) { chase = fa; pathing = true; }
      }

      if (e.type === 'dasher') {
        e.cool -= dt;
        if (e.mode === 'walk') {
          e.angle += clamp(angleDiff(e.angle, chase), -(pathing ? 5 : 2) * dt, (pathing ? 5 : 2) * dt);
          if (dist < 8 && e.cool <= 0 && !pathing) { e.mode = 'aim'; e.modeT = 0.65; }
        } else if (e.mode === 'aim') {
          speed = 0;
          e.angle += clamp(angleDiff(e.angle, toHead), -6 * dt, 6 * dt);
          e.modeT -= dt;
          if (e.modeT <= 0) { e.mode = 'dash'; e.modeT = 0.42; sfx.dash(); }
        } else {
          speed = 11 * this.diff.enemySpeed;
          e.modeT -= dt;
          if (Math.random() < 0.5) this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, t: 0, size: e.r * 0.8, color: def.color, kind: 'trail' });
          if (e.modeT <= 0) { e.mode = 'walk'; e.cool = rand(1.4, 2.4); }
        }
      } else {
        const wobble = Math.sin(e.t * 3) * (pathing ? 0.15 : 0.5);
        const turn = (e.type === 'brute' ? 1.5 : 3) * (pathing ? 2 : 1) * dt;
        e.angle += clamp(angleDiff(e.angle, chase + wobble), -turn, turn);
      }

      e.x += (Math.cos(e.angle) * speed + e.vx) * dt;
      e.y += (Math.sin(e.angle) * speed + e.vy) * dt;
      const f = Math.pow(0.01, dt);
      e.vx *= f;
      e.vy *= f;
      e.x = clamp(e.x, e.r, this.W - e.r);
      e.y = clamp(e.y, e.r, this.H - e.r);

      // The snake's body is a wall enemies can't pass through.
      for (let i = 2; i < s.segs.length; i++) {
        const g = s.segs[i];
        const rr = e.r + CFG.bodyR;
        const dd = d2(e.x, e.y, g.x, g.y);
        if (dd < rr * rr && dd > 0.0001) {
          const d = Math.sqrt(dd);
          e.x = g.x + ((e.x - g.x) / d) * rr;
          e.y = g.y + ((e.y - g.y) / d) * rr;
          if (e.mode === 'dash') { e.mode = 'walk'; e.cool = 1.5; }
        }
      }

      const hr = (CFG.headR + e.r) * 0.78;
      if (dist < hr) return this.die();
    }

    // Soft separation so swarms spread out instead of stacking.
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        const rr = a.r + b.r;
        const dd = d2(a.x, a.y, b.x, b.y);
        if (dd < rr * rr && dd > 0.0001) {
          const d = Math.sqrt(dd);
          const push = (rr - d) * 0.5;
          const nx = (a.x - b.x) / d, ny = (a.y - b.y) / d;
          a.x += nx * push; a.y += ny * push;
          b.x -= nx * push; b.y -= ny * push;
        }
      }
    }
    if (this.obstacles.length) {
      for (const e of es) {
        for (const b of this.obstacles) {
          if (pushOut(e, e.r, b) && e.mode === 'dash') { e.mode = 'walk'; e.cool = 1.5; e.hitT = 0.1; }
        }
      }
    }
    this.enemies = es.filter((e) => !e.dead);
  }

  updateSpawns(dt) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = (Math.max(0.45, 1.85 - this.wave * 0.14) / this.diff.spawnRate) * rand(0.75, 1.25);
      if (this.enemies.length + this.warns.length < this.maxEnemies()) {
        const n = this.wave >= 3 && Math.random() < 0.15 + this.wave * 0.04 ? 2 : 1;
        for (let i = 0; i < n; i++) this.queueEnemy();
      }
    }
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const w = this.warns[i];
      w.t += dt;
      if (w.t >= w.dur) {
        this.warns.splice(i, 1);
        this.spawnEnemy(w);
      }
    }

    this.pickupT -= dt;
    const starving = this.ammo === 0 && this.pickups.length === 0 && this.bombs.length === 0;
    if (starving && this.pickupT > this.diff.starveDelay) this.pickupT = this.diff.starveDelay;
    if (this.pickupT <= 0) {
      this.pickupT = rand(...this.diff.pickupEvery);
      if (this.pickups.length < this.diff.maxPickups && this.ammo + this.pickups.length < this.diff.maxAmmo) this.spawnPickup();
    }
  }

  updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = Math.pow(p.kind === 'smoke' ? 0.3 : 0.05, dt);
      p.vx *= f;
      p.vy *= f;
    }
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      t.y -= dt * 1.4;
      if (t.t >= t.life) this.texts.splice(i, 1);
    }
    if (this.blasts) {
      for (let i = this.blasts.length - 1; i >= 0; i--) {
        this.blasts[i].t += dt;
        if (this.blasts[i].t > 0.5) this.blasts.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  die() {
    if (this.state !== 'play') return;
    this.state = 'dying';
    this.deathT = 0;
    const s = this.snake;
    this.shake = 1;
    this.flash = 0.6;
    sfx.death();
    buzz(200);
    s.segs.forEach((g, i) => {
      if (i % 2) return;
      this.burst(g.x, g.y, i < this.ammo ? '#b6ff6e' : '#5cffb0', 4, 6);
    });
    this.burst(s.x, s.y, '#ffffff', 30, 10);
    this.hooks.onDeath?.();
  }

  summary() {
    return { mode: this.mode, difficulty: this.difficulty, score: this.score, wave: this.wave, kills: this.kills, bestCombo: this.bestCombo, length: this.snake.len, time: this.time };
  }

  // ----------------------------------------------------------------- helpers
  addScore(n, x, y, color, suffix = '') {
    n = Math.max(1, Math.round(n * this.diff.scoreMult));
    this.score += n;
    this.text(x, y, `+${n}${suffix}`, color, suffix ? 1.1 : 0.75);
  }

  text(x, y, str, color, size = 0.8) {
    this.texts.push({ x, y, str, color, size, t: 0, life: 0.9 });
  }

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(speed * 0.3, speed);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), t: 0, size: rand(0.08, 0.2), color, kind: 'spark' });
    }
  }

  // ------------------------------------------------------------------ render
  // view: { x, y, U } arena origin and pixels-per-unit in CSS pixels.
  draw(ctx, view) {
    const { U } = view;
    const sh = this.shake * this.shake;
    const ox = view.x + (Math.random() * 2 - 1) * sh * U * 0.6;
    const oy = view.y + (Math.random() * 2 - 1) * sh * U * 0.6;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(U, U);
    this.drawArena(ctx);

    if (this.state === 'idle') {
      this.drawIdle(ctx);
      ctx.restore();
      return;
    }

    this.drawWalls(ctx);
    this.drawWarns(ctx);
    this.drawFoods(ctx);
    this.drawPickups(ctx);
    for (const b of this.bombs) this.drawShadow(ctx, b.x, b.y, 0.32 * (1 - Math.min(b.z, 2) * 0.2));
    if (this.state === 'play' || (this.state === 'dying' && this.deathT < 0.05)) this.drawSnake(ctx);
    for (const e of this.enemies) this.drawEnemy(ctx, e);
    for (const b of this.bombs) this.drawBomb(ctx, b);
    this.drawBlasts(ctx);
    this.drawParticles(ctx);
    ctx.restore();

    // Text is drawn in screen space so it stays crisp at any scale.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.life;
      ctx.globalAlpha = 1 - k * k;
      const pop = 1 + Math.max(0, 0.3 - t.t) * 1.5;
      ctx.font = `800 ${Math.round(t.size * U * pop)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillText(t.str, ox + t.x * U + 1.5, oy + t.y * U + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, ox + t.x * U, oy + t.y * U);
    }
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,240,200,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, view.sw, view.sh);
    }
  }

  drawArena(ctx) {
    const W = this.W, H = this.H;
    ctx.fillStyle = 'rgba(20,28,56,0.55)';
    roundRect(ctx, 0, 0, W, H, 0.6);
    ctx.fill();
    ctx.lineWidth = 0.12;
    const pulse = this.state === 'play' ? 0.45 + Math.sin(this.t * 2) * 0.1 : 0.4;
    ctx.strokeStyle = `rgba(92,255,176,${pulse})`;
    ctx.stroke();
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = 'rgba(92,255,176,0.07)';
    ctx.stroke();
  }

  drawWalls(ctx) {
    if (!this.obstacles || !this.obstacles.length) return;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    for (const b of this.obstacles) {
      roundRect(ctx, b.x + 0.12, b.y + 0.22, b.w, b.h, 0.18);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + Math.sin(this.t * 2) * 0.05;
    for (const b of this.walls) ctx.drawImage(glowSprite('#7df9ff'), b.x - 0.7, b.y - 0.7, b.w + 1.4, b.h + 1.4);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const b of this.walls) {
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, '#2c3d82');
      g.addColorStop(1, '#18224f');
      ctx.fillStyle = g;
      roundRect(ctx, b.x, b.y, b.w, b.h, 0.18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(125,249,255,0.8)';
      ctx.lineWidth = 0.08;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(b.x + 0.2, b.y + 0.14);
      ctx.lineTo(b.x + b.w - 0.2, b.y + 0.14);
      ctx.stroke();
    }
    for (const c of this.crates) {
      ctx.fillStyle = '#7a4a14';
      roundRect(ctx, c.x, c.y, c.w, c.h, 0.1);
      ctx.fill();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 0.07;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,179,71,0.55)';
      ctx.lineWidth = 0.06;
      const i = 0.16;
      ctx.strokeRect(c.x + i, c.y + i, c.w - i * 2, c.h - i * 2);
      ctx.beginPath();
      ctx.moveTo(c.x + i, c.y + i); ctx.lineTo(c.x + c.w - i, c.y + c.h - i);
      ctx.moveTo(c.x + c.w - i, c.y + i); ctx.lineTo(c.x + i, c.y + c.h - i);
      ctx.stroke();
    }
  }

  drawIdle(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.idleSeed) {
      const r = 0.9 + Math.sin(this.t * 2 + p.p) * 0.2;
      ctx.drawImage(glowSprite(p.p > 3 ? '#ff8fd8' : '#7df9ff'), p.x - r, p.y + Math.sin(this.t + p.p) * 0.3 - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawShadow(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 0.1, y + 0.18, r, r * 0.7, 0, 0, TAU);
    ctx.fill();
  }

  drawFoods(ctx) {
    for (const f of this.foods) {
      const fade = f.life - f.t < 2 ? (Math.sin(f.t * 20) > 0 ? 1 : 0.3) : 1;
      const grow = Math.min(1, f.t * 5);
      const pulse = 1 + Math.sin(this.t * 4 + f.ph) * 0.12;
      const color = f.kind === 'gem' ? '#7df9ff' : '#ff8fd8';
      ctx.globalAlpha = fade;
      ctx.globalCompositeOperation = 'lighter';
      const gr = 1.0 * pulse * grow;
      ctx.drawImage(glowSprite(color), f.x - gr, f.y - gr, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
      if (f.kind === 'gem') {
        const r = 0.3 * grow;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(this.t * 2 + f.ph);
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 0.26 * pulse * grow, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(f.x - 0.08, f.y - 0.08, 0.08 * grow, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  drawPickups(ctx) {
    for (const p of this.pickups) {
      const bob = Math.sin(this.t * 3 + p.ph) * 0.12;
      const grow = Math.min(1, p.t * 4);
      ctx.globalCompositeOperation = 'lighter';
      const gr = 1.3 * grow;
      ctx.drawImage(glowSprite('#a0ff5a'), p.x - gr, p.y - gr + bob, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
      this.drawShadow(ctx, p.x, p.y + 0.15, 0.3 * grow);
      drawGrenade(ctx, p.x, p.y - 0.1 + bob, 0.36 * grow, Math.sin(this.t * 2 + p.ph) * 0.3);
    }
  }

  drawWarns(ctx) {
    for (const w of this.warns) {
      const k = w.t / w.dur;
      const color = ENEMY[w.type].color;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3 + 0.7 * (Math.sin(w.t * 25) * 0.5 + 0.5);
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, ENEMY[w.type].r * (2.2 - k * 1.2), 0, TAU);
      ctx.stroke();
      const c = 0.3;
      ctx.beginPath();
      ctx.moveTo(w.x - c, w.y - c); ctx.lineTo(w.x + c, w.y + c);
      ctx.moveTo(w.x + c, w.y - c); ctx.lineTo(w.x - c, w.y + c);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawSnake(ctx) {
    const s = this.snake;
    const segs = s.segs;
    const n = segs.length;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (let i = n - 1; i >= 0; i -= 1) {
      const g = segs[i];
      const r = this.segR(i, n);
      ctx.beginPath();
      ctx.arc(g.x + 0.1, g.y + 0.2, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = n - 1; i >= 0; i -= 3) {
      const g = segs[i];
      const r = this.segR(i, n) * 2.2;
      ctx.drawImage(glowSprite(i < this.ammo ? '#a0ff5a' : '#2bd98f'), g.x - r, g.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = n - 1; i >= 0; i--) {
      const g = segs[i];
      const r = this.segR(i, n);
      if (i < this.ammo) {
        drawGrenade(ctx, g.x, g.y, r * 0.95, s.angle + Math.PI / 2, true);
        continue;
      }
      const k = i / n;
      const stripe = i % 4 === 0;
      ctx.fillStyle = `hsl(${155 - k * 45}, 85%, ${stripe ? 42 : 55 - k * 10}%)`;
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(g.x - r * 0.3, g.y - r * 0.3, r * 0.35, 0, TAU);
      ctx.fill();
    }

    // Head
    const hr = CFG.headR;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    if (Math.sin(this.t * 7) > 0.6) {
      const flick = Math.sin(this.t * 40) * 0.08;
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(hr * 0.9, 0);
      ctx.lineTo(hr * 1.5, flick);
      ctx.moveTo(hr * 1.5, flick);
      ctx.lineTo(hr * 1.75, flick - 0.12);
      ctx.moveTo(hr * 1.5, flick);
      ctx.lineTo(hr * 1.75, flick + 0.12);
      ctx.stroke();
    }
    const hg = ctx.createRadialGradient(-0.1, -0.15, 0.05, 0, 0, hr * 1.2);
    hg.addColorStop(0, '#9dffd0');
    hg.addColorStop(1, '#1fbf7a');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0.05, 0, hr * 1.15, hr * 0.95, 0, 0, TAU);
    ctx.fill();
    const look = angleDiff(s.angle, s.target);
    for (const side of [-1, 1]) {
      const ex = hr * 0.35, ey = side * hr * 0.48;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, 0.17, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0b0f1e';
      ctx.beginPath();
      ctx.arc(ex + 0.06, ey + clamp(look, -1, 1) * 0.06, 0.09, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  segR(i, n) {
    return CFG.bodyR * (1 - (i / n) * 0.45);
  }

  drawEnemy(ctx, e) {
    const def = ENEMY[e.type];
    const flash = e.hitT > 0;
    this.drawShadow(ctx, e.x, e.y, e.r * 0.9);
    ctx.globalCompositeOperation = 'lighter';
    const gr = e.r * 2.2;
    ctx.drawImage(glowSprite(def.color), e.x - gr, e.y - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';

    if (e.type === 'dasher' && e.mode === 'aim') {
      ctx.strokeStyle = `rgba(255,183,3,${0.3 + Math.sin(this.t * 40) * 0.25})`;
      ctx.lineWidth = 0.08;
      ctx.setLineDash([0.3, 0.25]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.angle) * 5, e.y + Math.sin(e.angle) * 5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    const fill = flash ? '#ffffff' : def.color;
    ctx.fillStyle = fill;
    ctx.strokeStyle = def.dark;
    ctx.lineWidth = 0.08;

    if (e.type === 'crawler') {
      const leg = Math.sin(e.t * 18) * 0.12;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        for (let k = -1; k <= 1; k++) {
          const lx = k * 0.25;
          const sw = (k % 2 === 0 ? leg : -leg) * side;
          ctx.moveTo(lx, side * 0.25);
          ctx.lineTo(lx + sw + 0.05, side * 0.62);
        }
      }
      ctx.lineWidth = 0.07;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, e.r * 1.1, e.r * 0.85, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 0.08;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.9, 0);
      ctx.lineTo(e.r * 0.35, 0);
      ctx.stroke();
      eyes(ctx, e.r * 0.6, e.r * 0.3, 0.1);
    } else if (e.type === 'dasher') {
      const jitter = e.mode === 'aim' ? (Math.random() - 0.5) * 0.08 : 0;
      ctx.translate(jitter, jitter);
      ctx.beginPath();
      ctx.moveTo(e.r * 1.4, 0);
      ctx.lineTo(-e.r * 0.8, e.r * 0.95);
      ctx.lineTo(-e.r * 0.35, 0);
      ctx.lineTo(-e.r * 0.8, -e.r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      eyes(ctx, e.r * 0.45, e.r * 0.28, 0.09);
    } else {
      ctx.rotate(-e.angle + e.t * 0.6);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.12;
      ctx.stroke();
      ctx.rotate(e.angle - e.t * 0.6);
      eyes(ctx, e.r * 0.4, e.r * 0.3, 0.14);
      ctx.rotate(-e.angle);
      for (let k = 0; k < e.hp; k++) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc((k - (e.hp - 1) / 2) * 0.28, -e.r - 0.35, 0.09, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBomb(ctx, b) {
    const left = b.fuse - b.t;
    if (!b.landed) {
      // Crosshair on the landing spot while the grenade is in the air.
      const k = Math.min(1, b.t / b.flight);
      const r = 0.7 - k * 0.25;
      ctx.strokeStyle = `rgba(255,209,102,${0.5 + k * 0.4})`;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(b.tx, b.ty, r, 0, TAU);
      ctx.moveTo(b.tx - r - 0.25, b.ty); ctx.lineTo(b.tx - r + 0.2, b.ty);
      ctx.moveTo(b.tx + r - 0.2, b.ty); ctx.lineTo(b.tx + r + 0.25, b.ty);
      ctx.moveTo(b.tx, b.ty - r - 0.25); ctx.lineTo(b.tx, b.ty - r + 0.2);
      ctx.moveTo(b.tx, b.ty + r - 0.2); ctx.lineTo(b.tx, b.ty + r + 0.25);
      ctx.stroke();
    }
    const blink = left < 0.5 ? Math.sin(b.t * 50) > 0 : Math.sin(b.t * 18) > 0.3;
    const y = b.y - b.z * 0.6;
    if (blink) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowSprite('#ff4d6d'), b.x - 1, y - 1, 2, 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawGrenade(ctx, b.x, y, 0.32, b.rot, false, blink);
    if (b.landed && left < 0.7) {
      // Telegraph the blast radius just before detonation.
      ctx.strokeStyle = `rgba(255,77,109,${0.15 + (0.7 - left) * 0.5})`;
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(b.x, b.y, this.diff.blastR, 0, TAU);
      ctx.stroke();
    }
  }

  drawBlasts(ctx) {
    for (const b of this.blasts) {
      const k = b.t / 0.5;
      const e = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3);
      ctx.globalCompositeOperation = 'lighter';
      const gr = b.r * 1.6 * e;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.drawImage(glowSprite('#ff9a3c'), b.x - gr, b.y - gr, gr * 2, gr * 2);
      ctx.fillStyle = `rgba(255,240,200,${Math.max(0, 0.9 - k * 2.5)})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.7 * e, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(255,209,102,${Math.max(0, 1 - k)})`;
      ctx.lineWidth = 0.25 * (1 - k) + 0.02;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * e, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      if (p.kind !== 'smoke') continue;
      const k = p.t / p.life;
      ctx.globalAlpha = (1 - k) * 0.45;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + k), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of this.particles) {
      if (p.kind === 'smoke') continue;
      const k = p.t / p.life;
      ctx.globalAlpha = 1 - k;
      if (p.kind === 'trail') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k), 0, TAU);
        ctx.fill();
        continue;
      }
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * (1 - k * 0.5);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function eyes(ctx, x, y, r) {
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, side * y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(x + r * 0.35, side * y, r * 0.5, 0, TAU);
    ctx.fill();
  }
}

export function drawGrenade(ctx, x, y, r, rot = 0, onBody = false, lit = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = onBody ? '#6ea83a' : '#5f9230';
  ctx.beginPath();
  ctx.ellipse(0, 0.08 * r, r * 0.85, r, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, 0.1 * r); ctx.lineTo(r * 0.8, 0.1 * r);
  ctx.moveTo(0, -r * 0.85); ctx.lineTo(0, r * 1.05);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.25, r * 0.25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(-r * 0.35, -r * 1.25, r * 0.7, r * 0.4);
  ctx.strokeStyle = lit ? '#ff4d6d' : '#c9c9c9';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 1.05, r * 0.25, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
