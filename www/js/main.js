import { Game } from './game.js';
import { Input } from './input.js';
import { initAudio, sfx, isMuted, setMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const HUD_H = 64;
const PAD = 10;

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
let best = Number(store.get('grenadder.best', 0)) || 0;

const ui = {
  hud: $('hud'), score: $('score'), combo: $('combo'), wave: $('wave'), ammo: $('ammo'), banner: $('banner'),
  menu: $('menu'), pause: $('pause'), over: $('over'),
};

let paused = false;
let view = { x: 0, y: 0, U: 20, sw: 0, sh: 0 };
let bg = null;

const game = new Game({
  onWave(n) { showBanner(`WAVE ${n}`); },
  onCombo(c) {
    if (c < 2) return;
    ui.combo.classList.remove('pop');
    void ui.combo.offsetWidth;
    ui.combo.classList.add('pop');
  },
  onGameOver(sum) {
    const isBest = sum.score > best;
    if (isBest) {
      best = sum.score;
      store.set('grenadder.best', String(best));
    }
    $('over-score').textContent = sum.score.toLocaleString();
    $('over-best').textContent = best.toLocaleString();
    $('over-new').classList.toggle('hidden', !isBest || sum.score === 0);
    $('over-stats').innerHTML =
      `Wave ${sum.wave} &middot; ${sum.kills} kills &middot; best combo x${sum.bestCombo}<br>` +
      `Length ${sum.length} &middot; ${Math.floor(sum.time)}s survived`;
    ui.hud.classList.add('hidden');
    show(ui.over);
  },
});
const input = new Input(canvas);
input.onPause = () => togglePause();

// ------------------------------------------------------------------ layout
function safeInsets() {
  const cs = getComputedStyle($('safe'));
  return {
    t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0,
  };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const sw = window.innerWidth, sh = window.innerHeight;
  canvas.width = Math.round(sw * dpr);
  canvas.height = Math.round(sh * dpr);
  canvas.style.width = sw + 'px';
  canvas.style.height = sh + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const ins = safeInsets();
  const x = ins.l + PAD, y = ins.t + HUD_H;
  const w = sw - ins.l - ins.r - PAD * 2;
  const h = sh - y - ins.b - PAD;
  // ~17 units across the short side, clamped so desktop arenas feel roomy.
  const U = Math.max(14, Math.min(36, Math.min(w, h) / 17));
  view = { x, y, U, sw, sh, dpr };
  game.resize(w / U, h / U);
  buildBackground(sw, sh, dpr);
}

function buildBackground(sw, sh, dpr) {
  bg = document.createElement('canvas');
  bg.width = Math.round(sw * dpr);
  bg.height = Math.round(sh * dpr);
  const g = bg.getContext('2d');
  g.scale(dpr, dpr);
  const grad = g.createRadialGradient(sw / 2, sh * 0.4, 0, sw / 2, sh * 0.4, Math.max(sw, sh) * 0.8);
  grad.addColorStop(0, '#16204a');
  grad.addColorStop(1, '#070a16');
  g.fillStyle = grad;
  g.fillRect(0, 0, sw, sh);
  const step = view.U;
  g.fillStyle = 'rgba(140,170,255,0.08)';
  for (let yy = view.y % step; yy < sh; yy += step) {
    for (let xx = view.x % step; xx < sw; xx += step) g.fillRect(xx - 1, yy - 1, 2, 2);
  }
}

// ---------------------------------------------------------------- screens
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function startGame() {
  initAudio();
  sfx.click();
  hide(ui.menu); hide(ui.over); hide(ui.pause);
  show(ui.hud);
  paused = false;
  input.reset();
  game.reset();
  lastAmmo = -1;
  lastScore = -1;
  showBanner('WAVE 1');
}

function toMenu() {
  sfx.click();
  hide(ui.pause); hide(ui.over); hide(ui.hud);
  paused = false;
  game.state = 'idle';
  game.makeIdleScene();
  $('menu-best').textContent = best.toLocaleString();
  show(ui.menu);
}

function togglePause(force) {
  if (game.state !== 'play') return;
  paused = force ?? !paused;
  if (paused) {
    input.reset();
    show(ui.pause);
  } else {
    hide(ui.pause);
    last = performance.now();
  }
}

let bannerTimer = 0;
function showBanner(text) {
  ui.banner.textContent = text;
  ui.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => ui.banner.classList.remove('show'), 1300);
}

function syncMute() { $('btn-mute').textContent = `SOUND: ${isMuted() ? 'OFF' : 'ON'}`; }

$('btn-play').addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);
$('btn-restart').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', () => { sfx.click(); togglePause(false); });
$('btn-menu').addEventListener('click', toMenu);
$('btn-over-menu').addEventListener('click', toMenu);
$('btn-pause').addEventListener('click', () => togglePause(true));
$('btn-mute').addEventListener('click', () => { initAudio(); setMuted(!isMuted()); syncMute(); sfx.click(); });
document.addEventListener('pointerdown', () => initAudio(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

// Native app integration when running inside Capacitor (no-ops on the web).
const Cap = window.Capacitor;
Cap?.Plugins?.App?.addListener('backButton', () => {
  if (game.state === 'play' && !paused) togglePause(true);
  else if (paused) togglePause(false);
  else if (!ui.menu.classList.contains('hidden')) Cap.Plugins.App.exitApp();
  else toMenu();
});
Cap?.Plugins?.App?.addListener('pause', () => togglePause(true));

// -------------------------------------------------------------------- HUD
let lastAmmo = -1, lastScore = -1, lastWave = -1, lastCombo = -1;
function updateHud() {
  if (game.state !== 'play' && game.state !== 'dying') return;
  if (game.score !== lastScore) {
    lastScore = game.score;
    ui.score.textContent = game.score.toLocaleString();
  }
  if (game.ammo !== lastAmmo) {
    lastAmmo = game.ammo;
    let html = '';
    for (let i = 0; i < 5; i++) html += `<i class="${i < game.ammo ? '' : 'empty'}"></i>`;
    ui.ammo.innerHTML = html;
  }
  if (game.wave !== lastWave) {
    lastWave = game.wave;
    ui.wave.textContent = `WAVE ${game.wave}`;
  }
  const c = game.combo >= 2 ? game.combo : 0;
  if (c !== lastCombo) {
    lastCombo = c;
    ui.combo.textContent = c ? `COMBO x${Math.min(c, 10)}` : '';
  }
}

// ------------------------------------------------------------------- loop
function drawStick() {
  const s = input.stick;
  if (!s || game.state !== 'play' || s.maxMove < 10) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.ox, s.oy, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const STEP = 1 / 120;
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  if (!paused) {
    const steps = Math.max(1, Math.ceil(dt / STEP));
    for (let i = 0; i < steps; i++) game.update(dt / steps, input);
  }
  ctx.drawImage(bg, 0, 0, view.sw, view.sh);
  game.draw(ctx, view);
  drawStick();
  updateHud();
  requestAnimationFrame(frame);
}

resize();
syncMute();
$('menu-best').textContent = best.toLocaleString();
requestAnimationFrame(frame);

// Test hook for automated smoke tests.
window.__grenadder = { game, input, startGame };
