// Overworld: Karte, Spielfigur, Kamera, Hintergrund, Touch-Steuerung und HUD.
// Steuerung: Tippen = hinlaufen (bzw. hingehen und untersuchen), Finger halten = in Richtung Finger laufen.

import { Scene } from '../engine/Scene.js';
import { Camera } from '../engine/Camera.js';
import { Tilemap } from '../engine/Tilemap.js';
import { TILESET, TILE_SIZE } from '../data/tiles.js';
import { PALETTE, COLORS } from '../data/palette.js';
import { parseMap } from './mapLoader.js';
import { Player, dirBetween } from './Player.js';
import { CloudSea } from './CloudSea.js';
import { Ambience } from './Ambience.js';
import { renderTileDecor } from './tileDecor.js';
import { findPath } from './pathfinding.js';
import { PauseScene } from '../ui/PauseScene.js';
import { drawMenuIcon, menuIconHit, drawMessageBox } from '../ui/hud.js';

const BANNER_TIME = 3; // Sekunden, die der Inselname eingeblendet bleibt
const HOLD_DEADZONE = 10; // Spielpixel um die Figur ohne Richtung

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
    this.ambience = new Ambience();
    this.showGrid = false;
    this.bannerTimer = BANNER_TIME;
    this.hint = '';
    this.hintTimer = 0;
    /** @type {{x: number, y: number, t: number, ok: boolean} | null} Tipp-Markierung */
    this.marker = null;
  }

  enter() {
    const r = this.game.renderer;
    this.camera = new Camera(r.width, r.height);
    this.camera.setBounds(this.map.pixelWidth, this.map.pixelHeight);
    this.updateCamera();
  }

  updateCamera() {
    const r = this.game.renderer;
    // Auflösung kann sich ändern (Drehen des Handys)
    this.camera.viewWidth = r.width;
    this.camera.viewHeight = r.height;
    const ts = TILE_SIZE;
    this.camera.follow(this.player.x + ts / 2, this.player.y + ts / 2);
  }

  update(dt) {
    const input = this.game.input;
    const r = this.game.renderer;

    const tap = input.consumeTap();
    if (tap) {
      if (menuIconHit(r, tap.x, tap.y)) {
        this.openMenu();
        return;
      }
      if (this.hintTimer > 0) this.hintTimer = 0; // Tippen schließt den Hinweis
      this.handleTap(tap);
    }

    // Entwicklerhilfe am PC
    if (input.wasPressed('cancel')) {
      this.openMenu();
      return;
    }
    if (input.wasPressed('confirm') && !this.player.moving) this.inspect(this.player.facingTile());
    if (this.game.debug && input.wasPressed('debug1')) this.showGrid = !this.showGrid;

    let dir = input.direction();
    if (!dir && input.isHolding()) dir = this.holdDirection(input.pointer);
    if (dir) this.marker = null;

    this.player.update(dt, dir, this.map);
    this.updateCamera();
    this.ambience.update(dt, this.camera);

    if (this.marker) {
      this.marker.t += dt;
      if (!this.marker.ok && this.marker.t > 0.5) this.marker = null;
    }
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.hintTimer = Math.max(0, this.hintTimer - dt);
  }

  openMenu() {
    this.player.clearPath();
    this.marker = null;
    this.game.push(new PauseScene());
  }

  /** Richtung vom Spieler zum gehaltenen Finger */
  holdDirection(pointer) {
    const cx = this.player.x - this.camera.x + TILE_SIZE / 2;
    const cy = this.player.y - this.camera.y + TILE_SIZE / 2;
    const dx = pointer.x - cx;
    const dy = pointer.y - cy;
    if (Math.abs(dx) < HOLD_DEADZONE && Math.abs(dy) < HOLD_DEADZONE) return null;
    return dirBetween({ x: 0, y: 0 }, { x: dx, y: dy });
  }

  handleTap(tap) {
    const tx = Math.floor((tap.x + this.camera.x) / TILE_SIZE);
    const ty = Math.floor((tap.y + this.camera.y) / TILE_SIZE);
    const p = this.player;
    const blocked = (x, y) => this.map.isSolid(x, y);
    // Startpunkt: das Feld, auf dem die Figur nach dem laufenden Schritt steht
    const start = { x: p.tx, y: p.ty };

    if (!this.map.isSolid(tx, ty)) {
      if (tx === p.tx && ty === p.ty && !p.moving) return;
      const path = findPath(blocked, start, (x, y) => x === tx && y === ty);
      this.setMarker(tx, ty, path !== null);
      if (path) p.setPath(path, () => { this.marker = null; });
      return;
    }

    // Blockiertes Feld: daneben stellen und untersuchen
    const target = { x: tx, y: ty };
    const adjacent = (x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1;
    const path = findPath(blocked, start, adjacent);
    this.setMarker(tx, ty, path !== null);
    if (!path) return;
    p.setPath(path, () => {
      this.marker = null;
      p.dir = dirBetween({ x: p.tx, y: p.ty }, target);
      this.inspect(target);
    });
  }

  setMarker(x, y, ok) {
    this.marker = { x, y, t: 0, ok };
  }

  inspect(tile) {
    const id = this.map.get(tile.x, tile.y);
    this.showHint(INSPECT_TEXT[id] ?? 'Hier ist nichts Besonderes.');
  }

  showHint(text) {
    this.hint = text;
    this.hintTimer = 3.5;
  }

  render(r) {
    const time = this.game.time;
    const cam = this.camera;
    this.clouds.render(r, cam, time);
    this.map.render(r, cam, time);
    renderTileDecor(r, this.map, cam);
    if (this.marker) this.renderMarker(r);
    this.player.render(r, cam);
    this.map.renderOverlay(r, cam);
    this.ambience.render(r, cam);

    if (this.bannerTimer > 0) this.renderBanner(r);
    drawMenuIcon(r);
    if (this.hintTimer > 0) drawMessageBox(r, this.hint);
    if (this.game.debug) this.renderDebug(r);
  }

  renderMarker(r) {
    const m = this.marker;
    const ts = TILE_SIZE;
    const x = m.x * ts - this.camera.x;
    const y = m.y * ts - this.camera.y;
    if (!m.ok) {
      // Unerreichbar: kurzes rotes Kreuz
      const c = PALETTE.f;
      for (let i = 4; i < 12; i++) {
        r.fillRect(x + i, y + i, 1, 1, c);
        r.fillRect(x + 15 - i, y + i, 1, 1, c);
      }
      return;
    }
    // Pulsierende Ecken
    const inset = 1 + Math.round((Math.sin(m.t * 8) + 1) * 1.5);
    const c = PALETTE[8];
    const len = 4;
    const a = inset;
    const b = ts - inset;
    r.fillRect(x + a, y + a, len, 1, c); r.fillRect(x + a, y + a, 1, len, c);
    r.fillRect(x + b - len, y + a, len, 1, c); r.fillRect(x + b - 1, y + a, 1, len, c);
    r.fillRect(x + a, y + b - 1, len, 1, c); r.fillRect(x + a, y + b - len, 1, len, c);
    r.fillRect(x + b - len, y + b - 1, len, 1, c); r.fillRect(x + b - 1, y + b - len, 1, len, c);
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

  renderDebug(r) {
    const cam = this.camera;
    const ts = TILE_SIZE;
    if (this.showGrid) {
      const { x0, y0, x1, y1 } = this.map.visibleRange(cam);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const sx = tx * ts - cam.x;
          const sy = ty * ts - cam.y;
          if (this.map.isSolid(tx, ty)) r.withAlpha(0.3, () => r.fillRect(sx, sy, ts, ts, COLORS.ember));
          r.withAlpha(0.25, () => r.strokeRect(sx, sy, ts, ts, COLORS.ink));
        }
      }
    }
    const p = this.player;
    const info = `FPS ${this.game.fps} X${p.tx} Y${p.ty} ${r.width}X${r.height}`;
    r.fillRect(0, r.height - 8, r.measureText(info) + 4, 8, COLORS.ink);
    r.text(info, 2, r.height - 7, COLORS.glow);
  }
}

// Kurze Beschreibung beim Untersuchen – Platzhalter bis zu den Dialogen in Phase 5
const INSPECT_TEXT = {
  tree: 'Ein alter Mooswaldbaum. Er summt leise.',
  rock: 'Ein Fels voller feiner Echo-Rillen.',
  water: 'Klares Wasser. Wolken spiegeln sich darin.',
  flowers: 'Kleine Blumen wiegen sich im Wind.',
  tallGrass: 'Hohes Gras. Irgendetwas raschelt darin.',
  cliff: 'Darunter: nur das Wolkenmeer.',
  cliffBottom: 'Darunter: nur das Wolkenmeer.',
  void: 'Darunter: nur das Wolkenmeer.',
};
