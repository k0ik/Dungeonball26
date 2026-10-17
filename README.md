# Dungeonball

A portrait-phone billiards + dungeon-crawler prototype. You play as a ball: drag back and release to launch yourself pool-style through dungeon rooms, ricocheting off walls, barrels and enemies to reach the exit.

Rendered as a true orthographic 3D isometric view in [Three.js](https://threejs.org/), with a 2D physics simulation underneath.

## Status

Milestones **M0** and **M1** are done: level 1 renders in an orthographic isometric view, and you can slingshot the hero ball around it with the power ring, path preview, custom 2D physics, and launch/bounce SFX. Enemies, objects and the exit are parsed from the level file but not active yet (M3+).

See **[docs/design.md](docs/design.md)** for the full design doc: core loop, physics parameters, combat formulas, object behavior, level format, camera and audio design, and the milestone build order.

Controls: press on the ball, drag back, release to fire the opposite way. Release inside the inner ring to cancel. Press **D** (or open with `?debug`) for the debug overlay.

Audio is a synthesized placeholder for now; swap in CC0 clips (e.g. Kenney) in `src/audio.js` without changing any hookups.

## Getting started

```bash
npm install
npm run dev
npm test     # physics and level-loader tests
```

To test on a phone on the same network, run the dev server with `--host` and open the printed LAN address on the phone's browser.

## Project layout

- `docs/design.md` — the design doc (source of truth for gameplay rules)
- `CLAUDE.md` — conventions for AI-assisted development in this repo
- `src/config.js` — every tunable number (mirrors the design doc's tables)
- `src/level.js` — text-grid level loader and tile legend
- `src/levels/` — level files, one character per tile
- `src/physics.js` — fixed-step 2D circle solver and aim-path prediction
- `src/input.js` — slingshot aim (mouse and touch, raycast onto the ground plane)
- `src/render/` — camera, level and ball meshes, power ring and path preview
- `src/audio.js`, `src/debug.js`, `src/main.js` — SFX, debug overlay, game loop
- `test/` — `node --test` unit tests
