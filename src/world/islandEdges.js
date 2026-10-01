// Zeichnet Konturen an den Inselrändern (Übergang Boden → Wolkenmeer),
// damit die Inseln als schwebende Plateaus lesbar sind.

import { PALETTE } from '../data/palette.js';
import { GROUND_TILES } from '../data/tiles.js';

const isOpen = (id) => id === null || id === 'void' || id === 'cliffBottom';

/**
 * @param {import('../engine/Renderer.js').Renderer} r
 * @param {import('../engine/Tilemap.js').Tilemap} map
 * @param {import('../engine/Camera.js').Camera} cam
 */
export function renderIslandEdges(r, map, cam) {
  const ts = map.tileSize;
  const x0 = Math.max(0, Math.floor(cam.x / ts));
  const y0 = Math.max(0, Math.floor(cam.y / ts));
  const x1 = Math.min(map.width - 1, Math.floor((cam.x + cam.viewWidth) / ts));
  const y1 = Math.min(map.height - 1, Math.floor((cam.y + cam.viewHeight) / ts));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const id = map.get(tx, ty);
      const ground = GROUND_TILES.has(id);
      if (!ground && id !== 'cliff') continue;
      const sx = tx * ts - cam.x;
      const sy = ty * ts - cam.y;

      if (ground && isOpen(map.get(tx, ty - 1))) {
        r.fillRect(sx, sy, ts, 1, PALETTE[0]);
        r.fillRect(sx, sy + 1, ts, 1, PALETTE[7]);
      }
      const side = ground ? PALETTE[5] : PALETTE[9];
      if (isOpen(map.get(tx - 1, ty))) {
        r.fillRect(sx, sy, 1, ts, PALETTE[0]);
        r.fillRect(sx + 1, sy, 1, ts, side);
      }
      if (isOpen(map.get(tx + 1, ty))) {
        r.fillRect(sx + ts - 1, sy, 1, ts, PALETTE[0]);
        r.fillRect(sx + ts - 2, sy, 1, ts, side);
      }
    }
  }
}
