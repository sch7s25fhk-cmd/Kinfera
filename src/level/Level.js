// Laufzeit-Zustand eines Levels: Tiles, Objekte, Partikel, Kollisionen und Spielregeln.

import { Tilemap } from '../engine/Tilemap.js';
import { Particles } from '../engine/Particles.js';
import { createRng } from '../engine/rng.js';
import { TILESET, TILE_SIZE } from '../data/tiles.js';
import { PALETTE } from '../data/palette.js';
import { LANTERN, PHYSICS } from '../data/balance.js';
import { parseLevel } from './levelLoader.js';
import { overlaps } from './physics.js';
import { Hero } from '../entities/Hero.js';
import { Enemy } from '../entities/Enemy.js';
import { SparkPickup, Shot, Checkpoint, LostLight } from '../entities/items.js';

export class Level {
  /** @param {{ rows: string[], name: string, id: string }} def */
  constructor(def) {
    this.def = def;
    const parsed = parseLevel(def);
    this.map = new Tilemap({ ...parsed, tileSize: TILE_SIZE, tileset: TILESET, palette: PALETTE });
    this.tileSize = TILE_SIZE;
    this.rng = createRng(1234);
    this.particles = new Particles();
    this.enemies = [];
    this.sparks = [];
    this.shots = [];
    this.checkpoints = [];
    this.light = null;
    this.events = []; // für Szene (Kamera-Wackeln, Töne …)

    for (const o of parsed.objects) {
      const px = o.tx * TILE_SIZE;
      const py = o.ty * TILE_SIZE;
      if (o.type === 'player') this.spawn = { x: px, y: py };
      else if (o.type === 'spark') this.sparks.push(new SparkPickup(o.tx, o.ty));
      else if (o.type === 'checkpoint') this.checkpoints.push(new Checkpoint(o.tx, o.ty));
      else if (o.type === 'light') this.light = new LostLight(o.tx, o.ty);
      else this.enemies.push(new Enemy(o.type, px, py));
    }
    this.totalSparks = this.sparks.length;
    this.collected = 0;
    this.respawnPoint = { ...this.spawn };
    this.hero = new Hero(this.spawn.x, this.spawn.y);
    this.time = 0;
    this.complete = false;
    this.deaths = 0;
  }

  get pixelWidth() {
    return this.map.pixelWidth;
  }

  get pixelHeight() {
    return this.map.pixelHeight;
  }

  // ---- Kollisionswelt (für physics.moveBody) ----
  isSolid(tx, ty) {
    if (tx < 0 || tx >= this.map.width) return true; // seitliche Levelgrenzen
    if (ty < 0 || ty >= this.map.height) return false; // oben/unten offen (Fallen = Absturz)
    return !!TILESET[this.map.get(tx, ty)]?.solid;
  }

  isOneWay(tx, ty) {
    return !!TILESET[this.map.get(tx, ty)]?.oneWay;
  }

