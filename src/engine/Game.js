// Game Loop mit festem Zeitschritt (60 Hz) und Szenen-Stack.

import { Renderer } from './Renderer.js';
import { Input } from './Input.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25; // verhindert "Todesspirale" nach Tab-Wechsel

export class Game {
  /**
   * @param {{ canvas: HTMLCanvasElement, width: number, height: number }} opts
   */
  constructor({ canvas, width, height }) {
    this.renderer = new Renderer(canvas, width, height);
    this.input = new Input(window);
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

  render() {
    // Von der obersten nicht-transparenten Szene an aufwärts zeichnen
    let start = this.scenes.length - 1;
    while (start > 0 && this.scenes[start].transparent) start--;
    for (let i = Math.max(0, start); i < this.scenes.length; i++) {
      this.scenes[i].render(this.renderer);
    }
  }
}
