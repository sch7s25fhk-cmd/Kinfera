// Game Loop mit festem Zeitschritt (60 Hz) und Szenen-Stack.

import { Renderer } from './Renderer.js';
import { Input } from './Input.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25; // verhindert "Todesspirale" nach Tab-Wechsel

export class Game {
  /**
   * @param {{ canvas: HTMLCanvasElement, shortSide: number, landscapeOnly?: boolean,
   *           renderRotateHint?: (r: Renderer) => void }} opts
   */
  constructor({ canvas, shortSide, landscapeOnly = false, renderRotateHint = null }) {
    this.landscapeOnly = landscapeOnly;
    this.renderRotateHint = renderRotateHint;
    this.renderer = new Renderer(canvas, shortSide);
    this.input = new Input(window);
    this.input.attachPointer(canvas, (cx, cy) => this.renderer.toGame(cx, cy));
    /** @type {import('./Scene.js').Scene[]} */
    this.scenes = [];
    this.time = 0; // Spielzeit in Sekunden
    this.debug = new URLSearchParams(window.location.search).has('debug');
    this.fps = 0;

    this.accumulator = 0;
    this.lastTimestamp = 0;
    this.fpsFrames = 0;
    this.fpsTimer = 0;
    this.frame = this.frame.bind(this);
  }

  get scene() {
    return this.scenes[this.scenes.length - 1] ?? null;
  }

  push(scene) {
    scene.game = this;
    this.scenes.push(scene);
    scene.enter();
  }

  pop() {
    const scene = this.scenes.pop();
    scene?.exit();
    return scene;
  }

  replace(scene) {
    this.pop();
    this.push(scene);
  }

  start() {
    requestAnimationFrame((t) => {
      this.lastTimestamp = t;
      requestAnimationFrame(this.frame);
    });
  }

  frame(timestamp) {
    const delta = Math.min((timestamp - this.lastTimestamp) / 1000, MAX_FRAME);
    this.lastTimestamp = timestamp;
    this.accumulator += delta;

    // Im Hochformat pausiert ein reines Querformat-Spiel
    const paused = this.isPortraitBlocked();
    if (paused) {
      this.accumulator = 0;
      this.input.endStep();
    }

    while (this.accumulator >= STEP) {
      this.time += STEP;
      this.scene?.update(STEP);
      this.input.endStep();
      this.accumulator -= STEP;
    }

    this.render();

    this.fpsFrames++;
    this.fpsTimer += delta;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    requestAnimationFrame(this.frame);
  }

  isPortraitBlocked() {
    return this.landscapeOnly && this.renderer.height > this.renderer.width;
  }

  render() {
    if (this.isPortraitBlocked()) {
      this.renderRotateHint?.(this.renderer);
      return;
    }
    // Von der obersten nicht-transparenten Szene an aufwärts zeichnen
    let start = this.scenes.length - 1;
    while (start > 0 && this.scenes[start].transparent) start--;
    for (let i = Math.max(0, start); i < this.scenes.length; i++) {
      this.scenes[i].render(this.renderer);
    }
  }
}
