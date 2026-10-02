import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveBody, hasGroundAt, overlaps } from '../src/level/physics.js';

// '#' fest, '=' Einweg-Plattform
function world(rows) {
  const at = (x, y) => (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length ? ' ' : rows[y][x]);
  return { tileSize: 16, isSolid: (x, y) => at(x, y) === '#', isOneWay: (x, y) => at(x, y) === '=' };
}

const W = world([
  '      ',
  '   =  ',
  '      ',
  '######',
]);

test('Körper landet auf festem Boden', () => {
  const b = { x: 4, y: 20, w: 8, h: 12, vx: 0, vy: 300 };
  for (let i = 0; i < 30; i++) moveBody(b, 1 / 60, W);
  assert.equal(b.y + b.h, 48);
  assert.ok(b.onGround);
  assert.equal(b.vy, 0);
});

test('Einweg-Plattform trägt von oben, lässt von unten durch', () => {
  const fromAbove = { x: 50, y: 0, w: 8, h: 12, vx: 0, vy: 120 };
  for (let i = 0; i < 20; i++) moveBody(fromAbove, 1 / 60, W);
  assert.equal(fromAbove.y + fromAbove.h, 16);

  const fromBelow = { x: 50, y: 34, w: 8, h: 12, vx: 0, vy: -250 };
  for (let i = 0; i < 4; i++) moveBody(fromBelow, 1 / 30, W);
  assert.ok(fromBelow.y < 16, 'sollte durch die Plattform nach oben gehen');
});

test('Wand stoppt seitliche Bewegung', () => {
  const w = world(['   #', '   #']);
  const b = { x: 30, y: 2, w: 8, h: 12, vx: 200, vy: 0 };
  let hit = 0;
  for (let i = 0; i < 10; i++) {
    b.vx = 200; // dauerhaft gegen die Wand drücken
    moveBody(b, 1 / 60, w);
    hit ||= b.hitWall;
  }
  assert.equal(b.x + b.w, 48);
  assert.equal(hit, 1);
});

test('Kantenerkennung und Überlappung', () => {
  assert.ok(hasGroundAt(W, 10, 47));
  assert.ok(!hasGroundAt(W, 10, 20));
  assert.ok(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }));
});
