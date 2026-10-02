import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';
import { Camera } from '../src/engine/Camera.js';

test('rng ist reproduzierbar', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
  const r = createRng(1);
  for (let i = 0; i < 100; i++) {
    const v = r.int(3, 5);
    assert.ok(v >= 3 && v <= 5);
  }
});

test('Kamera klemmt am Rand und zentriert kleine Welten', () => {
  const cam = new Camera(320, 180);
  cam.setBounds(800, 400);
  cam.follow(10, 10);
  assert.deepEqual([cam.x, cam.y], [0, 0]);
  cam.follow(790, 390);
  assert.deepEqual([cam.x, cam.y], [480, 220]);
  cam.setBounds(160, 90);
  cam.follow(0, 0);
  assert.deepEqual([cam.x, cam.y], [-80, -45]);
});
