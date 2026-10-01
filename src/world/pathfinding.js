// Wegfindung auf dem Tile-Raster (Breitensuche, 4 Richtungen). Reine Logik, testbar.

const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * @param {(x: number, y: number) => boolean} isBlocked
 * @param {{x: number, y: number}} start
 * @param {(x: number, y: number) => boolean} isGoal
 * @param {number} [limit] maximale Anzahl untersuchter Felder
 * @returns {{x: number, y: number}[] | null} Schritte ohne Startfeld; [] wenn Start schon Ziel ist
 */
export function findPath(isBlocked, start, isGoal, limit = 4000) {
  if (isGoal(start.x, start.y)) return [];
  const key = (x, y) => `${x},${y}`;
  const cameFrom = new Map([[key(start.x, start.y), null]]);
  const queue = [start];

  for (let head = 0; head < queue.length && cameFrom.size <= limit; head++) {
    const cur = queue[head];
    for (const [dx, dy] of STEPS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = key(nx, ny);
      if (cameFrom.has(k) || isBlocked(nx, ny)) continue;
      cameFrom.set(k, cur);
      const node = { x: nx, y: ny };
      if (isGoal(nx, ny)) return rebuild(cameFrom, node, key);
      queue.push(node);
    }
  }
  return null;
}

function rebuild(cameFrom, node, key) {
  const path = [];
  for (let n = node; cameFrom.get(key(n.x, n.y)) !== null; n = cameFrom.get(key(n.x, n.y))) {
    path.push(n);
  }
  return path.reverse();
}
