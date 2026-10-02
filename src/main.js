import { createGame } from './game.js';
import longHall from './levels/long-hall.txt?raw';
import breakables from './levels/breakables.txt?raw';
import oneKey from './levels/one-key.txt?raw';
import warrens from './levels/warrens.txt?raw';
import crawlspace from './levels/crawlspace.txt?raw';
import caverns from './levels/caverns.txt?raw';
import roomies from './levels/roomies.txt?raw';
import pinball from './levels/pinball.txt?raw';
import gauntlet from './levels/gauntlet.txt?raw';
import gauntlet02 from './levels/gauntlet02.txt?raw';
import tut01 from './levels/tut01.txt?raw';
import enemytester01 from './levels/enemytester01.txt?raw';
import bowls from './levels/bowls.txt?raw';

// The run, in order (design doc: "Levels"). Levels 4 and 5 arrive in M8.
const LEVELS = [
  // The newest level goes first while it's being playtested (see CLAUDE.md).
  { id: 'tut01', name: 'Tutorial 01', text: tut01 },
  { id: 'bowls', name: 'Bowls', text: bowls },
  { id: 'long-hall', name: 'Long Hall', text: longHall },
  { id: 'breakables', name: 'Breakables', text: breakables },
  { id: 'one-key', name: 'One Key', text: oneKey },
  { id: 'warrens', name: 'Warrens', text: warrens },
  { id: 'crawlspace', name: 'Crawlspace', text: crawlspace },
  { id: 'caverns', name: 'Caverns', text: caverns },
  { id: 'roomies', name: 'Roomies', text: roomies },
  { id: 'pinball', name: 'Pinball', text: pinball },
  { id: 'gauntlet', name: 'Gauntlet', text: gauntlet },
  { id: 'gauntlet02', name: 'Gauntlet 02', text: gauntlet02 },
  { id: 'enemytester01', name: 'Enemy Tester 01', text: enemytester01 },
];

// Start on a level with the URL hash, e.g. #one-key.
const fromHash = LEVELS.findIndex((l) => `#${l.id}` === location.hash);
window.game = createGame(document.getElementById('game'), LEVELS, Math.max(0, fromHash));
