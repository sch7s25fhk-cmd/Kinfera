// Tile-Karte: Raster aus Tile-IDs, Kollision und Rendering der sichtbaren Tiles.

import { getSprite } from './SpriteSheet.js';

/**
 * @typedef {Object} TileDef
 * @property {string[][]} [frames]  Pixel-Arrays; leer/fehlend = nichts zeichnen
 * @property {number} [frameTime]   Sekunden pro Animationsframe
 * @property {string} [under]       Tile-ID, die darunter gezeichnet wird (z. B. Gras unter Baum)
 * @property {boolean} [solid]
 */

export class Tilemap {
  /**
   * @param {{ width: number, height: number, tiles: string[], tileSize: number,
   *           tileset: Record<string, TileDef>, palette: Record<string, string> }} opts
   */
  constructor({ width, height, tiles, tileSize, tileset, palette }) {
    this.width = width;
    this.height = height;
    this.tiles = tiles;
    this.tileSize = tileSize;
    this.tileset = tileset;
    this.palette = palette;
  }

  get pixelWidth() {
    return this.width * this.tileSize;
  }

  get pixelHeight() {
    return this.height * this.tileSize;
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  get(tx, ty) {
    return this.inBounds(tx, ty) ? this.tiles[ty * this.width + tx] : null;
  }

  /** Außerhalb der Karte gilt alles als blockiert */
  isSolid(tx, ty) {
    const id = this.get(tx, ty);
    if (id === null) return true;
    return !!this.tileset[id]?.solid;
  }

  /**
   * @param {import('./Renderer.js').Renderer} r
   * @param {import('./Camera.js').Camera} cam
   * @param {number} time Sekunden seit Spielstart (für Animationen)
   */
  render(r, cam, time) {
    const ts = this.tileSize;
    const x0 = Math.max(0, Math.floor(cam.x / ts));
    const y0 = Math.max(0, Math.floor(cam.y / ts));
    const x1 = Math.min(this.width - 1, Math.floor((cam.x + cam.viewWidth) / ts));
    const y1 = Math.min(this.height - 1, Math.floor((cam.y + cam.viewHeight) / ts));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const sx = tx * ts - cam.x;
        const sy = ty * ts - cam.y;
        this.drawTile(r, this.get(tx, ty), sx, sy, time);
      }
    }
  }

  drawTile(r, id, sx, sy, time) {
    const def = this.tileset[id];
    if (!def) return;
    if (def.under) this.drawTile(r, def.under, sx, sy, time);
    if (!def.frames || !def.frames.length) return;
    const idx = def.frameTime ? Math.floor(time / def.frameTime) % def.frames.length : 0;
    r.drawImage(getSprite(def.frames[idx], this.palette), sx, sy);
  }
}
