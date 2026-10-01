import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/data/palette.js';
import { TILESET, TILE_SIZE } from '../src/data/tiles.js';
import { PLAYER_FRAMES } from '../src/data/sprites/player.js';
import { FONT, GLYPH_WIDTH, GLYPH_HEIGHT, GLYPH_MAX_HEIGHT } from '../src/data/font.js';
import { MOOSHAIN } from '../src/data/maps/mooshain.js';
import { parseMap } from '../src/world/mapLoader.js';

function assertSprite(rows, size, label) {
  assert.equal(rows.length, size, `${label}: ${rows.length} Zeilen statt ${size}`);
  rows.forEach((row, y) => {
    assert.equal(row.length, size, `${label}, Zeile ${y}: Länge ${row.length}`);
    for (const ch of row) {
      assert.ok(ch === '.' || ch in PALETTE, `${label}, Zeile ${y}: unbekanntes Zeichen '${ch}'`);
    }
  });
}

test('Palette hat höchstens 16 Farben', () => {
  assert.ok(Object.keys(PALETTE).length <= 16);
});

test('alle Tiles sind 16×16 und nutzen nur Palettenfarben', () => {
  for (const [id, def] of Object.entries(TILESET)) {
    (def.frames ?? []).forEach((f, i) => assertSprite(f, TILE_SIZE, `${id}[${i}]`));
    if (def.under) assert.ok(TILESET[def.under], `${id}.under existiert nicht`);
  }
});

test('Spieler-Frames sind 16×16', () => {
  for (const [dir, set] of Object.entries(PLAYER_FRAMES)) {
    for (const [name, rows] of Object.entries(set)) assertSprite(rows, 16, `player.${dir}.${name}`);
  }
});

test('Schrift-Glyphen haben 3×5 (Umlaute 3×6)', () => {
  for (const [ch, rows] of Object.entries(FONT)) {
    assert.ok(rows.length === GLYPH_HEIGHT || rows.length === GLYPH_MAX_HEIGHT, `Glyph '${ch}'`);
    rows.forEach((r) => assert.equal(r.length, GLYPH_WIDTH, `Glyph '${ch}'`));
  }
});

test('Mooshain: Startpunkt begehbar, beide Inseln erreichbar', () => {
  const map = parseMap(MOOSHAIN);
  const solid = (x, y) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
    return !!TILESET[map.tiles[y * map.width + x]].solid;
  };
  const { x, y } = MOOSHAIN.spawn;
  assert.ok(!solid(x, y), 'Startpunkt ist blockiert');

  // Flood-Fill vom Startpunkt
  const seen = new Set([`${x},${y}`]);
  const queue = [[x, y]];
  while (queue.length) {
    const [cx, cy] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (!seen.has(key) && !solid(nx, ny)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  const walkable = map.tiles.filter((id) => !TILESET[id].solid).length;
  assert.equal(seen.size, walkable, 'Es gibt unerreichbare begehbare Tiles');
});

test('Felswände werden unter Inselkanten erzeugt', () => {
  const map = parseMap({ rows: ['..', '  ', '  '], legend: { '.': 'grass', ' ': 'void' } });
  assert.deepEqual(map.tiles, ['grass', 'grass', 'cliff', 'cliff', 'cliffBottom', 'cliffBottom']);
});
