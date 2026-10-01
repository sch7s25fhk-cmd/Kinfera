// Einfaches Pause-Overlay. Wird in Phase 5 zum vollen Menü ausgebaut.

import { Scene } from '../engine/Scene.js';
import { COLORS } from '../data/palette.js';

export class PauseScene extends Scene {
  constructor() {
    super();
    this.transparent = true;
  }

  update() {
    const input = this.game.input;
    if (input.consumeTap() || input.wasPressed('cancel') || input.wasPressed('confirm')) this.game.pop();
  }

  render(r) {
    r.withAlpha(0.6, () => r.fillRect(0, 0, r.width, r.height, COLORS.ink));
    const w = Math.min(150, r.width - 16);
    const lines = r.wrapText('Das Menü folgt in Phase 5.', w - 12);
    const h = 30 + lines.length * 7;
    const x = Math.round((r.width - w) / 2);
    const y = Math.round((r.height - h) / 2);
    r.fillRect(x, y, w, h, COLORS.night);
    r.strokeRect(x + 1, y + 1, w - 2, h - 2, COLORS.mist);
    r.text('PAUSE', r.width / 2, y + 7, COLORS.glow, { align: 'center' });
    r.text(lines.join('\n'), r.width / 2, y + 17, COLORS.white, { align: 'center' });
    r.text('Tippen: weiter', r.width / 2, y + h - 10, COLORS.mist, { align: 'center' });
  }
}
