// Visual level editor (design doc: To-do, "Visual level editor"), step 1:
// a flat top-down grid you paint tiles onto, with the level's real rounded
// wall outline drawn live (the game's own wall geometry). Desktop only.
//
// The level is kept as the same text grid the game reads (src/level.js), one
// character per tile, with curviness held separately and written into the
// top-left corner. Press E in the game (or Close here) to go back and forth;
// Play loads the grid into the game as it stands. Saving comes later; until
// then, Copy text gives the grid to paste into src/levels/.

import { CONFIG } from './config.js';
import { parseLevel } from './level.js';
import { loopPolygons } from './wallGeometry.js';

const C = CONFIG.colors;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// The palette: a tool per tile character.
const TOOLS = [
  { ch: '#', name: 'Wall' },
  { ch: '.', name: 'Floor' },
  { ch: 'S', name: 'Start' },
  { ch: 'X', name: 'Exit' },
  { ch: '*', name: 'Coin' },
  { ch: 'O', name: 'Barrel' },
  { ch: 'E', name: 'Red barrel' },
  { ch: 'C', name: 'Chest' },
  { ch: '1', name: 'Enemy 1' },
  { ch: '2', name: 'Enemy 2' },
  { ch: '3', name: 'Enemy 3' },
  { ch: '4', name: 'Enemy 4' },
  { ch: '5', name: 'Enemy 5' },
  { ch: '$', name: 'Gold ball' },
  { ch: 'r', name: 'Red key' },
  { ch: 'b', name: 'Blue key' },
  { ch: 'y', name: 'Yellow key' },
  { ch: 'R', name: 'Red door' },
  { ch: 'B', name: 'Blue door' },
  { ch: 'Y', name: 'Yellow door' },
  { ch: '_', name: 'Pit' },
  { ch: '~', name: 'Lava' },
  { ch: 'u', name: 'Divot' },
  { ch: 'n', name: 'Bump' },
];

const SIZES = { small: [9, 12], medium: [13, 20], large: [17, 30] };
const DEFAULT_CURVE = 3;
const KEY_HEX = { r: C.keys.red, b: C.keys.blue, y: C.keys.yellow, R: C.keys.red, B: C.keys.blue, Y: C.keys.yellow };

/** Text grid -> { grid: rows of chars, curve }. */
function fromText(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).filter((l) => l.length);
  let curve = CONFIG.walls.defaultCurve;
  if (/^\d/.test(lines[0])) {
    curve = Number(lines[0][0]);
    lines[0] = '#' + lines[0].slice(1);
  }
  return { grid: lines.map((l) => [...l]), curve };
}

/** The grid as level text, curviness in the corner. */
function toText(grid, curve) {
  const rows = grid.map((r) => r.join(''));
  rows[0] = String(curve) + rows[0].slice(1);
  return rows.join('\n') + '\n';
}

function blankGrid(w, h) {
  return Array.from({ length: h }, (_, row) =>
    Array.from({ length: w }, (_, col) => (row === 0 || col === 0 || row === h - 1 || col === w - 1 ? '#' : '.')),
  );
}

