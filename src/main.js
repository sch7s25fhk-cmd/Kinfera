// Einstiegspunkt: Spiel erstellen, Touch-Steuerung einrichten, erste Szene starten.

import { Game } from './engine/Game.js';
import { OverworldScene } from './world/OverworldScene.js';
import { MOOSHAIN } from './data/maps/mooshain.js';
import { createTouchControls, wantsTouchControls } from './ui/TouchControls.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const game = new Game({ canvas, width: 320, height: 180 });

const touchRoot = document.getElementById('touch');
if (touchRoot) {
  createTouchControls(touchRoot, game.input);
  const enableTouch = () => document.body.classList.add('touch');
  if (wantsTouchControls()) enableTouch();
  // Falls die Erkennung danebenliegt: erste Berührung schaltet die Steuerung ein
  window.addEventListener('touchstart', enableTouch, { once: true, passive: true });
}

game.push(new OverworldScene(MOOSHAIN));
game.start();

// Für Experimente in der Browser-Konsole
window.driftlande = game;
