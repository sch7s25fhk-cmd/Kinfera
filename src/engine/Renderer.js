// Canvas-Verwaltung: ganzzahliges Hochskalieren, Zeichen-Helfer, Bitmap-Schrift.

import { FONT, GLYPH_WIDTH, GLYPH_HEIGHT, GLYPH_MAX_HEIGHT, GLYPH_ADVANCE, LINE_HEIGHT } from '../data/font.js';

// Zeilen oberhalb der Grundhöhe (für Umlautpunkte)
const GLYPH_TOP = GLYPH_MAX_HEIGHT - GLYPH_HEIGHT;

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} width  interne Auflösung
   * @param {number} height
   */
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    canvas.width = width;
    canvas.height = height;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.scale = 1;
    // Cache: Farbe → Canvas mit allen Glyphen in dieser Farbe
    this.fontCache = new Map();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Der Bildbereich ändert sich auch, wenn die Touch-Steuerung ein-/ausgeblendet wird
    if (canvas.parentElement && 'ResizeObserver' in window) {
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }
  }

  /**
   * Skaliert auf den verfügbaren Platz des Elternelements. Bevorzugt wird ein Maßstab in ganzen
   * Gerätepixeln (alle Spielpixel gleich groß). Würde das zu viel Fläche verschenken
   * (z. B. Handy im Hochformat), wird stattdessen die volle Breite genutzt.
   */
  resize() {
    const box = this.canvas.parentElement ?? document.body;
    const availW = box.clientWidth || window.innerWidth;
    const availH = box.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const raw = Math.min(availW / this.width, availH / this.height);
    const snapped = Math.max(1, Math.floor(raw * dpr)) / dpr;
    const s = snapped / raw >= 0.85 ? snapped : raw;
    this.scale = s;
    this.canvas.style.width = `${this.width * s}px`;
    this.canvas.style.height = `${this.height * s}px`;
  }

  clear(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  fillRect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  strokeRect(x, y, w, h, color) {
    x = Math.round(x);
    y = Math.round(y);
    this.fillRect(x, y, w, 1, color);
    this.fillRect(x, y + h - 1, w, 1, color);
    this.fillRect(x, y, 1, h, color);
    this.fillRect(x + w - 1, y, 1, h, color);
  }

  /** Pixelgenauer gefüllter Kreis (ohne Kantenglättung) */
  fillCircle(cx, cy, radius, color) {
    this.ctx.fillStyle = color;
    cx = Math.round(cx);
    cy = Math.round(cy);
    for (let dy = -radius; dy <= radius; dy++) {
      const half = Math.floor(Math.sqrt(radius * radius - dy * dy));
      this.ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
  }

  drawImage(img, x, y) {
    this.ctx.drawImage(img, Math.round(x), Math.round(y));
  }

  withAlpha(alpha, fn) {
    const prev = this.ctx.globalAlpha;
    this.ctx.globalAlpha = alpha;
    fn();
    this.ctx.globalAlpha = prev;
  }

  // ---- Bitmap-Schrift ----------------------------------------------------

  glyphAtlas(color) {
    let atlas = this.fontCache.get(color);
    if (atlas) return atlas;
    const chars = Object.keys(FONT);
    atlas = { canvas: document.createElement('canvas'), index: new Map() };
    atlas.canvas.width = chars.length * GLYPH_WIDTH;
    atlas.canvas.height = GLYPH_MAX_HEIGHT;
    const ctx = atlas.canvas.getContext('2d');
    ctx.fillStyle = color;
    chars.forEach((ch, i) => {
      atlas.index.set(ch, i);
      const rows = FONT[ch];
      const offset = GLYPH_MAX_HEIGHT - rows.length;
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === '#') ctx.fillRect(i * GLYPH_WIDTH + x, y + offset, 1, 1);
        }
      });
    });
    this.fontCache.set(color, atlas);
    return atlas;
  }

  /** Breite eines Textes in Pixeln (einzeilig) */
  measureText(str) {
    return str.length ? str.length * GLYPH_ADVANCE - 1 : 0;
  }

  /**
   * @param {string} str
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {{ shadow?: string, align?: 'left'|'center'|'right' }} [opts]
   */
  text(str, x, y, color, opts = {}) {
    const lines = String(str).toUpperCase().split('\n');
    lines.forEach((line, li) => {
      let lx = x;
      if (opts.align === 'center') lx = x - Math.floor(this.measureText(line) / 2);
      else if (opts.align === 'right') lx = x - this.measureText(line);
      const ly = y + li * LINE_HEIGHT;
      if (opts.shadow) this.drawLine(line, lx + 1, ly + 1, opts.shadow);
      this.drawLine(line, lx, ly, color);
    });
  }

  drawLine(line, x, y, color) {
    const atlas = this.glyphAtlas(color);
    x = Math.round(x);
    y = Math.round(y);
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch !== ' ') {
        const idx = atlas.index.get(ch) ?? atlas.index.get('?');
        this.ctx.drawImage(atlas.canvas, idx * GLYPH_WIDTH, 0, GLYPH_WIDTH, GLYPH_MAX_HEIGHT,
          x + i * GLYPH_ADVANCE, y - GLYPH_TOP, GLYPH_WIDTH, GLYPH_MAX_HEIGHT);
      }
    }
  }
}
