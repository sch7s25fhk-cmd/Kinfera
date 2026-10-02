// Konturen an Inselrändern und Aufwind-Strömungslinien.

import { PALETTE } from '../data/palette.js';
import { SOLID_GROUND } from '../data/tiles.js';

/**
 * @param {import('../engine/Renderer.js').Renderer} r
 * @param {import('../engine/Tilemap.js').Tilemap} map
 * @param {{x: number, y: number, viewWidth: number, viewHeight: number}} cam
 * @param {number} time
 */
export function renderLevelDecor(r, map, cam, time) {
  const ts = map.tileSize;
  const { x0, y0, x1, y1 } = map.visibleRange(cam);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const id = map.get(tx, ty);
      const sx = tx * ts - cam.x;
      const sy = ty * ts - cam.y;
      if (id === 'dirt') {
        // Tiefe: je weiter unter der Oberfläche, desto dunkler
        let depth = 0;
        while (depth < 4 && SOLID_GROUND.has(map.get(tx, ty - depth - 1))) depth++;
        r.withAlpha(0.09 * depth, () => r.fillRect(sx, sy, ts, ts, PALETTE[1]));
      }
      if (SOLID_GROUND.has(id)) {
        const top = id === 'groundTop';
        if (!SOLID_GROUND.has(map.get(tx - 1, ty))) {
          r.fillRect(sx, sy + (top ? 1 : 0), 1, ts, PALETTE[0]);
          r.fillRect(sx + 1, sy + (top ? 3 : 0), 1, ts - (top ? 3 : 0), top ? PALETTE[9] : PALETTE[9]);
        }
        if (!SOLID_GROUND.has(map.get(tx + 1, ty))) {
          r.fillRect(sx + ts - 1, sy + (top ? 1 : 0), 1, ts, PALETTE[0]);
          r.fillRect(sx + ts - 2, sy + (top ? 3 : 0), 1, ts - (top ? 3 : 0), PALETTE[9]);
        }
      }
      if (id === 'wind') {
        // Wellenlinien, die nach oben wandern
        for (let k = 0; k < 2; k++) {
          const lx = sx + 4 + k * 8;
          const phase = (time * 40 + k * 7 + tx * 5) % ts;
          const ly = sy + ts - phase;
          r.withAlpha(0.35, () => r.fillRect(Math.round(lx + Math.sin(time * 6 + ly * 0.3) * 1.5), Math.round(ly), 1, 4, PALETTE[4]));
        }
      }
    }
  }
}
