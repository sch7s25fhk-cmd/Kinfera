// Funken (einsammeln/werfen), Kontrollpunkte und das verlorene Licht.

import { getSprite } from '../engine/SpriteSheet.js';
import { SPARK_PICKUP, SPARK_SHOT, CHECKPOINT } from '../data/sprites/items.js';
import { PALETTE } from '../data/palette.js';
import { LANTERN } from '../data/balance.js';

export class SparkPickup {
  constructor(tx, ty) {
    this.x = tx * 16 + 4;
    this.y = ty * 16 + 4;
    this.w = 8;
    this.h = 8;
    this.taken = false;
    this.phase = (tx * 0.7 + ty * 1.3) % 6.28;
  }

  render(r, cam, time) {
    const bob = Math.round(Math.sin(time * 3 + this.phase) * 1.5);
    const frame = SPARK_PICKUP[Math.floor(time * 6 + this.phase) % SPARK_PICKUP.length];
    r.withAlpha(0.15, () => r.fillCircle(this.x + 4 - cam.x, this.y + 3 + bob - cam.y, 5, PALETTE[8]));
    r.drawImage(getSprite(frame, PALETTE), this.x - cam.x, this.y + bob - cam.y);
  }
}

export class Shot {
  constructor(x, y, dir) {
    this.x = x - 3;
    this.y = y - 3;
    this.w = 6;
    this.h = 6;
    this.vx = dir * LANTERN.shotSpeed;
    this.life = LANTERN.shotLife;
    this.dead = false;
    this.time = 0;
  }

  update(dt, level) {
    this.time += dt;
    this.life -= dt;
    this.x += this.vx * dt;
    const ts = level.tileSize;
    if (this.life <= 0 || level.isSolid(Math.floor((this.x + 3) / ts), Math.floor((this.y + 3) / ts))) {
      this.dead = true;
      level.burst(this.x + 3, this.y + 3, 5, [PALETTE[8], PALETTE[4]]);
    }
  }

  render(r, cam) {
    const frame = SPARK_SHOT[Math.floor(this.time * 20) % SPARK_SHOT.length];
    r.drawImage(getSprite(frame, PALETTE), this.x - cam.x, this.y - cam.y);
  }
}

export class Checkpoint {
  constructor(tx, ty) {
    this.tx = tx;
    this.ty = ty;
    // Pfahl steht auf dem Boden, zwei Felder hoch
    this.x = tx * 16;
    this.y = (ty - 1) * 16;
    this.w = 16;
    this.h = 32;
    this.lit = false;
  }

  render(r, cam, time) {
    const sx = this.x - cam.x;
    const sy = this.y - cam.y;
    if (this.lit) {
      const f = 1 + Math.sin(time * 7) * 0.08;
      r.withAlpha(0.12, () => r.fillCircle(sx + 7, sy + 7, Math.round(16 * f), PALETTE[8]));
    }
    r.drawImage(getSprite(this.lit ? CHECKPOINT.on : CHECKPOINT.off, PALETTE), sx, sy);
    r.drawImage(getSprite(CHECKPOINT.bottom, PALETTE), sx, sy + 16);
  }
}

/** Das verlorene Licht am Levelende: pulsierende Lichtkugel mit Strahlen */
export class LostLight {
  constructor(tx, ty) {
    this.x = tx * 16 + 2;
    this.y = ty * 16 + 2;
    this.w = 12;
    this.h = 12;
    this.freed = false;
  }

  render(r, cam, time) {
    const cx = this.x + 6 - cam.x;
    const cy = this.y + 6 + Math.sin(time * 2) * 2 - cam.y;
    const pulse = Math.sin(time * 4);
    // Strahlen
    for (let i = 0; i < 8; i++) {
      const a = time * 0.8 + (i * Math.PI) / 4;
      const len = 14 + pulse * 3 + (i % 2) * 4;
      for (let d = 9; d < len; d += 2) {
        r.withAlpha(0.5 * (1 - d / len), () => r.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1, PALETTE[8]));
      }
    }
    r.withAlpha(0.15, () => r.fillCircle(cx, cy, 12 + Math.round(pulse * 2), PALETTE[8]));
    r.withAlpha(0.3, () => r.fillCircle(cx, cy, 8, PALETTE[8]));
    r.fillCircle(cx, cy, 5, PALETTE[8]);
    r.fillCircle(cx - 1, cy - 1, 3, PALETTE[4]);
  }
}
