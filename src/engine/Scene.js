// Basisklasse für Szenen auf dem Szenen-Stack.
export class Scene {
  constructor() {
    /** @type {import('./Game.js').Game | null} */
    this.game = null;
    // true = darunterliegende Szene wird weiter gezeichnet (z. B. Menü-Overlay)
    this.transparent = false;
  }

  enter() {}
  exit() {}
  /** @param {number} dt Sekunden */
  update(dt) {}
  /** @param {import('./Renderer.js').Renderer} r */
  render(r) {}
}
