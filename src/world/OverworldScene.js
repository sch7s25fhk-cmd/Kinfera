// Overworld: Karte, Spielfigur, Kamera, Hintergrund und Debug-Overlay.

import { Scene } from '../engine/Scene.js';
import { Camera } from '../engine/Camera.js';
import { Tilemap } from '../engine/Tilemap.js';
import { TILESET, TILE_SIZE } from '../data/tiles.js';
import { PALETTE, COLORS } from '../data/palette.js';
import { parseMap } from './mapLoader.js';
import { Player } from './Player.js';
import { CloudSea } from './CloudSea.js';
import { renderIslandEdges } from './islandEdges.js';
import { PauseScene } from '../ui/PauseScene.js';

const BANNER_TIME = 3; // Sekunden, die der Inselname eingeblendet bleibt

export class OverworldScene extends Scene {
  /** @param {object} mapDef Kartendefinition aus src/data/maps */
  constructor(mapDef) {
    super();
    this.mapDef = mapDef;
    const parsed = parseMap(mapDef);
    this.map = new Tilemap({ ...parsed, tileSize: TILE_SIZE, tileset: TILESET, palette: PALETTE });
    const { x, y, dir } = mapDef.spawn;
    this.player = new Player(x, y, dir, TILE_SIZE);
    this.clouds = new CloudSea();
    this.showGrid = false;
    this.bannerTimer = BANNER_TIME;
    this.hint = '';
    this.hintTimer = 0;
  }

  enter() {
    const r = this.game.renderer;
    this.camera = new Camera(r.width, r.height);
    this.camera.setBounds(this.map.pixelWidth, this.map.pixelHeight);
    this.updateCamera();
  }

  updateCamera() {
    const ts = TILE_SIZE;
    this.camera.follow(this.player.x + ts / 2, this.player.y + ts / 2);
  }

  update(dt) {
    const input = this.game.input;

    if (input.wasPressed('cancel')) {
      this.game.push(new PauseScene());
      return;
    }

    if (input.wasPressed('confirm') && !this.player.moving) {
      const t = this.player.facingTile();
      const id = this.map.get(t.x, t.y);
      this.showHint(INSPECT_TEXT[id] ?? 'Hier ist nichts Besonderes.');
    }

    if (this.game.debug && input.wasPressed('debug1')) this.showGrid = !this.showGrid;

    this.player.update(dt, input, this.map);
    this.updateCamera();

    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.hintTimer = Math.max(0, this.hintTimer - dt);
  }

  showHint(text) {
    this.hint = text;
    this.hintTimer = 2.5;
  }

  render(r) {
    const time = this.game.time;
    this.clouds.render(r, this.camera, time);
    this.map.render(r, this.camera, time);
    renderIslandEdges(r, this.map, this.camera);
    this.player.render(r, this.camera);

    if (this.bannerTimer > 0) this.renderBanner(r);
    if (this.hintTimer > 0) this.renderHint(r);
    if (this.game.debug) this.renderDebug(r);
  }

  renderBanner(r) {
    const alpha = Math.min(1, this.bannerTimer / 0.6);
    const name = this.mapDef.name;
    const w = r.measureText(name) + 16;
    const x = Math.floor((r.width - w) / 2);
    r.withAlpha(alpha, () => {
      r.fillRect(x, 8, w, 13, COLORS.ink);
      r.strokeRect(x + 1, 9, w - 2, 11, COLORS.stone);
      r.text(name, r.width / 2, 12, COLORS.glow, { align: 'center' });
    });
  }

  renderHint(r) {
    const y = r.height - 18;
    r.fillRect(4, y, r.width - 8, 14, COLORS.ink);
    r.strokeRect(5, y + 1, r.width - 10, 12, COLORS.mist);
    r.text(this.hint, 10, y + 5, COLORS.white);
  }

  renderDebug(r) {
    const cam = this.camera;
    const ts = TILE_SIZE;
    if (this.showGrid) {
      const x0 = Math.floor(cam.x / ts);
      const y0 = Math.floor(cam.y / ts);
      for (let ty = y0; ty <= y0 + Math.ceil(r.height / ts); ty++) {
        for (let tx = x0; tx <= x0 + Math.ceil(r.width / ts); tx++) {
          const sx = tx * ts - cam.x;
          const sy = ty * ts - cam.y;
          if (this.map.isSolid(tx, ty)) {
            r.withAlpha(0.3, () => r.fillRect(sx, sy, ts, ts, COLORS.ember));
          }
          r.withAlpha(0.25, () => r.strokeRect(sx, sy, ts, ts, COLORS.ink));
        }
      }
    }
    const p = this.player;
    const info = `FPS ${this.game.fps}  X${p.tx} Y${p.ty}  F1 RASTER`;
    r.fillRect(0, 0, r.measureText(info) + 4, 8, COLORS.ink);
    r.text(info, 2, 1, COLORS.glow);
  }
}

// Kurze Beschreibung beim Untersuchen (Enter) – Platzhalter bis zu den Dialogen in Phase 5
const INSPECT_TEXT = {
  tree: 'Ein alter Mooswaldbaum. Er summt leise.',
  rock: 'Ein Fels voller feiner Echo-Rillen.',
  water: 'Klares Wasser. Wolken spiegeln sich darin.',
  flowers: 'Kleine Blumen wiegen sich im Wind.',
  cliff: 'Darunter: nur das Wolkenmeer.',
  cliffBottom: 'Darunter: nur das Wolkenmeer.',
  void: 'Darunter: nur das Wolkenmeer.',
};
