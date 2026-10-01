// Baut aus einer Kartendefinition (Textzeilen + Legende) ein Tile-Raster.
// Unter jeder Inselkante entstehen automatisch Felswand + ausfransende Unterseite.

import { GROUND_TILES } from '../data/tiles.js';

/**
 * Reine Funktion ohne Canvas-Zugriff (testbar mit node --test).
 * @param {{ rows: string[], legend: Record<string, string> }} def
 * @returns {{ width: number, height: number, tiles: string[] }}
 */
export function parseMap(def) {
  const width = Math.max(...def.rows.map((r) => r.length));
  const height = def.rows.length;
  const tiles = [];

  for (const row of def.rows) {
    const padded = row.padEnd(width, ' ');
    for (const ch of padded) {
      const id = def.legend[ch];
      if (!id) throw new Error(`Unbekanntes Kartenzeichen '${ch}'`);
      tiles.push(id);
    }
  }

  // Felswände: Void direkt unter Boden → cliff, Void unter cliff → cliffBottom
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (tiles[i] !== 'void') continue;
      const above = tiles[i - width];
      if (GROUND_TILES.has(above)) tiles[i] = 'cliff';
      else if (above === 'cliff') tiles[i] = 'cliffBottom';
    }
  }

  return { width, height, tiles };
}
