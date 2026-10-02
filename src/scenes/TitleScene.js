// Titelbild: Logo, Lio, treibende Wolken. Tippen startet.

import { Scene } from '../engine/Scene.js';
import { getSprite } from '../engine/SpriteSheet.js';
import { Background } from '../level/Background.js';
import { HERO } from '../data/sprites/hero.js';
import { PALETTE, COLORS } from '../data/palette.js';
import { LevelScene } from './LevelScene.js';
import { LEVEL_1_1 } from '../data/levels/level1_1.js';

export class TitleScene extends Scene {
  constructor() {
    super();
    this.background = new Background(9);
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const input = this.game.input;
    if (input.consumeTap() || input.wasPressed('confirm') || input.wasPressed('jump')) {
      this.game.replace(new LevelScene(LEVEL_1_1));
    }
  }

  render(r) {
    const t = this.t;
    this.background.render(r, { x: t * 20, y: 20 }, t);

    // Logo mit Schatten
    const y = Math.round(r.height * 0.22);
    r.text('FUNKENFLUG', r.width / 2 + 2, y + 2, PALETTE[0], { align: 'center', scale: 4 });
    r.text('FUNKENFLUG', r.width / 2, y, COLORS.glow, { align: 'center', scale: 4 });
    r.text('Lio und die verlorenen Lichter', r.width / 2, y + 30, COLORS.white, { align: 'center', shadow: PALETTE[0] });

    // Lio schwebt mit leuchtender Laterne
    const lx = Math.round(r.width / 2 - 16);
    const ly = Math.round(r.height * 0.55 + Math.sin(t * 2) * 3);
    r.withAlpha(0.15, () => r.fillCircle(lx + 10, ly + 14, 30, PALETTE[8]));
    r.drawImageScaled(getSprite(HERO.idle, PALETTE), lx, ly, 2);

    if (Math.floor(t * 2) % 2 === 0) {
      r.text('Tippen zum Starten', r.width / 2, r.height - 20, COLORS.white, { align: 'center', shadow: PALETTE[0] });
    }
  }
}
