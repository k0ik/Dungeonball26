import { createGame } from './game.js';
import { createEditor } from './editor.js';
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
import treasureTrove from './levels/treasure-trove.txt?raw';
import barrelRun from './levels/barrel-run.txt?raw';
import lineOfSight from './levels/line-of-sight.txt?raw';
import fight from './levels/fight.txt?raw';
import tut01 from './levels/tut01.txt?raw';
import enemytester01 from './levels/enemytester01.txt?raw';
import bowls from './levels/bowls.txt?raw';

// The run, in order (design doc: "Levels"). Levels 4 and 5 arrive in M8.
const LEVELS = [
  // The tutorials first, in order (see CLAUDE.md); a level played from the
  // level editor slots in at the current place instead.
  // `message` (optional): shown in a panel at the bottom while you're on the level.
  { id: 'tut01', name: 'Tutorial 01', text: tut01, message: 'Press on the ball and drag to aim. Release to shoot. Reach the exit.' },
  { id: 'line-of-sight', name: 'Line of Sight', text: lineOfSight, message: 'Enemies only attack if they can see you.' },
  { id: 'fight', name: 'Fight!', text: fight, message: "You're tougher than you think." },
  { id: 'barrel-run', name: 'Barrel Run', text: barrelRun, message: 'Wooden barrels contain loot. Red barrels contain explosives.' },
  { id: 'treasure-trove', name: 'Treasure Trove', text: treasureTrove },
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

// The level editor (desktop): E opens the current level in it.
const editor = createEditor({ getLevel: () => window.game.levelDef, onPlay: (def) => window.game.playLevel(def) });
// Finishing a level played from the editor goes back to the editor.
window.game.onTestComplete = () => editor.open();
