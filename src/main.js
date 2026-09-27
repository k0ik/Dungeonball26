import { createGame } from './game.js';
import longHall from './levels/long-hall.txt?raw';

const LEVELS = [{ id: 'long-hall', name: 'Level 1: Long Hall', text: longHall }];

// Pick a level with the URL hash, e.g. #long-hall.
const fromHash = LEVELS.findIndex((l) => `#${l.id}` === location.hash);
window.game = createGame(document.getElementById('game'), LEVELS, Math.max(0, fromHash));
