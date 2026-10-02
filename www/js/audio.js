// Procedural sound effects via WebAudio, so the game ships with zero audio assets.
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let lastBoom = 0;

try { muted = localStorage.getItem('grenadder.muted') === '1'; } catch { /* storage unavailable */ }

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('grenadder.muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
}

function tone({ freq = 440, to = 0, dur = 0.1, type = 'square', vol = 0.2, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.3, f0 = 3000, f1 = 200, type = 'lowpass', delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  eat() { tone({ freq: 520, to: 1040, dur: 0.08, type: 'triangle', vol: 0.18 }); },
  gem() {
    tone({ freq: 880, to: 1320, dur: 0.07, type: 'triangle', vol: 0.15 });
    tone({ freq: 1320, to: 1760, dur: 0.09, type: 'triangle', vol: 0.12, delay: 0.05 });
  },
  pickup() {
    tone({ freq: 330, dur: 0.08, type: 'square', vol: 0.12 });
    tone({ freq: 660, dur: 0.12, type: 'square', vol: 0.12, delay: 0.07 });
  },
  throw() { noise({ dur: 0.18, vol: 0.18, f0: 600, f1: 3000, type: 'bandpass' }); },
  empty() { tone({ freq: 140, to: 90, dur: 0.12, type: 'square', vol: 0.1 }); },
  bounce() { tone({ freq: 220, to: 160, dur: 0.05, type: 'triangle', vol: 0.08 }); },
  boom() {
    if (!ctx) return;
    // Throttle stacked chain explosions so they don't clip into mush.
    const now = ctx.currentTime;
    const v = now - lastBoom < 0.06 ? 0.25 : 0.5;
    lastBoom = now;
    noise({ dur: 0.7, vol: v, f0: 2400, f1: 60 });
    tone({ freq: 120, to: 35, dur: 0.45, type: 'sine', vol: v * 0.9 });
  },
  kill() { tone({ freq: 700, to: 200, dur: 0.12, type: 'sawtooth', vol: 0.08 }); },
  hit() { tone({ freq: 300, to: 220, dur: 0.06, type: 'square', vol: 0.08 }); },
  spawn() { tone({ freq: 90, to: 180, dur: 0.15, type: 'sine', vol: 0.06 }); },
  dash() { noise({ dur: 0.25, vol: 0.12, f0: 3000, f1: 800, type: 'highpass' }); },
  wave() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.14, delay: i * 0.08 }));
  },
  death() {
    noise({ dur: 1.2, vol: 0.5, f0: 1800, f1: 40 });
    tone({ freq: 440, to: 55, dur: 1.0, type: 'sawtooth', vol: 0.18 });
  },
  shoot() { tone({ freq: 1200, to: 500, dur: 0.05, type: 'square', vol: 0.035 }); },
  power() {
    [440, 660, 880].forEach((f, i) => tone({ freq: f, dur: 0.1, type: 'triangle', vol: 0.14, delay: i * 0.06 }));
  },
  click() { tone({ freq: 900, dur: 0.04, type: 'square', vol: 0.06 }); },
};

// Haptics: Capacitor native plugin when wrapped as an app, Vibration API on the web.
export function buzz(ms = 20) {
  const H = window.Capacitor?.Plugins?.Haptics;
  if (H) {
    const style = ms >= 120 ? 'HEAVY' : ms >= 35 ? 'MEDIUM' : 'LIGHT';
    H.impact({ style }).catch(() => {});
  } else if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
}
