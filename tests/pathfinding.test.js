import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath } from '../src/world/pathfinding.js';

// '#' blockiert, '.' frei
function grid(rows) {
  return (x, y) => y < 0 || y >= rows.length || x < 0 || x >= rows[0].length || rows[y][x] === '#';
}

test('kürzester Weg um ein Hindernis', () => {
  const blocked = grid([
    '.....',
    '.###.',
    '.....',
  ]);
  const path = findPath(blocked, { x: 0, y: 1 }, (x, y) => x === 4 && y === 1);
  assert.equal(path.length, 6);
  assert.deepEqual(path[path.length - 1], { x: 4, y: 1 });
  // Jeder Schritt ist genau ein Feld weit
  let prev = { x: 0, y: 1 };
  for (const step of path) {
    assert.equal(Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y), 1);
    prev = step;
  }
});

test('unerreichbares Ziel ergibt null, Start = Ziel ergibt []', () => {
  const blocked = grid(['..#..']);
  assert.equal(findPath(blocked, { x: 0, y: 0 }, (x) => x === 4), null);
  assert.deepEqual(findPath(blocked, { x: 0, y: 0 }, (x) => x === 0), []);
});

test('Ziel "neben einem Hindernis" (zum Untersuchen)', () => {
  const blocked = grid([
    '...',
    '.#.',
    '...',
  ]);
  const path = findPath(blocked, { x: 0, y: 0 }, (x, y) => Math.abs(x - 1) + Math.abs(y - 1) === 1);
  assert.equal(path.length, 1);
});
