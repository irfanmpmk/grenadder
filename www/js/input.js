// Unified touch / mouse / keyboard input.
// - Drag anywhere: floating joystick that steers the snake.
// - Quick tap (or second finger): throw a grenade at that spot.
// - Keyboard: arrows/WASD steer, Space throws straight ahead.
const TAP_MS = 260;
const TAP_PX = 14;
const STICK_RADIUS = 56;

export class Input {
  constructor(el) {
    this.stick = null;      // active steering pointer
    this.stickAngle = null; // last steering direction from the stick
    this.throws = [];       // queued throws: { sx, sy } screen point, or { fwd: true }
    this.keys = new Set();
    this.onPause = null;

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.stick = null; });
  }

  reset() {
    this.stick = null;
    this.stickAngle = null;
    this.throws.length = 0;
    this.keys.clear();
  }

  down(e) {
    e.preventDefault();
    if (this.stick) {
      // Second finger while steering = throw at that finger.
      this.throws.push({ sx: e.clientX, sy: e.clientY });
      return;
    }
    try { e.target.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), maxMove: 0 };
  }

  move(e) {
    const s = this.stick;
    if (!s || s.id !== e.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    let dx = s.x - s.ox;
    let dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    s.maxMove = Math.max(s.maxMove, d);
    if (d > 10) this.stickAngle = Math.atan2(dy, dx);
    if (d > STICK_RADIUS) {
      // Drag the origin along so reversing direction is instant.
      s.ox = s.x - (dx / d) * STICK_RADIUS;
      s.oy = s.y - (dy / d) * STICK_RADIUS;
    }
  }

  up(e, cancelled = false) {
    const s = this.stick;
    if (!s || s.id !== e.pointerId) return;
    if (!cancelled && performance.now() - s.t0 < TAP_MS && s.maxMove < TAP_PX) this.throws.push({ sx: s.x, sy: s.y });
    this.stick = null;
  }

  key(e, isDown) {
    const k = e.key.toLowerCase();
    if (isDown && !e.repeat && (k === ' ' || k === 'enter')) {
      this.throws.push({ fwd: true });
      e.preventDefault();
      return;
    }
    if (isDown && !e.repeat && (k === 'escape' || k === 'p')) {
      this.onPause?.();
      return;
    }
    const dirKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
    if (!dirKeys.includes(k)) return;
    e.preventDefault();
    if (isDown) this.keys.add(k); else this.keys.delete(k);
  }

  // Desired heading in radians, or null to keep going straight.
  get angle() {
    if (this.keys.size) {
      let x = 0, y = 0;
      if (this.keys.has('arrowleft') || this.keys.has('a')) x -= 1;
      if (this.keys.has('arrowright') || this.keys.has('d')) x += 1;
      if (this.keys.has('arrowup') || this.keys.has('w')) y -= 1;
      if (this.keys.has('arrowdown') || this.keys.has('s')) y += 1;
      if (x || y) return Math.atan2(y, x);
    }
    return this.stick ? this.stickAngle : null;
  }

  consumeThrow() {
    return this.throws.shift() || null;
  }
}
