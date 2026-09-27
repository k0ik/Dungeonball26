# Dungeonball

A portrait-phone billiards + dungeon-crawler prototype. You play as a ball: drag back and release to launch yourself pool-style through dungeon rooms, ricocheting off walls, barrels and enemies to reach the exit.

Rendered as a true orthographic 3D isometric view in [Three.js](https://threejs.org/), with a 2D physics simulation underneath.

## Status

Design/MVP-planning stage. See **[docs/design.md](docs/design.md)** for the full design doc: core loop, physics parameters, combat formulas, object behavior, level format, camera and audio design, and the milestone build order.

## Getting started

```bash
npm install
npm run dev
```

To test on a phone on the same network, run the dev server with `--host` and open the printed LAN address on the phone's browser.

## Project layout

- `docs/design.md` — the design doc (source of truth for gameplay rules)
- `CLAUDE.md` — conventions for AI-assisted development in this repo
- `src/` — game source (to be scaffolded per milestone M0 in the design doc)
