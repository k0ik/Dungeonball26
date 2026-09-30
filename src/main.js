import { createGame } from './game.js';
import longHall from './levels/long-hall.txt?raw';
import breakables from './levels/breakables.txt?raw';
import oneKey from './levels/one-key.txt?raw';
import warrens from './levels/warrens.txt?raw';
import untitled from './levels/untitled.txt?raw';

// The run, in order (design doc: "Levels"). Levels 4 and 5 arrive in M8.
const LEVELS = [
  { id: 'long-hall', name: 'Long Hall', text: longHall },
  { id: 'breakables', name: 'Breakables', text: breakables },
  { id: 'one-key', name: 'One Key', text: oneKey },
  { id: 'warrens', name: 'Warrens', text: warrens },
  { id: 'untitled', name: 'Untitled', text: untitled },
];

// Start on a level with the URL hash, e.g. #one-key.
const fromHash = LEVELS.findIndex((l) => `#${l.id}` === location.hash);
window.game = createGame(document.getElementById('game'), LEVELS, Math.max(0, fromHash));
