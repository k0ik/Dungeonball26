import { createGame } from './game.js';
import level1 from './levels/level1.txt?raw';

window.game = createGame(document.getElementById('game'), level1, 'Level 1: First Shot');
