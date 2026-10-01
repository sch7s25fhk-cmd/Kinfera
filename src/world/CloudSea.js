// Hintergrund: gerasterter Himmel, ferne Schwebeinseln und Wolkenbänke mit Parallaxe.

import { createRng } from '../engine/rng.js';
import { PALETTE } from '../data/palette.js';

const WRAP = 720; // Breite, nach der sich das Muster wiederholt

export class CloudSea {
  constructor(seed = 7) {
    const rng = createRng(seed);
    this.skyCache = null;
    this.farIslands = Array.from({ length: 5 }, (_, i) => ({
      x: i * (WRAP / 5) + rng.int(0, 60),
      y: rng.int(40, 140),
      w: rng.int(14, 34),
    }));
    // Ferne Ebene langsam und kleiner, nahe Ebene schneller und größer
    this.layers = [
      { parallax: 0.12, drift: 2, clouds: makeClouds(rng, 9, 5, 10) },
      { parallax: 0.3, drift: 6, clouds: makeClouds(rng, 8, 8, 15) },
    ];
  }

  /**
   * @param {import('../engine/Renderer.js').Renderer} r
   * @param {import('../engine/Camera.js').Camera} cam
   * @param {number} time
   */
  render(r, cam, time) {
    r.drawImage(this.sky(r), 0, 0);

    // Ferne Inseln als blasse Silhouetten
    const ox = -cam.x * 0.06;
    const oy = -cam.y * 0.04;
    for (const isl of this.farIslands) {
      for (const x of wrapPositions(isl.x + ox, isl.w, r.width)) drawFarIsland(r, x, isl.y + oy, isl.w);
    }

    for (const layer of this.layers) {
      const lx = -(cam.x * layer.parallax + time * layer.drift);
      const ly = -cam.y * layer.parallax * 0.5;
      for (const cloud of layer.clouds) {
        for (const x of wrapPositions(cloud.x + lx, cloud.span, r.width)) drawCloud(r, cloud, x, cloud.y + ly);
      }
    }
  }

  /** Himmel mit Farbverlauf aus Rastermustern (nur Palettenfarben), gecacht pro Größe */
  sky(r) {
    if (this.skyCache && this.skyCache.width === r.width && this.skyCache.height === r.height) return this.skyCache;
    const c = document.createElement('canvas');
    c.width = r.width;
    c.height = r.height;
    const ctx = c.getContext('2d');
    const top = PALETTE.d;
    const mid = PALETTE.e;
    const low = PALETTE[3];
    const h = r.height;
    for (let y = 0; y < h; y++) {
      const t = y / h;
      // Bänder: oben Blau→Himmel, unten Himmel→Dunst, Übergänge als Schachbrett-Raster
      let a = mid;
      let b = mid;
      let ratio = 0;
      if (t < 0.18) { a = top; b = mid; ratio = t / 0.18; }
      else if (t > 0.7) { a = mid; b = low; ratio = (t - 0.7) / 0.3; }
      for (let x = 0; x < r.width; x++) {
        ctx.fillStyle = dither(x, y, ratio) ? b : a;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    this.skyCache = c;
    return c;
  }
}

// 4×4-Bayer-Matrix für gleichmäßige Rasterübergänge
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function dither(x, y, ratio) {
  return ratio * 16 > BAYER[(y % 4) * 4 + (x % 4)] + 0.5;
}

function wrapPositions(x, span, viewWidth) {
  const out = [];
  let start = ((x % WRAP) + WRAP) % WRAP - span;
  for (; start < viewWidth + span; start += WRAP) out.push(start);
  return out;
}

function makeClouds(rng, count, minR, maxR) {
  return Array.from({ length: count }, (_, i) => {
    const puffs = [];
    const n = rng.int(3, 5);
    let px = 0;
    for (let k = 0; k < n; k++) {
      const radius = rng.int(minR, maxR);
      puffs.push({ dx: px, dy: rng.int(-radius / 2, 2), r: radius });
      px += Math.round(radius * rng.range(0.8, 1.3));
    }
    return { x: i * (WRAP / count) + rng.int(0, 40), y: rng.int(20, 260), puffs, span: px + maxR * 2 };
  });
}

/** Wolke: Schatten unten (Dunst), heller Körper, Glanzkante oben */
function drawCloud(r, cloud, x, y) {
  for (const p of cloud.puffs) r.fillCircle(x + p.dx, y + p.dy + 2, p.r, PALETTE[3]);
  for (const p of cloud.puffs) r.fillCircle(x + p.dx, y + p.dy, p.r - 1, PALETTE[4]);
}

/** Kleine ferne Schwebeinsel: flache Oberkante, spitz zulaufende Unterseite */
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
