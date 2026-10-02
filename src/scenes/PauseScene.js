// Pause: Weiter oder Level neu starten (per Tippen).

import { Scene } from '../engine/Scene.js';
import { PALETTE } from '../data/palette.js';
import { drawPanel, hitRect } from '../ui/hud.js';

export class PauseScene extends Scene {
  /** @param {() => void} onRestart */
  constructor(onRestart) {
    super();
    this.transparent = true;
    this.onRestart = onRestart;
    this.buttons = [];
  }

  enter() {
    // Gehaltene Touch-Tasten loslassen, sonst läuft Lio nach der Pause weiter
    for (const a of ['left', 'right', 'jump', 'shoot']) this.game.input.setHeld(a, 'touch', false);
  }

  update() {
    const input = this.game.input;
    const tap = input.consumeTap();
    const b = tap && hitRect(this.buttons, tap.x, tap.y);
    if (b?.label === 'Neustart') {
      this.game.pop();
      this.onRestart();
    } else if (b || input.wasPressed('cancel') || input.wasPressed('confirm')) {
      this.game.pop();
    }
  }

  render(r) {
    r.withAlpha(0.55, () => r.fillRect(0, 0, r.width, r.height, PALETTE[0]));
    this.buttons = drawPanel(r, 'Pause', ['Lio wartet auf dich.'], ['Weiter', 'Neustart']);
  }
}
