// Spielfigur: tile-basiertes Laufen mit flüssiger Interpolation zwischen den Tiles.

import { getSprite } from '../engine/SpriteSheet.js';
import { PLAYER_FRAMES } from '../data/sprites/player.js';
import { PALETTE } from '../data/palette.js';

const WALK_SPEED = 4.5; // Tiles pro Sekunde
const TURN_DELAY = 0.08; // kurzes Antippen dreht nur, ohne zu laufen

const DELTA = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export class Player {
  constructor(tx, ty, dir = 'down', tileSize = 16) {
    this.tileSize = tileSize;
    this.tx = tx;
    this.ty = ty;
    this.dir = dir;
    this.moving = false;
    this.progress = 0; // 0..1 innerhalb eines Schritts
    this.fromX = tx;
    this.fromY = ty;
    this.stepCount = 0;
    this.turnTimer = 0;
  }

  /** Pixelposition (links oben) */
  get x() {
    const t = this.moving ? this.progress : 1;
    return (this.fromX + (this.tx - this.fromX) * t) * this.tileSize;
  }

  get y() {
    const t = this.moving ? this.progress : 1;
    return (this.fromY + (this.ty - this.fromY) * t) * this.tileSize;
  }

  /** Tile vor der Figur (für Interaktionen) */
  facingTile() {
    const [dx, dy] = DELTA[this.dir];
    return { x: this.tx + dx, y: this.ty + dy };
  }

  /**
   * @param {number} dt
   * @param {import('../engine/Input.js').Input} input
   * @param {import('../engine/Tilemap.js').Tilemap} map
   */
  update(dt, input, map) {
    if (this.moving) {
      this.progress += dt * WALK_SPEED;
      if (this.progress < 1) return;
      // Angekommen – überschüssige Zeit in den nächsten Schritt mitnehmen
      const leftover = (this.progress - 1) / WALK_SPEED;
      this.moving = false;
      this.progress = 0;
      const dir = input.direction();
      if (dir && this.tryStep(dir, map)) {
        this.progress = leftover * WALK_SPEED;
      }
      return;
    }

    const dir = input.direction();
    if (!dir) {
      this.turnTimer = 0;
      return;
    }

    if (dir !== this.dir) {
      this.dir = dir;
      this.turnTimer = TURN_DELAY;
      return;
    }
    if (this.turnTimer > 0) {
      this.turnTimer -= dt;
      return;
    }
    this.tryStep(dir, map);
  }

  tryStep(dir, map) {
    this.dir = dir;
    const [dx, dy] = DELTA[dir];
    const nx = this.tx + dx;
    const ny = this.ty + dy;
    if (map.isSolid(nx, ny)) return false;
    this.fromX = this.tx;
    this.fromY = this.ty;
    this.tx = nx;
    this.ty = ny;
    this.moving = true;
    this.progress = 0;
    this.stepCount++;
    return true;
  }

  currentFrame() {
    const set = PLAYER_FRAMES[this.dir === 'left' ? 'right' : this.dir];
    // Erste Schritthälfte: Schrittpose (abwechselnd links/rechts), zweite: Standpose
    if (this.moving && this.progress < 0.5) {
      return this.stepCount % 2 ? set.stepA : set.stepB;
    }
    return set.stand;
  }

  /**
   * @param {import('../engine/Renderer.js').Renderer} r
   * @param {import('../engine/Camera.js').Camera} cam
   */
  render(r, cam) {
    const img = getSprite(this.currentFrame(), PALETTE, this.dir === 'left');
    // Kleiner Schatten unter den Füßen
    r.withAlpha(0.35, () => r.fillRect(this.x - cam.x + 4, this.y - cam.y + 14, 8, 2, PALETTE[0]));
    r.drawImage(img, this.x - cam.x, this.y - cam.y);
  }
}
