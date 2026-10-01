// Kleine HUD-Bausteine, direkt im Canvas gezeichnet (keine HTML-Knöpfe).

import { COLORS } from '../data/palette.js';

const ICON_SIZE = 14;
const ICON_MARGIN = 5;
const HIT_PAD = 6; // größere Trefferfläche für Finger

function iconRect(r) {
  return { x: r.width - ICON_SIZE - ICON_MARGIN, y: ICON_MARGIN, w: ICON_SIZE, h: ICON_SIZE };
}

/** Menü-Symbol oben rechts (drei Striche in einem Rahmen) */
export function drawMenuIcon(r) {
  const { x, y, w, h } = iconRect(r);
  r.withAlpha(0.85, () => {
    r.fillRect(x, y, w, h, COLORS.ink);
    r.strokeRect(x + 1, y + 1, w - 2, h - 2, COLORS.mist);
    for (let i = 0; i < 3; i++) r.fillRect(x + 4, y + 4 + i * 2 + i, w - 8, 1, COLORS.white);
  });
}

export function menuIconHit(r, px, py) {
  const { x, y, w, h } = iconRect(r);
  return px >= x - HIT_PAD && px <= x + w + HIT_PAD && py >= y - HIT_PAD && py <= y + h + HIT_PAD;
}

/** Nachrichtenbox am unteren Rand mit automatischem Zeilenumbruch */
export function drawMessageBox(r, text) {
  const pad = 6;
  const lines = r.wrapText(text, r.width - 8 - pad * 2);
  const h = lines.length * 7 + pad * 2 - 2;
  const y = r.height - h - 4;
  r.fillRect(4, y, r.width - 8, h, COLORS.ink);
  r.strokeRect(5, y + 1, r.width - 10, h - 2, COLORS.mist);
  r.text(lines.join('\n'), 4 + pad, y + pad, COLORS.white);
}
