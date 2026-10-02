// Tile-Karte: Raster aus Tile-IDs, Kollision und Rendering der sichtbaren Tiles.

import { getSprite } from './SpriteSheet.js';

/**
 * @typedef {Object} TileDef
 * @property {string[][]} [frames]  Pixel-Arrays; leer/fehlend = nichts zeichnen
 * @property {number} [frameTime]   Sekunden pro Animationsframe
 * @property {boolean} [variants]   frames sind Varianten (pro Position fest gewählt) statt Animation
 * @property {string[]} [top]       Grafik für das Feld darüber, wird ÜBER Figuren gezeichnet (Baumkronen)
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

  /** Sichtbarer Tile-Ausschnitt (mit Rand für überstehende Grafiken) */
  visibleRange(cam, margin = 0) {
    const ts = this.tileSize;
    return {
      x0: Math.max(0, Math.floor(cam.x / ts) - margin),
      y0: Math.max(0, Math.floor(cam.y / ts) - margin),
      x1: Math.min(this.width - 1, Math.floor((cam.x + cam.viewWidth) / ts) + margin),
      y1: Math.min(this.height - 1, Math.floor((cam.y + cam.viewHeight) / ts) + margin),
    };
  }

  /**
   * Bodenebene zeichnen.
   * @param {import('./Renderer.js').Renderer} r
   * @param {import('./Camera.js').Camera} cam
   * @param {number} time Sekunden seit Spielstart (für Animationen)
   */
  render(r, cam, time) {
    const ts = this.tileSize;
    const { x0, y0, x1, y1 } = this.visibleRange(cam);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        this.drawTile(r, this.get(tx, ty), tx, ty, tx * ts - cam.x, ty * ts - cam.y, time);
      }
    }
  }

  /** Überlagernde Ebene (z. B. Baumkronen) – nach den Figuren zeichnen */
  renderOverlay(r, cam) {
    const ts = this.tileSize;
    const { x0, y0, x1, y1 } = this.visibleRange(cam, 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const top = this.tileset[this.get(tx, ty)]?.top;
        if (top) r.drawImage(getSprite(top, this.palette), tx * ts - cam.x, (ty - 1) * ts - cam.y);
      }
    }
  }

  drawTile(r, id, tx, ty, sx, sy, time) {
    const def = this.tileset[id];
    if (!def) return;
    if (def.under) this.drawTile(r, def.under, tx, ty, sx, sy, time);
    if (!def.frames || !def.frames.length) return;
    let idx = 0;
    if (def.variants) idx = tileHash(tx, ty) % def.frames.length;
    else if (def.frameTime) idx = Math.floor(time / def.frameTime) % def.frames.length;
    r.drawImage(getSprite(def.frames[idx], this.palette), sx, sy);
  }
}

/** Stabiler Pseudo-Zufall pro Feld (für Varianten) */
export function tileHash(tx, ty) {
  let h = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
