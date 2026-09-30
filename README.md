# Dungeonball

A portrait-phone billiards + dungeon-crawler prototype. You play as a ball: drag back and release to launch yourself pool-style through dungeon rooms, ricocheting off walls, barrels and enemies to reach the exit.

Rendered as a true orthographic 3D isometric view in [Three.js](https://threejs.org/), with a 2D physics simulation underneath.

## Status

M0–M7 done: the full core loop, a run of three levels, and trait cards. You shoot, then every enemy takes a turn, nearest first: ones that can see you (marked "!") lunge at you, the rest patrol. You have HP, 3 lives and respawns; enemies take damage from your hits and combos. Barrels break in two hits and leave loot on the floor (gold, potions, a shield, a sword, 1-ups), chests hold gold, red barrels explode on whoever touches them, and gold is the score. Keys open matching doors, and each exit leads to the next level (Long Hall, Breakables, One Key) with HP, gear, lives and gold carried over. Levels render at the mockup's isometric angle with a slingshot aim, power-scaled path preview and a camera that follows the ball. After each level you pick a trait card (hold up to 3): Vampirism, Doppleganger, Junk Hunter, Bullionaire, Barrel of Fun, Locksmith, Athletic, Money Magnet or Elasticity. The last two levels and polish (M8) come next. See **[docs/design.md](docs/design.md)** for the full design doc: core loop, physics parameters, combat formulas, object behavior, level format, camera and audio design, and the milestone build order.

## Getting started

```bash
npm install
npm run dev     # then open the printed URL
npm test        # physics, aim and level-loader unit tests
npm run build:page -- out.html   # one self-contained HTML page, for sharing a playable snapshot
```

Controls: press on the ball, drag back away from where you want to go, release. Release close to the ball (where the preview disappears) to cancel. `d` toggles the debug overlay (or add `?debug` to the URL), `r` respawns the hero. Reaching the green exit loads the next level; `n` skips to it, and a level opens directly from its id in the URL hash (`#long-hall`, `#breakables`, `#one-key`).

To test on a phone on the same network, run `npm run host` and open the printed LAN address on the phone's browser.

## Project layout

- `docs/design.md` — the design doc (source of truth for gameplay rules)
- `CLAUDE.md` — conventions for AI-assisted development in this repo
- `src/config.js` — every tunable number (physics, aim, camera, colours, audio)
- `src/level.js` + `src/levels/*.txt` — text-grid level loader and levels
- `src/physics.js` — fixed-step 2D circle solver and the swept cast used by the aim preview
- `src/aim.js` — slingshot aim maths and the physics look-ahead preview
- `src/combat.js` — damage rules for your shot and the enemy phase
- `src/sight.js`, `src/turns.js` — line of sight, turn order, lunges and patrols
- `src/objects.js`, `src/loot.js` — barrels, chests, red barrels, coin strips, the loot table and pickup rules
- `src/doors.js` — keys and doors
- `src/cards.js` — trait cards: the set, offers and taking a card
- `src/render/` — Three.js views: level geometry, hero and enemy balls, aim preview, camera rig, HUD bar, and the HTML overlay for HP bars, "!" markers and damage numbers
- `src/audio.js` — SFX via `THREE.Audio` (synthesized placeholders for now)
- `src/game.js` — wires input, simulation, rendering and audio together
- `tests/` — `node --test` unit tests
