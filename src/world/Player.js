// Spielfigur: tile-basiertes Laufen mit flüssiger Interpolation.
// Gesteuert entweder durch eine Richtung (Finger halten / Tastatur) oder einen Pfad (Tippen).

import { getSprite } from '../engine/SpriteSheet.js';
import { PLAYER_FRAMES } from '../data/sprites/player.js';
import { PALETTE } from '../data/palette.js';

const WALK_SPEED = 4.5; // Tiles pro Sekunde
const TURN_DELAY = 0.08; // kurzes Antippen einer Richtung dreht nur

export const DELTA = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function dirBetween(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

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
    /** @type {{x: number, y: number}[]} */
    this.path = [];
    /** @type {(() => void) | null} */
    this.onPathDone = null;
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

  facingTile() {
    const [dx, dy] = DELTA[this.dir];
    return { x: this.tx + dx, y: this.ty + dy };
  }

  setPath(path, onDone = null) {
    this.path = path;
    this.onPathDone = onDone;
    if (!path.length && onDone) {
      this.onPathDone = null;
      onDone();
    }
  }

  clearPath() {
    this.path = [];
    this.onPathDone = null;
  }

  /** Zielfeld des aktuellen Pfads (für die Markierung) */
  pathTarget() {
    return this.path.length ? this.path[this.path.length - 1] : null;
  }

  /**
   * @param {number} dt
   * @param {string | null} manualDir Richtung vom gehaltenen Finger oder der Tastatur
   * @param {import('../engine/Tilemap.js').Tilemap} map
   */
  update(dt, manualDir, map) {
    if (manualDir) this.clearPath();

    if (this.moving) {
      this.progress += dt * WALK_SPEED;
      if (this.progress < 1) return;
      // Angekommen – überschüssige Zeit in den nächsten Schritt mitnehmen
      const leftover = this.progress - 1;
      this.moving = false;
      this.progress = 0;
      const next = manualDir ?? this.nextPathDir();
      if (next && this.tryStep(next, map)) {
        this.progress = leftover;
      } else {
        this.finishPath();
      }
      return;
    }

    if (!manualDir) {
      this.turnTimer = 0;
      const next = this.nextPathDir();
      if (next && !this.tryStep(next, map)) this.clearPath();
      return;
    }

    if (manualDir !== this.dir) {
      this.dir = manualDir;
      this.turnTimer = TURN_DELAY;
      return;
    }
    if (this.turnTimer > 0) {
      this.turnTimer -= dt;
      return;
    }
    this.tryStep(manualDir, map);
  }

  nextPathDir() {
    if (!this.path.length) return null;
    return dirBetween({ x: this.tx, y: this.ty }, this.path[0]);
  }

  finishPath() {
    if (this.path.length) return;
    const done = this.onPathDone;
    this.onPathDone = null;
    done?.();
  }

  tryStep(dir, map) {
    this.dir = dir;
    const [dx, dy] = DELTA[dir];
    const nx = this.tx + dx;
    const ny = this.ty + dy;
    if (map.isSolid(nx, ny)) return false;
    if (this.path.length && this.path[0].x === nx && this.path[0].y === ny) this.path.shift();
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
    // Erste Schritthälfte: Schrittpose (abwechselnd), zweite: Standpose
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
    const sx = this.x - cam.x;
    const sy = this.y - cam.y;
    // Leichtes Wippen beim Laufen
    const bob = this.moving && this.progress < 0.5 ? -1 : 0;
    r.withAlpha(0.35, () => r.fillRect(sx + 4, sy + 14, 8, 2, PALETTE[0]));
    r.drawImage(img, sx, sy + bob);
  }
}
