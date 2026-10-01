// Einfaches Pause-Overlay (Esc). Wird in Phase 5 zum vollen Menü ausgebaut.

import { Scene } from '../engine/Scene.js';
import { COLORS } from '../data/palette.js';

export class PauseScene extends Scene {
  constructor() {
    super();
    this.transparent = true;
  }

  update() {
    const input = this.game.input;
    if (input.wasPressed('cancel') || input.wasPressed('confirm')) this.game.pop();
  }

  render(r) {
    r.withAlpha(0.6, () => r.fillRect(0, 0, r.width, r.height, COLORS.ink));
    const w = 120;
    const h = 44;
    const x = (r.width - w) / 2;
    const y = (r.height - h) / 2;
    r.fillRect(x, y, w, h, COLORS.night);
    r.strokeRect(x + 1, y + 1, w - 2, h - 2, COLORS.mist);
    r.text('PAUSE', r.width / 2, y + 8, COLORS.glow, { align: 'center' });
    r.text('Das Menü folgt in Phase 5.', r.width / 2, y + 20, COLORS.white, { align: 'center' });
    r.text('Esc / A / B: weiter', r.width / 2, y + 31, COLORS.mist, { align: 'center' });
  }
}
