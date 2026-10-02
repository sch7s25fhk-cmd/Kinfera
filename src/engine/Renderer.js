// Canvas-Verwaltung: ganzzahliges Hochskalieren, Zeichen-Helfer, Bitmap-Schrift.

import { FONT, GLYPH_WIDTH, GLYPH_HEIGHT, GLYPH_MAX_HEIGHT, GLYPH_ADVANCE, LINE_HEIGHT } from '../data/font.js';

// Zeilen oberhalb der Grundhöhe (für Umlautpunkte)
const GLYPH_TOP = GLYPH_MAX_HEIGHT - GLYPH_HEIGHT;

export class Renderer {
  /**
   * Die interne Auflösung passt sich dem Bildschirm an: Die kürzere Seite hat immer
   * `shortSide` Spielpixel, die längere füllt den Bildschirm (Hoch- wie Querformat, kein Rand).
   * @param {HTMLCanvasElement} canvas
   * @param {number} shortSide
   */
  constructor(canvas, shortSide) {
    this.canvas = canvas;
    this.shortSide = shortSide;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.scale = 1;
    // Cache: Farbe → Canvas mit allen Glyphen in dieser Farbe
    this.fontCache = new Map();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 100));
    if (canvas.parentElement && 'ResizeObserver' in window) {
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }
  }

  resize() {
    const box = this.canvas.parentElement ?? document.body;
    const availW = box.clientWidth || window.innerWidth;
    const availH = box.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const raw = Math.min(availW, availH) / this.shortSide;
    // Möglichst ganze Gerätepixel pro Spielpixel (gleich große Pixel)
    const snapped = Math.max(1, Math.floor(raw * dpr)) / dpr;
    const s = snapped / raw >= 0.85 ? snapped : raw;
    const w = Math.ceil(availW / s);
    const h = Math.ceil(availH / s);
    this.scale = s;
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.imageSmoothingEnabled = false;
    }
    this.canvas.style.width = `${w * s}px`;
    this.canvas.style.height = `${h * s}px`;
  }

  /** Bildschirmkoordinaten (z. B. Touch) → Spielpixel */
  toGame(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.width,
      y: ((clientY - rect.top) / rect.height) * this.height,
    };
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

  /** Bild mit ganzzahligem Vergrößerungsfaktor zeichnen */
  drawImageScaled(img, x, y, scale) {
    this.ctx.drawImage(img, Math.round(x), Math.round(y), img.width * scale, img.height * scale);
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

  /** Bricht Text an Wortgrenzen so um, dass jede Zeile höchstens maxWidth Pixel breit ist */
  wrapText(str, maxWidth) {
    const maxChars = Math.max(1, Math.floor((maxWidth + 1) / GLYPH_ADVANCE));
    const lines = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > maxChars && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    return lines;
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
   * @param {{ shadow?: string, align?: 'left'|'center'|'right', scale?: number }} [opts]
   */
  text(str, x, y, color, opts = {}) {
    const s = opts.scale ?? 1;
    const lines = String(str).toUpperCase().split('\n');
    lines.forEach((line, li) => {
      let lx = x;
      const w = this.measureText(line) * s;
      if (opts.align === 'center') lx = x - Math.floor(w / 2);
      else if (opts.align === 'right') lx = x - w;
      const ly = y + li * LINE_HEIGHT * s;
      if (opts.shadow) this.drawLine(line, lx + s, ly + s, opts.shadow, s);
      this.drawLine(line, lx, ly, color, s);
    });
  }

  drawLine(line, x, y, color, s = 1) {
    const atlas = this.glyphAtlas(color);
    x = Math.round(x);
    y = Math.round(y);
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch !== ' ') {
        const idx = atlas.index.get(ch) ?? atlas.index.get('?');
        this.ctx.drawImage(atlas.canvas, idx * GLYPH_WIDTH, 0, GLYPH_WIDTH, GLYPH_MAX_HEIGHT,
          x + i * GLYPH_ADVANCE * s, y - GLYPH_TOP * s, GLYPH_WIDTH * s, GLYPH_MAX_HEIGHT * s);
      }
    }
  }
}
