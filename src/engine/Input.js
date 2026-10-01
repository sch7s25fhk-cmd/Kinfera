// Tastatur und Touch → abstrakte Aktionen. "pressed" gilt genau einen Update-Schritt.

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

export class Input {
  /** @param {Window} target */
  constructor(target) {
    this.held = new Set();
    this.pressed = new Set();
    // Zuletzt gedrückte Richtung gewinnt (saubere Diagonal-Auflösung)
    this.dirStack = [];

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

    // Beim Fokusverlust alle Tasten loslassen, sonst "klemmt" die Bewegung
    target.addEventListener('blur', () => {
      this.held.clear();
      this.dirStack = [];
    });
  }

  /** Auch für virtuelle Tasten (Touch-Steuerung) */
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

  /** Aktuell gehaltene Richtung (zuletzt gedrückt) oder null */
  direction() {
    return this.dirStack.length ? this.dirStack[this.dirStack.length - 1] : null;
  }

  /** Nach jedem Update-Schritt aufrufen */
  endStep() {
    this.pressed.clear();
  }
}
