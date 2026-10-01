// Hintergrund: Himmel und das Wolkenmeer unter den Inseln (Parallaxe + langsames Treiben).

import { createRng } from '../engine/rng.js';
import { COLORS } from '../data/palette.js';

const WRAP = 640; // Breite, nach der sich das Wolkenmuster wiederholt

export class CloudSea {
  constructor(seed = 7) {
    const rng = createRng(seed);
    // Zwei Ebenen: fern (langsam, dunkler) und nah (schneller, hell)
    this.layers = [
      { parallax: 0.15, drift: 3, color: COLORS.mist, puffs: makePuffs(rng, 40, 6, 14) },
      { parallax: 0.35, drift: 7, color: COLORS.white, puffs: makePuffs(rng, 34, 8, 18) },
    ];
  }

  /**
   * @param {import('../engine/Renderer.js').Renderer} r
   * @param {import('../engine/Camera.js').Camera} cam
   * @param {number} time
   */
  render(r, cam, time) {
    r.clear(COLORS.sky);
    // Horizontale Himmelsbänder für etwas Tiefe
    r.fillRect(0, 0, r.width, 24, '#86c4e8');
    r.fillRect(0, 24, r.width, 6, '#93ccec');

    for (const layer of this.layers) {
      const ox = -(cam.x * layer.parallax + time * layer.drift);
      const oy = -cam.y * layer.parallax * 0.5;
      for (const p of layer.puffs) {
        // Horizontal wiederholen, damit der Himmel nie leer wird
        let x = ((p.x + ox) % WRAP + WRAP) % WRAP - p.r;
        for (; x < r.width + p.r; x += WRAP) {
          r.fillCircle(x, p.y + oy, p.r, layer.color);
        }
      }
    }
  }
}

function makePuffs(rng, count, minR, maxR) {
  const puffs = [];
  for (let i = 0; i < count; i++) {
    puffs.push({ x: rng.int(0, WRAP), y: rng.int(30, 220), r: rng.int(minR, maxR) });
  }
  return puffs;
}
