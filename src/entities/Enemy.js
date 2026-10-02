// Gegner: Rostkäfer (läuft, dreht an Kanten), Dornschnecke (langsam, stachelig),
// Nebelqualle (schwebt auf und ab).

import { getSprite } from '../engine/SpriteSheet.js';
import { ENEMY_SPRITES } from '../data/sprites/enemies.js';
import { PALETTE } from '../data/palette.js';
import { ENEMIES, PHYSICS } from '../data/balance.js';
import { moveBody, hasGroundAt } from '../level/physics.js';

export class Enemy {
  /**
   * @param {'beetle'|'snail'|'jelly'} kind
   * @param {number} x Pixel (Tile links oben)
   * @param {number} y
   */
  constructor(kind, x, y) {
    const cfg = ENEMIES[kind];
    this.kind = kind;
    this.cfg = cfg;
    this.w = cfg.w;
    this.h = cfg.h;
    // Hitbox unten mittig im 16×16-Feld
    this.x = x + (16 - cfg.w) / 2;
    this.y = kind === 'jelly' ? y + 2 : y + 16 - cfg.h;
    this.baseY = this.y;
    this.vx = -cfg.speed;
    this.vy = 0;
    this.hp = cfg.hp;
    this.dead = false;
    this.flash = 0;
    this.time = ((x * 7 + y * 3) % 30) / 10; // versetzte Animation ohne Zufall
  }

  get stompable() {
    return this.cfg.stompable;
  }

  update(dt, level) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt);

    if (this.kind === 'jelly') {
      const { floatRange, floatPeriod } = this.cfg;
      this.y = this.baseY + Math.sin((this.time / floatPeriod) * Math.PI * 2) * floatRange;
      return;
    }

    this.vy = Math.min(PHYSICS.maxFall, this.vy + PHYSICS.gravity * dt);
    moveBody(this, dt, level);
    if (this.hitWall) this.vx = -this.hitWall * this.cfg.speed;
    // An Kanten umdrehen
    if (this.onGround) {
      const aheadX = this.vx < 0 ? this.x - 1 : this.x + this.w + 1;
      if (!hasGroundAt(level, aheadX, this.y + this.h)) this.vx = -this.vx;
    }
  }

  /** @returns {boolean} besiegt */
  damage(amount = 1) {
    this.hp -= amount;
    this.flash = 0.12;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  render(r, cam) {
    const frames = ENEMY_SPRITES[this.kind];
    const speed = this.kind === 'snail' ? 3 : 6;
    const img = getSprite(frames[Math.floor(this.time * speed) % frames.length], PALETTE, this.vx > 0);
    const sx = Math.round(this.x - (16 - this.w) / 2 - cam.x);
    const sy = Math.round(this.kind === 'jelly' ? this.y - 2 - cam.y : this.y + this.h - 16 - cam.y);
    if (this.flash > 0) {
      // Treffer-Aufblitzen: weiße Silhouette
      r.withAlpha(0.9, () => r.drawImage(getSprite(frames[0], WHITE_PALETTE, this.vx > 0), sx, sy));
      return;
    }
    r.drawImage(img, sx, sy);
  }
}

const WHITE_PALETTE = Object.fromEntries(Object.keys(PALETTE).map((k) => [k, PALETTE[4]]));
