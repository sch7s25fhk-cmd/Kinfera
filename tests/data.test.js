import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/data/palette.js';
import { TILESET, TILE_SIZE } from '../src/data/tiles.js';
import { HERO } from '../src/data/sprites/hero.js';
import { ENEMY_SPRITES } from '../src/data/sprites/enemies.js';
import { SPARK_PICKUP, SPARK_SHOT, CHECKPOINT } from '../src/data/sprites/items.js';
import { FONT, GLYPH_WIDTH, GLYPH_HEIGHT, GLYPH_MAX_HEIGHT } from '../src/data/font.js';
import { LEVEL_1_1 } from '../src/data/levels/level1_1.js';
import { parseLevel } from '../src/level/levelLoader.js';

function assertSprite(rows, w, h, label) {
  assert.equal(rows.length, h, `${label}: ${rows.length} Zeilen statt ${h}`);
  rows.forEach((row, y) => {
    assert.equal(row.length, w, `${label}, Zeile ${y}: Länge ${row.length}`);
    for (const ch of row) assert.ok(ch === '.' || ch in PALETTE, `${label}, Zeile ${y}: unbekanntes Zeichen '${ch}'`);
  });
}

test('Palette hat höchstens 16 Farben', () => {
  assert.ok(Object.keys(PALETTE).length <= 16);
});

test('alle Tiles sind 16×16', () => {
  for (const [id, def] of Object.entries(TILESET)) {
    (def.frames ?? []).forEach((f, i) => assertSprite(f, TILE_SIZE, TILE_SIZE, `${id}[${i}]`));
  }
});

test('Lio: alle Frames 16×16', () => {
  for (const [name, v] of Object.entries(HERO)) {
    const frames = Array.isArray(v[0]) ? v : [v];
    frames.forEach((f, i) => assertSprite(f, 16, 16, `hero.${name}[${i}]`));
  }
});

test('Gegner, Funken und Kontrollpunkt haben gültige Größen', () => {
  for (const [kind, frames] of Object.entries(ENEMY_SPRITES)) frames.forEach((f, i) => assertSprite(f, 16, 16, `${kind}[${i}]`));
  SPARK_PICKUP.forEach((f, i) => assertSprite(f, 8, 8, `spark[${i}]`));
  SPARK_SHOT.forEach((f, i) => assertSprite(f, 6, 6, `shot[${i}]`));
  for (const [k, f] of Object.entries(CHECKPOINT)) assertSprite(f, 16, 16, `checkpoint.${k}`);
});

test('Schrift-Glyphen haben 3×5 (Umlaute 3×6)', () => {
  for (const [ch, rows] of Object.entries(FONT)) {
    assert.ok(rows.length === GLYPH_HEIGHT || rows.length === GLYPH_MAX_HEIGHT, `Glyph '${ch}'`);
    rows.forEach((r) => assert.equal(r.length, GLYPH_WIDTH, `Glyph '${ch}'`));
  }
});

test('Level 1-1: Start, Ziel, Funken und Gegner vorhanden', () => {
  const lvl = parseLevel(LEVEL_1_1);
  const count = (t) => lvl.objects.filter((o) => o.type === t).length;
  assert.equal(count('player'), 1);
  assert.equal(count('light'), 1);
  assert.ok(count('spark') >= 20);
  assert.ok(count('beetle') + count('snail') + count('jelly') >= 5);
  // Start steht auf festem Boden
  const p = lvl.objects.find((o) => o.type === 'player');
  assert.equal(lvl.tiles[(p.ty + 1) * lvl.width + p.tx], 'groundTop');
});

test('Autotiling: Grasnarbe oben, Erde darunter, Wolkenränder', () => {
  const lvl = parseLevel({ rows: ['P    ', ' === ', '###  ', '###  ', '     '] });
  const at = (x, y) => lvl.tiles[y * lvl.width + x];
  assert.equal(at(0, 2), 'groundTop');
  assert.equal(at(0, 3), 'dirt');
  assert.equal(at(0, 4), 'underside');
  assert.deepEqual([at(1, 1), at(2, 1), at(3, 1)], ['cloudL', 'cloudM', 'cloudR']);
});
