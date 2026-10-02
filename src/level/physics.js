// Kollision von Rechtecken mit dem Tile-Raster. Reine Logik ohne Canvas (testbar).

/**
 * @typedef {Object} Body
 * @property {number} x links (Pixel)
 * @property {number} y oben
 * @property {number} w
 * @property {number} h
 * @property {number} vx
 * @property {number} vy
 * @property {boolean} [onGround]
 * @property {number} [hitWall] -1 links, 1 rechts, 0 keine
 * @property {boolean} [hitCeiling]
 */

/**
 * @typedef {Object} CollisionWorld
 * @property {number} tileSize
 * @property {(tx: number, ty: number) => boolean} isSolid
 * @property {(tx: number, ty: number) => boolean} isOneWay
 */

const EPS = 0.001;

/**
 * Bewegt einen Körper um vx/vy*dt und löst Kollisionen auf (erst X, dann Y).
 * Einweg-Plattformen tragen nur, wenn der Körper von oben kommt.
 * @param {Body} body
 * @param {number} dt
 * @param {CollisionWorld} world
 * @param {{ dropThrough?: boolean }} [opts]
 */
export function moveBody(body, dt, world, opts = {}) {
  const ts = world.tileSize;
  body.hitWall = 0;
  body.hitCeiling = false;

  // --- X ---
  body.x += body.vx * dt;
  const top = Math.floor(body.y / ts);
  const bottom = Math.floor((body.y + body.h - EPS) / ts);
  if (body.vx > 0) {
    const tx = Math.floor((body.x + body.w - EPS) / ts);
    for (let ty = top; ty <= bottom; ty++) {
      if (world.isSolid(tx, ty)) {
        body.x = tx * ts - body.w;
        body.vx = 0;
        body.hitWall = 1;
        break;
      }
    }
  } else if (body.vx < 0) {
    const tx = Math.floor(body.x / ts);
    for (let ty = top; ty <= bottom; ty++) {
      if (world.isSolid(tx, ty)) {
        body.x = (tx + 1) * ts;
        body.vx = 0;
        body.hitWall = -1;
        break;
      }
    }
  }

  // --- Y ---
  const prevBottom = body.y + body.h;
  body.y += body.vy * dt;
  body.onGround = false;
  const left = Math.floor(body.x / ts);
  const right = Math.floor((body.x + body.w - EPS) / ts);
  if (body.vy >= 0) {
    // Ohne -EPS: wer genau auf einer Kante steht, berührt das Tile darunter (onGround bleibt true)
    const ty = Math.floor((body.y + body.h) / ts);
    for (let tx = left; tx <= right; tx++) {
      const oneWayHit = !opts.dropThrough && world.isOneWay(tx, ty) && prevBottom <= ty * ts + EPS;
      if (world.isSolid(tx, ty) || oneWayHit) {
        body.y = ty * ts - body.h;
        body.vy = 0;
        body.onGround = true;
        break;
      }
    }
  } else {
    const ty = Math.floor(body.y / ts);
    for (let tx = left; tx <= right; tx++) {
      if (world.isSolid(tx, ty)) {
        body.y = (ty + 1) * ts;
        body.vy = 0;
        body.hitCeiling = true;
        break;
      }
    }
  }
}

/** Steht unter dem Punkt (x, Fußhöhe) begehbarer Boden? (für Kantenerkennung von Gegnern) */
export function hasGroundAt(world, x, footY) {
  const ts = world.tileSize;
  const tx = Math.floor(x / ts);
  const ty = Math.floor((footY + 1) / ts);
  return world.isSolid(tx, ty) || world.isOneWay(tx, ty);
}

/** Überlappen sich zwei Rechtecke? */
export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
