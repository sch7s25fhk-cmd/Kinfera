// Pixel-Arrays (Strings, ein Zeichen = ein Pixel) → gecachte Offscreen-Canvases.
// '.' ist transparent, alle anderen Zeichen werden über die Palette aufgelöst.

const cache = new WeakMap();

/**
 * @param {string[]} rows
 * @param {Record<string, string>} palette
 * @param {{ flipX?: boolean }} [opts]
 * @returns {HTMLCanvasElement}
 */
export function buildSprite(rows, palette, opts = {}) {
  const h = rows.length;
  const w = rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[opts.flipX ? w - 1 - x : x];
      if (ch === '.' || ch === undefined) continue;
      const hex = palette[ch];
      if (!hex) throw new Error(`Unbekanntes Palettenzeichen '${ch}'`);
      const i = (y * w + x) * 4;
      img.data[i] = parseInt(hex.slice(1, 3), 16);
      img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
      img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Wie buildSprite, aber pro Array-Objekt nur einmal erzeugt.
 * @param {string[]} rows
 * @param {Record<string, string>} palette
 * @param {boolean} [flipX]
 */
export function getSprite(rows, palette, flipX = false) {
  let entry = cache.get(rows);
  if (!entry) {
    entry = {};
    cache.set(rows, entry);
  }
  const key = flipX ? 'flipped' : 'normal';
  if (!entry[key]) entry[key] = buildSprite(rows, palette, { flipX });
  return entry[key];
}
