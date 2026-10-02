// HUD: Laternen-Anzeige, Funkenzähler, Pause-Symbol und Dialogfenster.

import { getSprite } from '../engine/SpriteSheet.js';
import { PALETTE, COLORS } from '../data/palette.js';
import { SPARK_PICKUP } from '../data/sprites/items.js';
import { LANTERN } from '../data/balance.js';

const LANTERN_ICON = [
  '..0000..',
  '.09aa90.',
  '00000000',
  '0.8448.0',
  '0.4884.0',
  '0.8448.0',
  '00000000',
  '.09aa90.',
];

const LANTERN_ICON_DIM = LANTERN_ICON.map((row) => row.replace(/[48]/g, '1'));

/**
 * @param {import('../engine/Renderer.js').Renderer} r
 * @param {import('../level/Level.js').Level} level
 * @param {number} time
 */
export function drawHud(r, level, time) {
  const hero = level.hero;
  const frac = hero.lantern / LANTERN.max;
  const low = hero.lantern < LANTERN.minToShoot + LANTERN.shotCost * 2;
  const x = 6;
  const y = 6;

  // Laterne + Leuchtbalken
  r.withAlpha(0.6, () => r.fillRect(x - 2, y - 2, 62, 12, PALETTE[0]));
  const blink = low && Math.floor(time * 4) % 2 === 0;
  r.drawImage(getSprite(blink ? LANTERN_ICON_DIM : LANTERN_ICON, PALETTE), x, y);
  const bw = 46;
  r.fillRect(x + 11, y + 2, bw, 4, PALETTE[1]);
  r.fillRect(x + 11, y + 2, Math.round(bw * frac), 4, low ? PALETTE.f : PALETTE[8]);
  r.fillRect(x + 11, y + 2, Math.round(bw * frac), 1, PALETTE[4]);

  // Funkenzähler
  const sx = x + 66;
  r.withAlpha(0.6, () => r.fillRect(sx - 2, y - 2, 38, 12, PALETTE[0]));
  r.drawImage(getSprite(SPARK_PICKUP[0], PALETTE), sx - 1, y);
  r.text(`${level.collected}/${level.totalSparks}`, sx + 9, y + 2, COLORS.white);
}

const PAUSE_SIZE = 14;
function pauseRect(r) {
  return { x: r.width - PAUSE_SIZE - 6, y: 5, w: PAUSE_SIZE, h: PAUSE_SIZE };
}

export function drawPauseIcon(r) {
  const { x, y, w, h } = pauseRect(r);
  r.withAlpha(0.7, () => r.fillRect(x, y, w, h, PALETTE[0]));
  r.strokeRect(x + 1, y + 1, w - 2, h - 2, PALETTE[3]);
  r.fillRect(x + 4, y + 4, 2, 6, PALETTE[4]);
  r.fillRect(x + 8, y + 4, 2, 6, PALETTE[4]);
}

export function pauseIconHit(r, px, py) {
  const { x, y, w, h } = pauseRect(r);
  const pad = 8;
  return px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad;
}

/** Fenster mit Titel und Text-Tasten; gibt die Tastenrechtecke zurück */
export function drawPanel(r, title, lines, buttons) {
  const w = Math.min(190, r.width - 20);
  const h = 26 + lines.length * 8 + (buttons.length ? 22 : 0);
  const x = Math.round((r.width - w) / 2);
  const y = Math.round((r.height - h) / 2);
  r.fillRect(x, y, w, h, PALETTE[1]);
  r.strokeRect(x, y, w, h, PALETTE[0]);
  r.strokeRect(x + 1, y + 1, w - 2, h - 2, PALETTE[3]);
  r.text(title, r.width / 2, y + 7, COLORS.glow, { align: 'center', scale: 1 });
  lines.forEach((line, i) => r.text(line, r.width / 2, y + 19 + i * 8, COLORS.white, { align: 'center' }));
  const rects = [];
  const bw = 70;
  const gap = 8;
  const total = buttons.length * bw + (buttons.length - 1) * gap;
  buttons.forEach((label, i) => {
    const bx = Math.round((r.width - total) / 2 + i * (bw + gap));
    const by = y + h - 20;
    r.fillRect(bx, by, bw, 15, PALETTE[0]);
    r.strokeRect(bx + 1, by + 1, bw - 2, 13, i === 0 ? PALETTE[8] : PALETTE[3]);
    r.text(label, bx + bw / 2, by + 5, i === 0 ? COLORS.glow : COLORS.white, { align: 'center' });
    rects.push({ x: bx, y: by, w: bw, h: 15, label });
  });
  return rects;
}

export function hitRect(rects, px, py) {
  return rects.find((b) => px >= b.x - 3 && px <= b.x + b.w + 3 && py >= b.y - 4 && py <= b.y + b.h + 4) ?? null;
}
