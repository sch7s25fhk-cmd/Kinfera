// Spielszene: Level aktualisieren, Kamera führen, alles zeichnen.

import { Scene } from '../engine/Scene.js';
import { Level } from '../level/Level.js';
import { Background } from '../level/Background.js';
import { renderLevelDecor } from '../level/levelDecor.js';
import { TouchControls } from '../ui/TouchControls.js';
import { drawHud, drawPauseIcon, pauseIconHit, drawPanel, hitRect } from '../ui/hud.js';
import { PauseScene } from './PauseScene.js';
import { PALETTE, COLORS } from '../data/palette.js';

export class LevelScene extends Scene {
  /** @param {object} levelDef */
  constructor(levelDef) {
    super();
    this.levelDef = levelDef;
    this.level = new Level(levelDef);
    this.background = new Background();
    this.touch = new TouchControls();
    this.cam = { x: 0, y: 0, viewWidth: 0, viewHeight: 0 };
    this.shake = 0;
    this.introTimer = 2.4;
    this.completeTimer = 0;
    this.resultButtons = [];
  }

  enter() {
    this.snapCamera();
  }

  update(dt) {
    const input = this.game.input;
    const r = this.game.renderer;
    this.touch.update(input, r);

    const tap = input.consumeTap();
    if ((tap && pauseIconHit(r, tap.x, tap.y)) || input.wasPressed('cancel')) {
      this.game.push(new PauseScene(() => this.restart()));
      return;
    }

    if (this.level.complete) {
      this.completeTimer += dt;
      if (this.completeTimer > 1.2) {
        const b = tap && hitRect(this.resultButtons, tap.x, tap.y);
        if (b || input.wasPressed('confirm')) {
          this.restart();
          return;
        }
      }
    }

    this.level.update(dt, input);
    for (const ev of this.level.takeEvents()) {
      if (ev.type === 'hurt') this.shake = 0.25;
      if (ev.type === 'stomp' || ev.type === 'defeat') this.shake = Math.max(this.shake, 0.08);
      if (ev.type === 'respawn') this.snapCamera();
    }
    this.shake = Math.max(0, this.shake - dt);
    this.introTimer = Math.max(0, this.introTimer - dt);
    this.followCamera(dt);
  }

  restart() {
    this.level = new Level(this.levelDef);
    this.completeTimer = 0;
    this.introTimer = 2.4;
    this.snapCamera();
  }

  cameraTarget() {
    const r = this.game.renderer;
    const hero = this.level.hero;
    return {
      x: hero.centerX + hero.facing * 28 - r.width / 2,
      y: hero.centerY - r.height * 0.55,
    };
  }

  clampCamera() {
    const r = this.game.renderer;
    const c = this.cam;
    c.viewWidth = r.width;
    c.viewHeight = r.height;
    c.x = Math.max(0, Math.min(c.x, this.level.pixelWidth - r.width));
    c.y = Math.max(0, Math.min(c.y, this.level.pixelHeight - r.height));
  }

  snapCamera() {
    const t = this.cameraTarget();
    this.cam.x = t.x;
    this.cam.y = t.y;
    this.clampCamera();
  }

  followCamera(dt) {
    const t = this.cameraTarget();
    this.cam.x += (t.x - this.cam.x) * Math.min(1, dt * 4);
    this.cam.y += (t.y - this.cam.y) * Math.min(1, dt * 3);
    this.clampCamera();
  }

  render(r) {
    const level = this.level;
    const time = this.game.time;
    // Gerundete Kamera (+ Wackeln) für pixelgenaues Zeichnen
    const sh = this.shake > 0 ? Math.round(Math.sin(time * 90) * 2) : 0;
    const cam = {
      x: Math.round(this.cam.x) + sh,
      y: Math.round(this.cam.y),
      viewWidth: r.width,
      viewHeight: r.height,
    };

    this.background.render(r, cam, time);
    level.map.render(r, cam, time);
    renderLevelDecor(r, level.map, cam, time);
    for (const cp of level.checkpoints) cp.render(r, cam, time);
    level.light?.render(r, cam, time);
    for (const s of level.sparks) s.render(r, cam, time);
    for (const e of level.enemies) e.render(r, cam);
    level.hero.renderGlow(r, cam, time);
    level.hero.render(r, cam);
    for (const s of level.shots) s.render(r, cam);
    level.particles.render(r, cam);

    drawHud(r, level, time);
    drawPauseIcon(r);
    this.touch.render(r);

    if (this.introTimer > 0) this.renderIntro(r);
    if (level.complete) this.renderComplete(r, time);
    if (this.game.debug) r.text(`FPS ${this.game.fps} ${r.width}X${r.height}`, 4, r.height - 8, COLORS.glow);
  }

  renderIntro(r) {
    const a = Math.min(1, this.introTimer / 0.6);
    const d = this.levelDef;
    r.withAlpha(a, () => {
      const y = Math.round(r.height * 0.3);
      r.withAlpha(0.6 * a, () => r.fillRect(0, y - 6, r.width, 30, PALETTE[0]));
      r.text(`${d.world} ${d.id}`, r.width / 2, y, COLORS.mist, { align: 'center' });
      r.text(d.name, r.width / 2, y + 9, COLORS.glow, { align: 'center', scale: 2 });
    });
  }

  renderComplete(r, time) {
    const t = this.completeTimer;
    // Aufhellen
    r.withAlpha(Math.min(0.5, t * 0.8), () => r.fillRect(0, 0, r.width, r.height, PALETTE[4]));
    if (t < 1.2) return;
    const level = this.level;
    this.resultButtons = drawPanel(r, 'Licht befreit!', [
      `Funken: ${level.collected} / ${level.totalSparks}`,
      `Zeit: ${level.time.toFixed(1)} s   Abstürze: ${level.deaths}`,
    ], ['Nochmal']);
  }
}
