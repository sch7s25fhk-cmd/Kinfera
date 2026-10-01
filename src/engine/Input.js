// Eingabe → abstrakte Aktionen.
// Primär Touch/Pointer: Tippen (tap) und Halten/Ziehen (hold). Die Tastatur bleibt
// nur als Entwicklerhilfe am PC erhalten.

const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Enter: 'confirm', Space: 'confirm',
  Escape: 'cancel', Backspace: 'cancel',
  F1: 'debug1', F2: 'debug2', F3: 'debug3', F4: 'debug4',
};

export const DIRECTIONS = ['up', 'down', 'left', 'right'];

const TAP_MAX_TIME = 0.3; // Sekunden
const TAP_MAX_MOVE = 6; // Spielpixel
const HOLD_DELAY = 0.2; // ab hier gilt ein ruhender Finger als "Halten"

export class Input {
  /** @param {Window} target */
  constructor(target) {
    this.held = new Set();
    this.pressed = new Set();
    // Zuletzt gedrückte Richtung gewinnt (saubere Diagonal-Auflösung)
    this.dirStack = [];

    /** Aktueller Finger/Mauszeiger in Spielkoordinaten */
    this.pointer = { down: false, x: 0, y: 0, startX: 0, startY: 0, startTime: 0, moved: false, id: null };
    /** Taps dieses Update-Schritts */
    this.taps = [];

    target.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      this.press(action);
    });

    target.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      this.release(action);
    });

    // Beim Fokusverlust alles loslassen, sonst "klemmt" die Bewegung
    target.addEventListener('blur', () => {
      this.held.clear();
      this.dirStack = [];
      this.pointer.down = false;
    });
  }

  /**
   * Pointer-Ereignisse auf dem Canvas abonnieren.
   * @param {HTMLCanvasElement} canvas
   * @param {(clientX: number, clientY: number) => {x: number, y: number}} toGame
   */
  attachPointer(canvas, toGame) {
    const p = this.pointer;
    const now = () => performance.now() / 1000;

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (p.down) return; // nur ein Finger zählt
      canvas.setPointerCapture?.(e.pointerId);
      const pos = toGame(e.clientX, e.clientY);
      Object.assign(p, { down: true, id: e.pointerId, x: pos.x, y: pos.y, startX: pos.x, startY: pos.y, startTime: now(), moved: false });
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!p.down || e.pointerId !== p.id) return;
      const pos = toGame(e.clientX, e.clientY);
      p.x = pos.x;
      p.y = pos.y;
      if (Math.hypot(p.x - p.startX, p.y - p.startY) > TAP_MAX_MOVE) p.moved = true;
    });

    const end = (e) => {
      if (!p.down || e.pointerId !== p.id) return;
      const isTap = !p.moved && now() - p.startTime <= TAP_MAX_TIME;
      if (isTap && e.type === 'pointerup') this.taps.push({ x: p.startX, y: p.startY });
      p.down = false;
      p.id = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(action) {
    this.held.add(action);
    this.pressed.add(action);
    if (DIRECTIONS.includes(action)) {
      this.dirStack = this.dirStack.filter((d) => d !== action);
      this.dirStack.push(action);
    }
  }

  release(action) {
    this.held.delete(action);
    this.dirStack = this.dirStack.filter((d) => d !== action);
  }

  isDown(action) {
    return this.held.has(action);
  }

  wasPressed(action) {
    return this.pressed.has(action);
  }

  /** Tastatur-Richtung (zuletzt gedrückt) oder null */
  direction() {
    return this.dirStack.length ? this.dirStack[this.dirStack.length - 1] : null;
  }

  /** Erster Tap dieses Schritts (wird verbraucht) oder null */
  consumeTap() {
    return this.taps.shift() ?? null;
  }

  /** Finger liegt länger auf oder wird gezogen */
  isHolding() {
    const p = this.pointer;
    return p.down && (p.moved || performance.now() / 1000 - p.startTime > HOLD_DELAY);
  }

  /** Nach jedem Update-Schritt aufrufen */
  endStep() {
    this.pressed.clear();
    this.taps.length = 0;
  }
}
