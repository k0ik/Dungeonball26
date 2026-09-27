# Dungeonball

A portrait-phone billiards + dungeon-crawler prototype. You play as a ball: drag back and release to launch yourself pool-style through dungeon rooms, ricocheting off walls, barrels and enemies to reach the exit.

Rendered as a true orthographic 3D isometric view in [Three.js](https://threejs.org/), with a 2D physics simulation underneath.

## Status

M0 + M1 done: level 1 renders in the isometric view, and you can shoot the hero ball around it with slingshot aim, a power ring, a bounce preview, speed-based zoom and placeholder SFX. Enemies, turns and loot come next (M2–M7). See **[docs/design.md](docs/design.md)** for the full design doc: core loop, physics parameters, combat formulas, object behavior, level format, camera and audio design, and the milestone build order.

## Getting started

```bash
npm install
npm run dev     # then open the printed URL
npm test        # physics, aim and level-loader unit tests
```

Controls: press on the ball, drag back away from where you want to go, release. Release inside the inner ring to cancel. `d` toggles the debug overlay (or add `?debug` to the URL), `r` respawns the hero.

To test on a phone on the same network, run `npm run host` and open the printed LAN address on the phone's browser.

## Project layout

- `docs/design.md` — the design doc (source of truth for gameplay rules)
- `CLAUDE.md` — conventions for AI-assisted development in this repo
- `src/config.js` — every tunable number (physics, aim, camera, colours, audio)
- `src/level.js` + `src/levels/*.txt` — text-grid level loader and levels
- `src/physics.js` — fixed-step 2D circle solver and the swept cast used by the aim preview
- `src/aim.js` — slingshot aim maths
- `src/render/` — Three.js views: level geometry, balls, aim ring/preview, camera rig
- `src/audio.js` — SFX via `THREE.Audio` (synthesized placeholders for now)
- `src/game.js` — wires input, simulation, rendering and audio together
- `tests/` — `node --test` unit tests
