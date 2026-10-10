import { createGame } from './game.js';
import { createEditor } from './editor.js';
import longHall from './levels/long-hall.txt?raw';
import oneKey from './levels/one-key.txt?raw';
import warrens from './levels/warrens.txt?raw';
import crawlspace from './levels/crawlspace.txt?raw';
import gauntlet02 from './levels/gauntlet02.txt?raw';
import pitfalls from './levels/pitfalls.txt?raw';
import roomRaider from './levels/room-raider.txt?raw';
import facilities from './levels/facilities.txt?raw';
import theOnion from './levels/the-onion.txt?raw';
import arena from './levels/arena.txt?raw';
import barracks from './levels/barracks.txt?raw';
import billiards from './levels/billiards.txt?raw';
import barrelRun from './levels/barrel-run.txt?raw';
import lineOfSight from './levels/line-of-sight.txt?raw';
import fight from './levels/fight.txt?raw';
import tut01 from './levels/tut01.txt?raw';
import roundTheBend from './levels/round-the-bend.txt?raw';
import floorIsLava from './levels/floor-is-lava.txt?raw';
import enemytester01 from './levels/enemytester01.txt?raw';

// The run, in order (design doc: "Levels"). Levels 4 and 5 arrive in M8.
const LEVELS = [
  // The tutorials first, in order (see CLAUDE.md); a level played from the
  // level editor slots in at the current place instead.
  // `message` (optional): shown in a panel at the bottom while you're on the level.
  { id: 'tut01', name: 'Welcome to Dungeonball', text: tut01, message: 'Press on the ball and drag to aim. Release to shoot. Reach the exit.' },
  { id: 'floor-is-lava', name: 'The Floor is Lava', text: floorIsLava, message: 'Be careful! Sometimes full power is dangerous.' },
  { id: 'round-the-bend', name: 'Round the Bend', text: roundTheBend, message: 'Shoot straight ahead to bank around curves.' },
  { id: 'line-of-sight', name: 'Line of Sight', text: lineOfSight, message: 'Enemies only attack if they can see you.' },
  { id: 'fight', name: 'Fight!', text: fight, message: "You're tougher than you think." },
  { id: 'barrel-run', name: 'Barrel Run', text: barrelRun, message: 'Wooden barrels contain loot. Red barrels contain explosives.' },
  { id: 'billiards', name: 'Billiards', text: billiards },
  { id: 'long-hall', name: 'Long Hall', text: longHall },
  { id: 'one-key', name: 'One Key', text: oneKey },
  { id: 'warrens', name: 'Warrens', text: warrens },
  { id: 'gauntlet02', name: 'The Gauntlet', text: gauntlet02 },
  { id: 'enemytester01', name: 'The Hallway', text: enemytester01 },
  { id: 'room-raider', name: 'Room Raider', text: roomRaider },
  { id: 'arena', name: 'Arena', text: arena },
  { id: 'the-onion', name: 'The Onion', text: theOnion },
  { id: 'facilities', name: 'Facilities', text: facilities },
  { id: 'pitfalls', name: 'Pitfalls', text: pitfalls, message: 'Knock enemies into the pits and lava. Divots pull, bumps push.' },
  { id: 'barracks', name: 'Barracks', text: barracks }, // work in progress
  { id: 'crawlspace', name: 'Crawlspace', text: crawlspace },
];

// Start on a level with the URL hash, e.g. #one-key.
const fromHash = LEVELS.findIndex((l) => `#${l.id}` === location.hash);
// If anything breaks (above all, the browser refusing to start WebGL), say so
// on screen instead of leaving a blank page, so it can be reported.
function showFatal(err, lost = false) {
  if (document.querySelector('.fatal')) return;
  const box = document.createElement('div');
  box.className = 'fatal';
  const webgl = /webgl|context/i.test(String(err?.message ?? err));
  box.innerHTML = '<strong></strong><p></p><code></code>';
  box.querySelector('strong').textContent = lost ? 'The 3D graphics were switched off' : webgl ? "The game couldn't start its 3D graphics" : 'Something went wrong';
  box.querySelector('p').textContent = lost
    ? 'The browser took the WebGL context away (phones do this when short of memory or when the graphics stall), so the screen went black. Reload the page to carry on, and send a screenshot of this with what had just happened.'
    : webgl
      ? 'Your browser refused to create a WebGL context (this can happen after many reloads). Try reloading the page, or opening it in a new tab.'
      : 'Reload the page to try again. If it keeps happening, send a screenshot of this message.';
  box.querySelector('code').textContent = String(err?.stack ?? err?.message ?? err).split('\n').slice(0, 4).join('\n');
  document.body.appendChild(box);
}
window.addEventListener('error', (e) => showFatal(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));

try {
  window.game = createGame(document.getElementById('game'), LEVELS, Math.max(0, fromHash));
} catch (err) {
  showFatal(err);
  throw err;
}

// A black screen with no error is the browser taking the WebGL context away:
// say so, with where the game was, instead of leaving it black.
document.querySelector('#game canvas')?.addEventListener('webglcontextlost', () => {
  const g = window.game;
  const where = `level ${g.levelDef?.name ?? '?'}, phase ${g.state?.phase ?? '?'}, view ${g.rig?.viewWidth?.toFixed(1) ?? '?'} tiles, pixel ratio ${g.renderer?.getPixelRatio?.().toFixed(2) ?? "?"}`;
  showFatal(new Error(`WebGL context lost (${where})`), true);
});

// The level editor (desktop): E opens the current level in it.
const editor = createEditor({ getLevel: () => window.game.levelDef, onPlay: (def) => window.game.playLevel(def) });
// Finishing a level played from the editor goes back to the editor.
window.game.onTestComplete = () => editor.open();
