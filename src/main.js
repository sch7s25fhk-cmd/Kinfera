// Einstiegspunkt: Spiel erstellen und erste Szene starten.

import { Game } from './engine/Game.js';
import { OverworldScene } from './world/OverworldScene.js';
import { MOOSHAIN } from './data/maps/mooshain.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const game = new Game({ canvas, width: 320, height: 180 });
game.push(new OverworldScene(MOOSHAIN));
game.start();

// Für Experimente in der Browser-Konsole
window.driftlande = game;