export function createEditor({ getLevel, onPlay }) {
  const root = document.createElement('div');
  root.className = 'editor';
  root.hidden = true;
  root.innerHTML = `
    <div class="ed-bar">
      <strong class="ed-title"></strong>
      <span class="ed-group">New: <button data-new="small">Small 9×12</button><button data-new="medium">Medium 13×20</button><button data-new="large">Large 17×30</button></span>
      <span class="ed-group">Roundness: <span class="ed-curves"></span></span>
      <span class="ed-spacer"></span>
      <button class="ed-copy">Copy text</button>
      <button class="ed-play primary">Play ▶</button>
      <button class="ed-close" title="Back to the game (E)">Close (E)</button>
    </div>
    <div class="ed-main">
      <div class="ed-palette"></div>
      <div class="ed-stage"><canvas></canvas></div>
    </div>
    <div class="ed-help">Click or drag to paint · click a tile with its own brush (or right-drag) to erase · the outer wall stays put · E to close (your edits are kept until you Play or start a New level)</div>
    <div class="ed-modal ed-ask" hidden><div><p></p><span class="ed-ask-buttons"><button class="ed-ask-yes primary"></button><button class="ed-ask-no"></button></span></div></div>
    <div class="ed-modal ed-text" hidden><div><p>Level text (copied, if your browser allowed it):</p><textarea readonly></textarea><button class="ed-modal-close">Done</button></div></div>
  `;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const stage = root.querySelector('.ed-stage');

  let grid = blankGrid(...SIZES.medium);
  let curve = DEFAULT_CURVE;
  let name = 'New level';
  let id = 'draft';
  let tool = '#';
  let outline = null; // wall polygons from the game's geometry (null: square walls)
  let hover = null;
  let tile = 24; // pixels per tile
  let painting = null; // the character being painted during a drag
  let dirty = false; // changes not yet played (nothing is saved yet)
  let elsewhere = null; // the game's level, when the editor is on a different one

  // --- Palette and bar --------------------------------------------------------
  const palette = root.querySelector('.ed-palette');
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.dataset.ch = t.ch;
    const icon = document.createElement('canvas');
    icon.width = icon.height = 28;
    drawTile(icon.getContext('2d'), t.ch, 0, 0, 28, true);
    b.append(icon, document.createTextNode(t.name));
    b.onclick = () => selectTool(t.ch);
    palette.appendChild(b);
  }
  function selectTool(ch) {
    tool = ch;
    for (const b of palette.children) b.classList.toggle('on', b.dataset.ch === ch);
  }
  selectTool('#');

  const curves = root.querySelector('.ed-curves');
  for (let c = 1; c <= 5; c++) {
    const b = document.createElement('button');
    b.textContent = c;
    b.title = c === 1 ? 'Square corners' : c === 5 ? 'Roundest' : '';
    b.onclick = () => {
      if (curve !== c) dirty = true;
      curve = c;
      refresh();
    };
    curves.appendChild(b);
  }
  for (const b of root.querySelectorAll('[data-new]')) {
    b.onclick = async () => {
      if (dirty && !(await ask(`Start a new level? Your changes to "${name}" haven't been played or saved, and will be lost.`, 'Start a new level', 'Keep editing'))) return;
      dirty = false;
      grid = blankGrid(...SIZES[b.dataset.new]);
      curve = DEFAULT_CURVE;
      name = 'New level';
      id = 'draft';
      elsewhere = getLevel()?.name ?? null;
      refresh();
    };
  }
  root.querySelector('.ed-play').onclick = () => {
    dirty = false; // the run now holds these edits
    elsewhere = null;
    close();
    onPlay({ id, name, text: toText(grid, curve) });
  };
  root.querySelector('.ed-close').onclick = () => close();
  const modal = root.querySelector('.ed-text');
  root.querySelector('.ed-copy').onclick = () => {
    const text = toText(grid, curve);
    navigator.clipboard?.writeText(text).catch(() => {});
    modal.querySelector('textarea').value = text;
    modal.hidden = false;
    modal.querySelector('textarea').select();
  };
  modal.querySelector('.ed-modal-close').onclick = () => (modal.hidden = true);

  // A yes/no question in the editor itself: the page may be sandboxed so the
  // browser's confirm() is blocked (it then answers no without asking).
  const askBox = root.querySelector('.ed-ask');
  function ask(message, yes, no) {
    askBox.querySelector('p').textContent = message;
    const yesBtn = askBox.querySelector('.ed-ask-yes');
    const noBtn = askBox.querySelector('.ed-ask-no');
    yesBtn.textContent = yes;
    noBtn.textContent = no;
    askBox.hidden = false;
    return new Promise((resolve) => {
      const done = (answer) => {
        askBox.hidden = true;
        resolve(answer);
      };
      yesBtn.onclick = () => done(true);
      noBtn.onclick = () => done(false);
    });
  }

  // --- Painting ---------------------------------------------------------------
  const cellAt = (e) => {
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / tile);
    const row = Math.floor((e.clientY - r.top) / tile);
    return row >= 0 && row < grid.length && col >= 0 && col < grid[0].length ? { col, row } : null;
  };
  const border = ({ col, row }) => row === 0 || col === 0 || row === grid.length - 1 || col === grid[0].length - 1;
  function paint(cell, ch) {
    if (!cell || border(cell) || grid[cell.row][cell.col] === ch) return;
    // Only one start: placing it moves it.
    if (ch === 'S') for (const r of grid) for (let c = 0; c < r.length; c++) if (r[c] === 'S') r[c] = '.';
    grid[cell.row][cell.col] = ch;
    dirty = true;
    refresh();
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    const cell = cellAt(e);
    // Clicking a tile with its own brush clears it to floor (a drag that
    // starts there erases the same way); right-click always erases.
    const same = cell && tool !== '.' && grid[cell.row][cell.col] === tool;
    painting = e.button === 2 || same ? '.' : tool;
    canvas.setPointerCapture(e.pointerId);
    paint(cellAt(e), painting);
  });
  canvas.addEventListener('pointermove', (e) => {
    const cell = cellAt(e);
    if (painting && painting !== 'S') paint(cell, painting);
    if (cell?.col !== hover?.col || cell?.row !== hover?.row) {
      hover = cell;
      draw();
    }
  });
  const stop = () => (painting = null);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    draw();
  });

  // --- Drawing ----------------------------------------------------------------
  /** The rounded wall outline, from the game's own geometry for this grid. */
  function computeOutline() {
    outline = null;
    if (curve <= 1) return;
    try {
      const level = parseLevel(toText(grid, curve), name, { requireStart: false });
      if (level.geometry) outline = loopPolygons(level.geometry, (r) => Math.max(4, Math.ceil(r * 12)));
    } catch {
      outline = null; // a grid the loader rejects: fall back to square walls
    }
  }

  function drawTile(g, ch, x, y, s, icon = false) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    const circle = (r, fill, stroke) => {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      if (stroke) {
        g.lineWidth = Math.max(1, s * 0.05);
        g.strokeStyle = stroke;
        g.stroke();
      }
    };
    if (icon) {
      g.fillStyle = hex(C.floorA);
      g.fillRect(x, y, s, s);
    }
    switch (ch) {
      case '#':
        if (icon) {
          g.fillStyle = hex(C.wallTop);
          g.fillRect(x + 2, y + 2, s - 4, s - 4);
        }
        break;
      case 'S':
        circle(s * 0.36, '#e9ecf1', '#1e1f21');
        g.fillStyle = '#1e1f21';
        g.font = `bold ${Math.round(s * 0.42)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('S', cx, cy + 1);
        break;
      case '_':
        g.fillStyle = '#050506';
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
        break;
      case '~':
        g.fillStyle = hex(C.lava);
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
        break;
      case 'u':
        circle(s * 0.38, 'rgba(0,0,0,0.35)', 'rgba(255,255,255,0.25)');
        break;
      case 'n':
        circle(s * 0.38, 'rgba(255,255,255,0.3)', 'rgba(0,0,0,0.35)');
        break;
      case 'X': {
        g.fillStyle = hex(C.exit);
        const r = s * 0.25;
        g.beginPath();
        g.roundRect(x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, r);
        g.fill();
        break;
      }
      case '*':
        circle(s * 0.16, hex(C.coin), '#7a5a10');
        break;
      case 'O':
        circle(s * 0.38, hex(C.barrel), '#3a2a12');
        circle(s * 0.24, hex(C.barrelTop));
        break;
      case 'E':
        circle(s * 0.38, hex(C.explosive), '#3a0a0a');
        circle(s * 0.24, hex(C.explosiveTop));
        g.fillStyle = '#3a0a0a';
        g.font = `bold ${Math.round(s * 0.36)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('!', cx, cy + 1);
        break;
      case 'C':
        g.fillStyle = hex(C.chest);
        g.fillRect(x + s * 0.14, y + s * 0.24, s * 0.72, s * 0.52);
        g.fillStyle = hex(C.chestBand);
        g.fillRect(x + s * 0.14, y + s * 0.44, s * 0.72, s * 0.1);
        g.strokeStyle = '#3a2a12';
        g.lineWidth = Math.max(1, s * 0.05);
        g.strokeRect(x + s * 0.14, y + s * 0.24, s * 0.72, s * 0.52);
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        circle(s * 0.4, hex(C.enemy), '#1e1f21');
        g.fillStyle = '#fff';
        g.font = `bold ${Math.round(s * 0.46)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(ch, cx, cy + 1);
        break;
      case '$':
        circle(s * 0.4, '#f2c230', '#7a5a10');
        g.fillStyle = '#7a5a10';
        g.font = `bold ${Math.round(s * 0.46)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('$', cx, cy + 1);
        break;
      case 'r':
      case 'b':
      case 'y': {
        // A key: a ring and a toothed stem.
        const col = hex(KEY_HEX[ch]);
        g.strokeStyle = col;
        g.lineWidth = Math.max(2, s * 0.1);
        g.beginPath();
        g.arc(x + s * 0.34, cy, s * 0.14, 0, Math.PI * 2);
        g.moveTo(x + s * 0.48, cy);
        g.lineTo(x + s * 0.82, cy);
        g.moveTo(x + s * 0.72, cy);
        g.lineTo(x + s * 0.72, cy + s * 0.14);
        g.stroke();
        break;
      }
      case 'R':
      case 'B':
      case 'Y':
        // A door: a slab across the tile in its key's colour.
        g.fillStyle = hex(KEY_HEX[ch]);
        g.fillRect(x + s * 0.06, cy - s * 0.16, s * 0.88, s * 0.32);
        g.strokeStyle = '#1e1f21';
        g.lineWidth = Math.max(1, s * 0.05);
        g.strokeRect(x + s * 0.06, cy - s * 0.16, s * 0.88, s * 0.32);
        break;
    }
  }

  function draw() {
    const rows = grid.length;
    const cols = grid[0].length;
    const W = cols * tile;
    const H = rows * tile;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Floor, then the walls: the rounded outline when there is one (filled
    // even-odd with the level's frame, like the game builds its wall mesh),
    // otherwise one square per wall tile.
    ctx.fillStyle = hex(C.floorA);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = hex(C.wallTop);
    if (outline) {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      for (const poly of outline) {
        poly.forEach((p, i) => (i ? ctx.lineTo(p.x * tile, p.z * tile) : ctx.moveTo(p.x * tile, p.z * tile)));
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.strokeStyle = '#2b2c2f';
      ctx.lineWidth = 1.5;
      for (const poly of outline) {
        ctx.beginPath();
        poly.forEach((p, i) => (i ? ctx.lineTo(p.x * tile, p.z * tile) : ctx.moveTo(p.x * tile, p.z * tile)));
        ctx.closePath();
        ctx.stroke();
      }
    } else {
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) if (grid[row][col] === '#') ctx.fillRect(col * tile, row * tile, tile, tile);
    }

    // A faint grid, so tiles under a rounded corner still show where they are.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < cols; c++) {
      ctx.moveTo(c * tile + 0.5, 0);
      ctx.lineTo(c * tile + 0.5, H);
    }
    for (let r = 1; r < rows; r++) {
      ctx.moveTo(0, r * tile + 0.5);
      ctx.lineTo(W, r * tile + 0.5);
    }
    ctx.stroke();
    // Wall tiles that the rounding cut into floor still read as walls: a light hatch.
    if (outline) {
      ctx.fillStyle = 'rgba(181,184,190,0.18)';
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) if (grid[row][col] === '#') ctx.fillRect(col * tile + 1, row * tile + 1, tile - 2, tile - 2);
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const ch = grid[row][col];
        if (ch !== '#' && ch !== '.') drawTile(ctx, ch, col * tile, row * tile, tile);
      }
    }

    if (hover) {
      ctx.globalAlpha = 0.55;
      if (!border(hover)) drawTile(ctx, tool, hover.col * tile, hover.row * tile, tile, tool === '#' || tool === '.');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = border(hover) ? '#ff5a5a' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.col * tile + 1, hover.row * tile + 1, tile - 2, tile - 2);
    }
  }

  function layout() {
    const r = stage.getBoundingClientRect();
    tile = Math.max(8, Math.floor(Math.min((r.height - 16) / grid.length, (r.width - 16) / grid[0].length)));
  }

  function refresh() {
    root.querySelector('.ed-title').textContent = elsewhere ? `${name} (the game is on ${elsewhere})` : name;
    for (const b of curves.children) b.classList.toggle('on', Number(b.textContent) === curve);
    computeOutline();
    layout();
    draw();
  }
  new ResizeObserver(() => !root.hidden && refresh()).observe(stage);

  function load(def) {
    ({ grid, curve } = fromText(def.text));
    name = def.name;
    id = def.id;
    dirty = false;
  }
  async function open() {
    // The editor opens the level the game is on. Unplayed edits to that same
    // level are kept (closing and reopening picks up where you left off);
    // unplayed edits to another level (the game has moved on, say) are only
    // kept if you choose to.
    const def = getLevel();
    if (def && !dirty) load(def);
    root.hidden = false;
    document.body.classList.add('editing');
    if (def && dirty && def.id !== id) {
      elsewhere = def.name;
      refresh();
      const switchTo = await ask(`The game is on "${def.name}", but you have unplayed edits to "${name}".`, `Open "${def.name}" (lose the edits)`, `Keep editing "${name}"`);
      if (switchTo) load(def);
    }
    elsewhere = def && def.id !== id ? def.name : null;
    refresh();
  }
  function close() {
    root.hidden = true;
    modal.hidden = true;
    askBox.hidden = true;
    document.body.classList.remove('editing');
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (e.key === 'e' || e.key === 'E') (root.hidden ? open : close)();
  });

  return {
    open,
    close,
    get isOpen() {
      return !root.hidden;
    },
  };
}
