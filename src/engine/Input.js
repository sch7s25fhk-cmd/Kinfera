// Eingabe → abstrakte Aktionen.
// Touch: beliebig viele Finger gleichzeitig (pointers) + Taps für UI.
// Tastatur: Entwicklerhilfe am PC.

const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  KeyX: 'shoot', KeyJ: 'shoot', KeyK: 'shoot',
  Enter: 'confirm',
  Escape: 'cancel', KeyP: 'cancel',
  F1: 'debug1', F2: 'debug2',
};

const TAP_MAX_TIME = 0.3; // Sekunden
const TAP_MAX_MOVE = 8; // Spielpixel

export class Input {
  /** @param {Window} target */
  constructor(target) {
    this.held = new Set();
    this.pressed = new Set();
    /** @type {Map<number, {x: number, y: number, startX: number, startY: number, startTime: number, moved: boolean}>} */
    this.pointers = new Map();
    /** Taps dieses Update-Schritts */
    this.taps = [];
    // Quellen, die eine Aktion gerade halten (Tastatur, Touch-Tasten …)
    this.sources = new Map();

    target.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) this.setHeld(action, 'key', true);
    });
    target.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      this.setHeld(action, 'key', false);
    });
    target.addEventListener('blur', () => this.reset());
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(clientX: number, clientY: number) => {x: number, y: number}} toGame
   */
  attachPointer(canvas, toGame) {
    const now = () => performance.now() / 1000;

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const pos = toGame(e.clientX, e.clientY);
      this.pointers.set(e.pointerId, { x: pos.x, y: pos.y, startX: pos.x, startY: pos.y, startTime: now(), moved: false });
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const pos = toGame(e.clientX, e.clientY);
      p.x = pos.x;
      p.y = pos.y;
      if (Math.hypot(p.x - p.startX, p.y - p.startY) > TAP_MAX_MOVE) p.moved = true;
    });

    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (e.type === 'pointerup' && !p.moved && now() - p.startTime <= TAP_MAX_TIME) {
        this.taps.push({ x: p.startX, y: p.startY });
      }
      this.pointers.delete(e.pointerId);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Eine Quelle (z. B. 'key' oder 'touch') hält eine Aktion oder lässt sie los.
   * Die Aktion gilt als gehalten, solange mindestens eine Quelle sie hält.
   */
  setHeld(action, source, down) {
    let set = this.sources.get(action);
    if (!set) {
      set = new Set();
      this.sources.set(action, set);
    }
    const was = set.size > 0;
    if (down) set.add(source);
    else set.delete(source);
    const is = set.size > 0;
    if (is && !was) {
      this.held.add(action);
      this.pressed.add(action);
    } else if (!is && was) {
      this.held.delete(action);
    }
  }

  reset() {
    this.held.clear();
    this.sources.clear();
    this.pointers.clear();
  }

  isDown(action) {
    return this.held.has(action);
  }

  wasPressed(action) {
    return this.pressed.has(action);
  }

  /** Erster Tap dieses Schritts (wird verbraucht) oder null */
  consumeTap() {
    return this.taps.shift() ?? null;
  }

  /** Nach jedem Update-Schritt aufrufen */
  endStep() {
    this.pressed.clear();
    this.taps.length = 0;
  }
}
