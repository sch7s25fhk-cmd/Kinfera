// Übergänge zwischen Tiles: Gras franst in Wege, Ufer am Wasser, Konturen an Inselrändern.
// Wird nach der Bodenebene und vor den Figuren gezeichnet.

import { getSprite } from '../engine/SpriteSheet.js';
import { PALETTE } from '../data/palette.js';
import {
  GROUND_TILES, GREEN_TILES, PATH_FRINGE_TOP, SHORE_TOP, SHORE_BOTTOM, edgeVariants,
} from '../data/tiles.js';

const FRINGE = edgeVariants(PATH_FRINGE_TOP);
const SHORE = edgeVariants(SHORE_TOP);
const FOAM_BOTTOM = SHORE_BOTTOM;

const SIDES = [
  ['top', 0, -1],
  ['bottom', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0],
];

const isOpen = (id) => id === null || id === 'void' || id === 'cliffBottom';

/**
 * @param {import('../engine/Renderer.js').Renderer} r
 * @param {import('../engine/Tilemap.js').Tilemap} map
 * @param {import('../engine/Camera.js').Camera} cam
 */
export function renderTileDecor(r, map, cam) {
  const ts = map.tileSize;
  const { x0, y0, x1, y1 } = map.visibleRange(cam);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const id = map.get(tx, ty);
      const sx = tx * ts - cam.x;
      const sy = ty * ts - cam.y;

      if (id === 'path') drawEdges(r, map, tx, ty, sx, sy, FRINGE, (n) => GREEN_TILES.has(n));
      if (id === 'water') {
        drawEdges(r, map, tx, ty, sx, sy, SHORE, (n) => n !== 'water' && n !== null, ['top', 'left', 'right']);
        if (map.get(tx, ty + 1) !== 'water') {
          r.drawImage(getSprite(FOAM_BOTTOM, PALETTE), sx, sy + ts - FOAM_BOTTOM.length);
        }
      }
      if (GROUND_TILES.has(id) || id === 'cliff') drawIslandOutline(r, map, id, tx, ty, sx, sy, ts);
    }
  }
}

function drawEdges(r, map, tx, ty, sx, sy, set, matches, only = null) {
  const ts = map.tileSize;
  for (const [side, dx, dy] of SIDES) {
    if (only && !only.includes(side)) continue;
    if (!matches(map.get(tx + dx, ty + dy))) continue;
    const rows = set[side];
    const img = getSprite(rows, PALETTE);
    const ox = side === 'right' ? ts - rows[0].length : 0;
    const oy = side === 'bottom' ? ts - rows.length : 0;
    r.drawImage(img, sx + ox, sy + oy);
  }
}

/** Dunkle Kontur + Lichtkante, wo die Insel ans Wolkenmeer grenzt */
function drawIslandOutline(r, map, id, tx, ty, sx, sy, ts) {
  const ground = id !== 'cliff';
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
