// Lio: Laufen, Springen (Coyote-Time, Sprungpuffer, variable Höhe), Funken werfen.
// Die Laterne ist zugleich Lebensanzeige und Munition.

import { getSprite } from '../engine/SpriteSheet.js';
import { HERO } from '../data/sprites/hero.js';
import { PALETTE } from '../data/palette.js';
import { PHYSICS, LANTERN } from '../data/balance.js';
import { moveBody } from '../level/physics.js';

// Hitbox innerhalb des 16×16-Sprites
const BOX = { ox: 4, oy: 3, w: 9, h: 13 };

export class Hero {
  constructor(x, y) {
    this.x = x + BOX.ox;
    this.y = y + BOX.oy;
    this.w = BOX.w;
    this.h = BOX.h;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = 1;
    this.lantern = LANTERN.max;
    this.invuln = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.shootCooldown = 0;
    this.shootPose = 0;
    this.animTime = 0;
    this.dead = false;
    this.inWind = false;
    this.wasOnGround = false;
  }

  get centerX() {
    return this.x + this.w / 2;
  }

  get centerY() {
    return this.y + this.h / 2;
  }

  /**
   * @param {number} dt
   * @param {import('../engine/Input.js').Input} input
   * @param {import('../level/Level.js').Level} level
   */
  update(dt, input, level) {
    const P = PHYSICS;
    const dir = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);

    // Horizontal: beschleunigen / abbremsen
    const accel = this.onGround ? P.runAccel : P.airAccel;
    if (dir !== 0) {
      this.vx += dir * accel * dt;
      this.facing = dir;
    } else if (this.onGround) {
      const f = P.runFriction * dt;
      this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
    }
    this.vx = Math.max(-P.maxRun, Math.min(P.maxRun, this.vx));

    // Sprung mit Coyote-Time und Puffer
    this.coyote = this.onGround ? P.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.wasPressed('jump') ? P.jumpBuffer : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -P.jumpSpeed;
      this.coyote = 0;
      this.jumpBuffer = 0;
      level.onHeroJump(this);
    }
    if (!input.isDown('jump') && this.vy < 0 && !this.inWind) this.vy *= P.jumpCut ** (dt * 60);

    // Schwerkraft und Aufwind
    this.vy = Math.min(P.maxFall, this.vy + P.gravity * dt);
    this.inWind = level.isWindAt(this.centerX, this.centerY);
    if (this.inWind) this.vy = Math.max(-P.windMaxRise, this.vy - P.windLift * dt);

    // Funke werfen
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.shootPose = Math.max(0, this.shootPose - dt);
    if (input.isDown('shoot') && this.shootCooldown === 0) {
      if (this.lantern >= LANTERN.minToShoot) {
        this.lantern -= LANTERN.shotCost;
        this.shootCooldown = LANTERN.shotCooldown;
        this.shootPose = 0.18;
        level.spawnShot(this.centerX + this.facing * 7, this.y + 7, this.facing);
      } else if (input.wasPressed('shoot')) {
        level.onLanternEmpty(this);
      }
    }

    this.wasOnGround = this.onGround;
    moveBody(this, dt, level);
    if (this.onGround && !this.wasOnGround) level.onHeroLand(this);

    this.invuln = Math.max(0, this.invuln - dt);
    this.animTime += dt;
  }

  /** Treffer: Laterne verliert Licht, Rückstoß weg von der Quelle */
  hurt(fromX, level) {
    if (this.invuln > 0 || this.dead) return;
    this.lantern = Math.max(0, this.lantern - LANTERN.hitDamage);
    this.invuln = LANTERN.invulnTime;
    const away = Math.sign(this.centerX - fromX) || -this.facing;
    this.vx = away * LANTERN.knockbackX;
    this.vy = -LANTERN.knockbackY;
    level.onHeroHurt(this);
    if (this.lantern <= 0) this.dead = true;
  }

  frame() {
    if (!this.onGround) {
      if (this.shootPose > 0) return HERO.shootAir;
      return this.vy < 0 ? HERO.jump : HERO.fall;
    }
    if (this.shootPose > 0) return HERO.shoot;
    if (Math.abs(this.vx) > 8) return HERO.run[Math.floor(this.animTime * 12) % HERO.run.length];
    return HERO.idle;
  }

  render(r, cam) {
    // Blinken während Unverwundbarkeit
    if (this.invuln > 0 && Math.floor(this.invuln * 15) % 2 === 0) return;
    const sx = Math.round(this.x - BOX.ox - cam.x);
    let sy = Math.round(this.y - BOX.oy - cam.y);
    // Atmen im Stand
    if (this.onGround && Math.abs(this.vx) <= 8 && this.shootPose === 0 && Math.floor(this.animTime * 2) % 2) sy += 1;
    r.drawImage(getSprite(this.frame(), PALETTE, this.facing < 0), sx, sy);
  }

  /** Lichtschein der Laterne (vor der Figur gezeichnet, additiv wirkend) */
  renderGlow(r, cam, time) {
    const strength = this.lantern / LANTERN.max;
    const flicker = 1 + Math.sin(time * 9) * 0.06 + Math.sin(time * 23) * 0.03;
    const lx = this.centerX - this.facing * 5 - cam.x;
    const ly = this.y + 6 - cam.y;
    r.withAlpha(0.07 * strength, () => r.fillCircle(lx, ly, Math.round(30 * flicker), PALETTE[8]));
    r.withAlpha(0.09 * strength, () => r.fillCircle(lx, ly, Math.round(17 * flicker), PALETTE[8]));
  }
}