  isWindAt(x, y) {
    return this.map.get(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)) === 'wind';
  }

  isHazardAt(x, y) {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    // Nur die untere Hälfte der Dornen-Kachel ist gefährlich
    return TILESET[this.map.get(tx, ty)]?.hazard && y - ty * TILE_SIZE > 7;
  }

  /**
   * @param {number} dt
   * @param {import('../engine/Input.js').Input} input
   */
  update(dt, input) {
    this.time += dt;
    const hero = this.hero;

    if (!this.complete) hero.update(dt, input, this);
    for (const e of this.enemies) e.update(dt, this);
    for (const s of this.shots) s.update(dt, this);
    this.particles.update(dt);

    this.handleShots();
    if (!this.complete) {
      this.handleHeroContacts();
      this.handlePickups();
    }
    this.ambientParticles(dt);

    // Absturz ins Wolkenmeer oder Laterne erloschen
    if (!this.complete && (hero.y > this.pixelHeight + 32 || hero.dead)) this.respawn();

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.shots = this.shots.filter((s) => !s.dead);
  }

  handleShots() {
    for (const shot of this.shots) {
      for (const e of this.enemies) {
        if (shot.dead || e.dead || !overlaps(shot, e)) continue;
        shot.dead = true;
        if (e.damage()) this.defeat(e);
        else this.burst(shot.x + 3, shot.y + 3, 4, [PALETTE[4]]);
      }
    }
  }

  handleHeroContacts() {
    const hero = this.hero;
    for (const e of this.enemies) {
      if (e.dead || !overlaps(hero, e)) continue;
      // Von oben drauf? (fallend und Füße im oberen Teil des Gegners)
      const stomp = hero.vy > 0 && hero.y + hero.h - e.y < 7;
      if (stomp && e.stompable) {
        e.damage(99);
        this.defeat(e);
        hero.vy = -PHYSICS.stompBounce;
        this.events.push({ type: 'stomp' });
      } else {
        hero.hurt(e.x + e.w / 2, this);
      }
    }
    // Dornen: Füße prüfen
    if (this.isHazardAt(hero.x + 2, hero.y + hero.h - 1) || this.isHazardAt(hero.x + hero.w - 2, hero.y + hero.h - 1)) {
      hero.hurt(hero.centerX - hero.facing, this);
    }
  }

  handlePickups() {
    const hero = this.hero;
    for (const s of this.sparks) {
      if (s.taken || !overlaps(hero, s)) continue;
      s.taken = true;
      this.collected++;
      hero.lantern = Math.min(LANTERN.max, hero.lantern + LANTERN.sparkGain);
      this.burst(s.x + 4, s.y + 4, 6, [PALETTE[8], PALETTE[4]]);
      this.events.push({ type: 'spark' });
    }
    this.sparks = this.sparks.filter((s) => !s.taken);

    for (const cp of this.checkpoints) {
      if (cp.lit || !overlaps(hero, cp)) continue;
      cp.lit = true;
      this.respawnPoint = { x: cp.x, y: cp.y + 16 };
      this.burst(cp.x + 8, cp.y + 7, 14, [PALETTE[8], PALETTE[4], PALETTE.f]);
      this.events.push({ type: 'checkpoint' });
    }

    if (this.light && !this.light.freed && overlaps(hero, this.light)) {
      this.light.freed = true;
      this.complete = true;
      hero.vx = 0;
      this.burst(this.light.x + 6, this.light.y + 6, 40, [PALETTE[8], PALETTE[4], PALETTE.e]);
      this.events.push({ type: 'complete' });
    }
  }

  defeat(e) {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const colors = e.kind === 'jelly' ? [PALETTE[3], PALETTE[4]] : [PALETTE.a, PALETTE[9], PALETTE[2]];
    this.burst(cx, cy, 14, colors, 70);
    // Besiegte Gegner hinterlassen einen Funken
    this.particles.emit({ x: cx, y: cy, vy: -30, life: 0.5, color: PALETTE[8], size: 2 });
    this.events.push({ type: 'defeat' });
  }

  respawn() {
    this.deaths++;
    const hero = new Hero(this.respawnPoint.x, this.respawnPoint.y);
    hero.invuln = 1;
    this.hero = hero;
    this.shots = [];
    this.events.push({ type: 'respawn' });
  }

  // ---- Ereignisse vom Helden ----
  spawnShot(x, y, dir) {
    this.shots.push(new Shot(x, y, dir));
    this.events.push({ type: 'shoot' });
  }

  onHeroJump(hero) {
    this.dust(hero.centerX, hero.y + hero.h, 4);
    this.events.push({ type: 'jump' });
  }

  onHeroLand(hero) {
    this.dust(hero.centerX, hero.y + hero.h, 5);
  }

  onHeroHurt() {
    this.burst(this.hero.centerX, this.hero.centerY, 10, [PALETTE.f, PALETTE[8]]);
    this.events.push({ type: 'hurt' });
  }

  onLanternEmpty(hero) {
    this.particles.emit({ x: hero.centerX - hero.facing * 5, y: hero.y + 5, vy: -10, life: 0.4, color: PALETTE[2], size: 2 });
  }

  // ---- Partikel ----
  burst(x, y, n, colors, speed = 50) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(speed * 0.3, speed);
      this.particles.emit({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, gravity: 120,
        life: this.rng.range(0.25, 0.6), color: this.rng.pick(colors), size: this.rng.chance(0.3) ? 2 : 1,
      });
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.emit({
        x: x + this.rng.range(-4, 4), y: y - 1, vx: this.rng.range(-25, 25), vy: this.rng.range(-18, -4),
        life: this.rng.range(0.2, 0.4), color: PALETTE[3], size: this.rng.chance(0.5) ? 2 : 1,
      });
    }
  }

  ambientParticles(dt) {
    // Aufwind sichtbar machen: aufsteigende Luftstreifen
    if (this.rng.chance(dt * 30)) {
      const winds = this.windCells ??= this.map.tiles
        .map((id, i) => (id === 'wind' ? i : -1)).filter((i) => i >= 0);
      if (winds.length) {
        const i = this.rng.pick(winds);
        const x = (i % this.map.width) * TILE_SIZE + this.rng.range(0, TILE_SIZE);
        const y = Math.floor(i / this.map.width) * TILE_SIZE + TILE_SIZE;
        this.particles.emit({ x, y, vy: -this.rng.range(60, 110), life: 0.5, color: PALETTE[4], size: 1 });
      }
    }
  }

  takeEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
