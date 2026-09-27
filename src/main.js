import { createGame } from './game.js';
import level1 from './levels/level1.txt?raw';
import longHall from './levels/test-long-hall.txt?raw';

const LEVELS = [
  { id: 'level1', name: 'Level 1: First Shot', text: level1 },
  { id: 'long-hall', name: 'Test: Long Hall', text: longHall },
];

// Pick a level with the URL hash, e.g. #long-hall.
const fromHash = LEVELS.findIndex((l) => `#${l.id}` === location.hash);
window.game = createGame(document.getElementById('game'), LEVELS, Math.max(0, fromHash));
