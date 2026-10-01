// Schwebende Echo-Lichter: kleine glimmende Partikel, die langsam aufsteigen.

import { createRng } from '../engine/rng.js';
import { PALETTE } from '../data/palette.js';

const COUNT = 22;

export class Ambience {
  constructor(seed = 11) {
    this.rng = createRng(seed);
    this.motes = [];
  }

  /** Partikel leben in Bildschirmkoordinaten relativ zur Kamera (wandern mit der Welt mit) */
  update(dt, cam) {
    const w = cam.viewWidth;
    const h = cam.viewHeight;
    while (this.motes.length < COUNT) this.motes.push(this.spawn(cam, true));
    for (const m of this.motes) {
      m.age += dt;
      m.wy -= m.speed * dt;
      m.wx += Math.sin(m.age * m.wobble + m.phase) * 4 * dt;
      const sx = m.wx - cam.x;
      const sy = m.wy - cam.y;
      if (m.age > m.life || sx < -8 || sx > w + 8 || sy < -8 || sy > h + 8) Object.assign(m, this.spawn(cam, false));
    }
  }

  spawn(cam, anywhere) {
    const rng = this.rng;
    return {
      wx: cam.x + rng.range(0, cam.viewWidth),
      wy: cam.y + (anywhere ? rng.range(0, cam.viewHeight) : rng.range(cam.viewHeight * 0.3, cam.viewHeight + 4)),
      speed: rng.range(3, 9),
      wobble: rng.range(0.8, 2),
      phase: rng.range(0, 6.28),
      age: 0,
      life: rng.range(4, 9),
      big: rng.chance(0.25),
    };
  }

  render(r, cam) {
    for (const m of this.motes) {
      // Ein- und Ausblenden + Funkeln
      const fade = Math.min(1, m.age / 1, (m.life - m.age) / 1);
      const twinkle = 0.6 + 0.4 * Math.sin(m.age * 5 + m.phase);
      const alpha = Math.max(0, fade * twinkle * 0.85);
      const x = Math.round(m.wx - cam.x);
      const y = Math.round(m.wy - cam.y);
      r.withAlpha(alpha, () => {
        r.fillRect(x, y, 1, 1, PALETTE[8]);
        if (m.big) {
          r.fillRect(x - 1, y, 1, 1, PALETTE[4]);
          r.fillRect(x + 1, y, 1, 1, PALETTE[4]);
          r.fillRect(x, y - 1, 1, 1, PALETTE[4]);
          r.fillRect(x, y + 1, 1, 1, PALETTE[4]);
        }
      });
    }
  }
}
