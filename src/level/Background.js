// Parallax-Hintergrund: Himmelsverlauf (gerastert), Sonne, ferne Inseln,
// Bergsilhouetten, Wolkenbänke und das Wolkenmeer am unteren Rand.

import { createRng } from '../engine/rng.js';
import { PALETTE } from '../data/palette.js';

const WRAP = 960;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x, y, ratio) => ratio * 16 > BAYER[(y % 4) * 4 + (x % 4)] + 0.5;

export class Background {
  constructor(seed = 3) {
    const rng = createRng(seed);
    this.skyCache = null;
    this.ridgeCache = new Map();
    this.farIslands = Array.from({ length: 6 }, (_, i) => ({
      x: i * (WRAP / 6) + rng.int(0, 80), y: rng.int(35, 85), w: rng.int(16, 40),
    }));
    this.cloudLayers = [
      { parallax: 0.2, drift: 3, y: 40, clouds: makeClouds(rng, 7, 5, 9), base: PALETTE[3], top: PALETTE[4] },
      { parallax: 0.45, drift: 8, y: 95, clouds: makeClouds(rng, 6, 8, 14), base: PALETTE[3], top: PALETTE[4] },
    ];
    this.ridgeSeed = rng.int(0, 1000);
  }

  /**
   * @param {import('../engine/Renderer.js').Renderer} r
   * @param {{x: number, y: number}} cam
   * @param {number} time
   */
  render(r, cam, time) {
    r.drawImage(this.sky(r), 0, 0);

    // Sonne mit Schein
    const sunX = Math.round(r.width * 0.78 - cam.x * 0.02);
    const sunY = 34;
    r.withAlpha(0.25, () => r.fillCircle(sunX, sunY, 22, PALETTE[4]));
    r.withAlpha(0.45, () => r.fillCircle(sunX, sunY, 15, PALETTE[4]));
    r.fillCircle(sunX, sunY, 10, PALETTE[4]);

    // Ferne Schwebeinseln
    for (const isl of this.farIslands) {
      for (const x of wrap(isl.x - cam.x * 0.05, isl.w, r.width)) drawFarIsland(r, x, isl.y - cam.y * 0.03, isl.w);
    }

    // Bergkämme (zwei Ebenen)
    this.drawRidge(r, cam, 0.12, r.height - 70, 26, PALETTE[3], 1);
    this.cloudBank(r, cam, time, this.cloudLayers[0]);
    this.drawRidge(r, cam, 0.3, r.height - 48, 22, PALETTE[2], 2);
    this.cloudBank(r, cam, time, this.cloudLayers[1]);

    // Wolkenmeer am unteren Rand
    const seaY = r.height - 22 - Math.round(cam.y * 0.1);
    for (let x = -20; x < r.width + 20; x += 14) {
      const wx = x + ((-(cam.x * 0.6 + time * 10)) % 14);
      const bump = Math.round(Math.sin((x + cam.x * 0.6) * 0.09 + time) * 2);
      r.fillCircle(wx, seaY + bump + 4, 11, PALETTE[3]);
    }
    for (let x = -20; x < r.width + 20; x += 18) {
      const wx = x + ((-(cam.x * 0.7 + time * 12)) % 18);
      r.fillCircle(wx, seaY + 12, 12, PALETTE[4]);
    }
    r.fillRect(0, seaY + 14, r.width, r.height, PALETTE[4]);
  }

  /** Gerasterter Himmelsverlauf, gecacht pro Größe */
  sky(r) {
    if (this.skyCache && this.skyCache.width === r.width && this.skyCache.height === r.height) return this.skyCache;
    const c = document.createElement('canvas');
    c.width = r.width;
    c.height = r.height;
    const ctx = c.getContext('2d');
    const bands = [
      [0, PALETTE.c, PALETTE.d],
      [0.22, PALETTE.d, PALETTE.e],
      [0.55, PALETTE.e, PALETTE[3]],
    ];
    for (let y = 0; y < r.height; y++) {
      const t = y / r.height;
      let band = bands[0];
      for (const b of bands) if (t >= b[0]) band = b;
      const next = bands[bands.indexOf(band) + 1]?.[0] ?? 1;
      const ratio = (t - band[0]) / (next - band[0]);
      for (let x = 0; x < r.width; x++) {
        ctx.fillStyle = dither(x, y, ratio) ? band[2] : band[1];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    this.skyCache = c;
    return c;
  }

  drawRidge(r, cam, parallax, baseY, amp, color, layer) {
    const off = cam.x * parallax;
    const y0 = Math.round(baseY - cam.y * parallax * 0.4);
    for (let x = 0; x < r.width; x++) {
      const wx = x + off + this.ridgeSeed * layer;
      const h = Math.sin(wx * 0.013) * amp * 0.6 + Math.sin(wx * 0.031 + 1.7) * amp * 0.3 + Math.sin(wx * 0.11) * 2;
      const top = Math.round(y0 - Math.abs(h));
      r.fillRect(x, top, 1, r.height - top, color);
    }
  }

  cloudBank(r, cam, time, layer) {
    const lx = -(cam.x * layer.parallax + time * layer.drift);
    const ly = layer.y - cam.y * layer.parallax * 0.4 + (r.height - 180) / 2;
    for (const cl of layer.clouds) {
      for (const x of wrap(cl.x + lx, cl.span, r.width)) {
        for (const p of cl.puffs) r.fillCircle(x + p.dx, ly + cl.y + p.dy + 2, p.r, layer.base);
        for (const p of cl.puffs) r.fillCircle(x + p.dx, ly + cl.y + p.dy, p.r - 1, layer.top);
      }
    }
  }
}

function wrap(x, span, viewWidth) {
  const out = [];
  for (let s = ((x % WRAP) + WRAP) % WRAP - span; s < viewWidth + span; s += WRAP) out.push(s);
  return out;
}

function makeClouds(rng, count, minR, maxR) {
  return Array.from({ length: count }, (_, i) => {
    const puffs = [];
    let px = 0;
    for (let k = 0, n = rng.int(3, 5); k < n; k++) {
      const radius = rng.int(minR, maxR);
      puffs.push({ dx: px, dy: rng.int(-Math.floor(radius / 2), 1), r: radius });
      px += Math.round(radius * rng.range(0.8, 1.2));
    }
    return { x: i * (WRAP / count) + rng.int(0, 60), y: rng.int(-10, 15), puffs, span: px + maxR * 2 };
  });
}

function drawFarIsland(r, x, y, w) {
  x = Math.round(x);
  y = Math.round(y);
  r.fillRect(x, y, w, 2, PALETTE[7]);
  const depth = Math.round(w * 0.7);
  for (let i = 0; i < depth; i++) {
    const inset = Math.round((i / depth) * (w / 2));
    r.fillRect(x + inset, y + 2 + i, w - inset * 2, 1, i % 3 === 0 ? PALETTE[2] : PALETTE[3]);
  }
}
