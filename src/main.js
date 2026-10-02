// Einstiegspunkt: Spiel erstellen und Titelbild starten.

import { Game } from './engine/Game.js';
import { TitleScene } from './scenes/TitleScene.js';
import { PALETTE, COLORS } from './data/palette.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));

// Querformat: Höhe = 180 Spielpixel, Breite passt sich dem Handy an
const game = new Game({
  canvas,
  shortSide: 180,
  landscapeOnly: true,
  renderRotateHint(r) {
    r.clear(PALETTE[1]);
    const cx = r.width / 2;
    const cy = r.height / 2;
    // Handy-Symbol, gedreht dargestellt
    r.strokeRect(cx - 14, cy - 34, 28, 18, COLORS.mist);
    r.fillRect(cx + 10, cy - 27, 2, 4, COLORS.mist);
    r.text('Bitte Handy', cx, cy - 4, COLORS.glow, { align: 'center' });
    r.text('quer halten', cx, cy + 5, COLORS.glow, { align: 'center' });
  },
});

game.push(new TitleScene());
game.start();

// Für Experimente in der Browser-Konsole
window.funkenflug = game;
