// Baut aus einer Leveldefinition (Textzeilen) Tile-Raster und Objektliste.
// Reine Logik ohne Canvas (testbar).

/** Zeichen → Tile */
export const TILE_LEGEND = {
  ' ': 'air',
  '#': 'ground', // wird zu groundTop / dirt
  '=': 'cloud', // wird zu cloudL / cloudM / cloudR / cloudS
  '-': 'bridge',
  '^': 'thorns',
  w: 'wind',
  b: 'bush',
  f: 'flowers',
  g: 'glowshroom',
  t: 'tallGrass',
  v: 'vine',
};

/** Zeichen → Objekt (das Feld selbst wird Luft) */
export const OBJECT_LEGEND = {
  P: 'player',
  k: 'beetle',
  s: 'snail',
  q: 'jelly',
  '*': 'spark',
  c: 'checkpoint',
  L: 'light',
};

/**
 * @param {{ rows: string[] }} def
 * @returns {{ width: number, height: number, tiles: string[], objects: {type: string, tx: number, ty: number}[] }}
 */
export function parseLevel(def) {
  const width = Math.max(...def.rows.map((r) => r.length));
  const height = def.rows.length;
  const raw = [];
  const objects = [];

  def.rows.forEach((row, ty) => {
    const padded = row.padEnd(width, ' ');
    for (let tx = 0; tx < width; tx++) {
      const ch = padded[tx];
      if (OBJECT_LEGEND[ch]) {
        objects.push({ type: OBJECT_LEGEND[ch], tx, ty });
        raw.push('air');
      } else if (TILE_LEGEND[ch]) {
        raw.push(TILE_LEGEND[ch]);
      } else {
        throw new Error(`Unbekanntes Levelzeichen '${ch}' in Zeile ${ty}`);
      }
    }
  });

  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 'air' : raw[y * width + x]);
  const tiles = raw.map((id, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    if (id === 'ground') return at(x, y - 1) === 'ground' ? 'dirt' : 'groundTop';
    if (id === 'cloud') {
      const l = at(x - 1, y) === 'cloud';
      const r = at(x + 1, y) === 'cloud';
      if (l && r) return 'cloudM';
      if (l) return 'cloudR';
      if (r) return 'cloudL';
      return 'cloudS';
    }
    // Unterseite unter schwebenden Inseln
    if (id === 'air' && at(x, y - 1) === 'ground') return 'underside';
    return id;
  });

  if (!objects.some((o) => o.type === 'player')) throw new Error('Level ohne Startpunkt (P)');
  return { width, height, tiles, objects };
}

