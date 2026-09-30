import { createGame } from './game.js';
import longHall from './levels/long-hall.txt?raw';
import breakables from './levels/breakables.txt?raw';
import oneKey from './levels/one-key.txt?raw';
import warrens from './levels/warrens.txt?raw';
import crawlspace from './levels/crawlspace.txt?raw';
import caverns from './levels/caverns.txt?raw';
import bowls from './levels/bowls.txt?raw';

// The run, in order (design doc: "Levels"). Levels 4 and 5 arrive in M8.
const LEVELS = [
  // Rounded-walls trial level, first for now so it's quick to reach.
  { id: 'bowls', name: 'Bowls', text: bowls },
  { id: 'long-hall', name: 'Long Hall', text: longHall },
  { id: 'breakables', name: 'Breakables', text: breakables },
  { id: 'one-key', name: 'One Key', text: oneKey },
  { id: 'warrens', name: 'Warrens', text: warrens },
  { id: 'crawlspace', name: 'Crawlspace', text: crawlspace },
  { id: 'caverns', name: 'Caverns', text: caverns },
];

// Start on a level with the URL hash, e.g. #one-key.
const fromHash = LEVELS.findIndex((l) => `#${l.id}` === location.hash);
window.game = createGame(document.getElementById('game'), LEVELS, Math.max(0, fromHash));
