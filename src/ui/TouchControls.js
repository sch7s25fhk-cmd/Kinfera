// Bildschirmtasten im Pixel-Stil, direkt im Canvas gezeichnet (Mehrfinger-fähig).
// Links: ◀ ▶, rechts: Funke (B) und Sprung (A).

import { PALETTE } from '../data/palette.js';

const RADIUS = 15;
const HIT_RADIUS = 27; // großzügige Trefferfläche für Daumen

function layout(r) {
  const by = r.height - 26;
  return [
    { action: 'left', x: 24, y: by, icon: 'left' },
    { action: 'right', x: 62, y: by, icon: 'right' },
    { action: 'shoot', x: r.width - 64, y: by + 4, icon: 'spark', label: 'B' },
    { action: 'jump', x: r.width - 26, y: by - 10, icon: 'jump', label: 'A' },
  ];
}

export class TouchControls {
  constructor() {
    this.visible = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
      || new URLSearchParams(location.search).has('touch');
    this.down = new Set();
    // Erste Berührung blendet die Tasten ein (falls die Erkennung danebenlag)
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.visible = true; });
  }

  /** Finger → gehaltene Aktionen (jeder Finger zählt für die nächstgelegene Taste) */
  update(input, r) {
    const buttons = layout(r);
    const now = new Set();
    if (this.visible) {
      for (const p of input.pointers.values()) {
        let best = null;
        let bestD = HIT_RADIUS;
        for (const b of buttons) {
          const d = Math.hypot(p.x - b.x, p.y - b.y);
          if (d < bestD) { best = b; bestD = d; }
        }
        if (best) now.add(best.action);
      }
    }
    for (const b of buttons) input.setHeld(b.action, 'touch', now.has(b.action));
    this.down = now;
  }

  /** Liegt ein Punkt auf einer Taste? (damit Taps dort nichts anderes auslösen) */
  hits(r, x, y) {
    return this.visible && layout(r).some((b) => Math.hypot(x - b.x, y - b.y) < HIT_RADIUS);
  }

  render(r) {
    if (!this.visible) return;
    for (const b of layout(r)) {
      const pressed = this.down.has(b.action);
      r.withAlpha(pressed ? 0.55 : 0.32, () => r.fillCircle(b.x, b.y, RADIUS, PALETTE[0]));
      r.withAlpha(pressed ? 0.95 : 0.55, () => ring(r, b.x, b.y, RADIUS, pressed ? PALETTE[8] : PALETTE[4]));
      r.withAlpha(pressed ? 1 : 0.75, () => drawIcon(r, b.icon, b.x, b.y + (pressed ? 1 : 0), pressed ? PALETTE[8] : PALETTE[4]));
    }
  }
}

function ring(r, cx, cy, radius, color) {
  // Pixelgenauer Kreisring
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    r.fillRect(Math.round(cx + Math.cos(t) * radius), Math.round(cy + Math.sin(t) * radius), 1, 1, color);
  }
}

const ICONS = {
  left: ['...#', '..##', '.###', '####', '.###', '..##', '...#'],
  right: ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
  jump: ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..', '..###..'],
  spark: ['...#...', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '...#...'],
};

function drawIcon(r, name, cx, cy, color) {
  const rows = ICONS[name];
  const ox = Math.round(cx - rows[0].length);
  const oy = Math.round(cy - rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') r.fillRect(ox + x * 2, oy + y * 2, 2, 2, color);
  });
}
