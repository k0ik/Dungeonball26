# Dungeonball

A portrait-phone billiards + dungeon-crawler roguelike, with trait cards picked between levels. You are a ball; drag back and release to launch yourself pool-style through dungeon rooms, ricocheting off walls, barrels and enemies to reach the exit.

Full design spec: **[docs/design.md](docs/design.md)** — read it before implementing any gameplay system. It covers the turn structure, physics parameters, combat formulas, object behavior, level format, camera, audio, and the milestone build order (M0–M8). Treat it as the source of truth for game rules; this file only covers project-level conventions.

## Stack

- **Rendering:** Three.js, `THREE.OrthographicCamera` at a fixed isometric angle. No rotation or zoom control in the MVP beyond the speed-based dynamic zoom described in the design doc.
- **Simulation:** a custom 2D circle-physics solver on a fixed timestep (1/120s). The simulation is entirely 2D (x, z on the ground plane); only rendering is 3D. Matter.js is the fallback if the custom solver becomes too much work.
- **Build tooling:** Vite, plain JavaScript (no framework, no TypeScript unless you introduce it deliberately).
- **HUD:** HTML/CSS overlay on top of the canvas. The aim path preview is drawn in the 3D scene itself (ground plane), not the HTML overlay, so they track the isometric projection correctly.
- **Audio:** `THREE.AudioListener` / `THREE.Audio`, non-positional for the MVP. Placeholder SFX/music should come from a free CC0 pack (e.g. Kenney) until custom audio is ready.

## Conventions

- **Units:** all distances in the design doc are in tiles, not pixels or world units — check `docs/design.md`'s parameter tables before hardcoding a magic number.
- **Levels:** authored as plain text grids (one character per tile), per the legend in `docs/design.md`. Keep the level loader and the legend in sync — if you add a new tile character, update both.
- **Config:** keep every tunable number (speeds, radii, HP, ATK/DEF, sight range, etc.) in one config module rather than scattered through gameplay code, so the values in `docs/design.md`'s tables stay easy to retune.
- **New levels:** a newly added level goes first in the run (`LEVELS` in `src/main.js`) so it's the first one playtested; the previous newest moves back to its place in the run.
- **Build order:** follow the M0–M8 milestones in the design doc in sequence — each is meant to be playable on its own before moving to the next.

## Keeping the design doc in sync

`docs/design.md` is a snapshot exported from a live, editable doc. If design decisions change during implementation, update `docs/design.md` directly (it becomes the canonical copy once a repo exists) rather than letting code and doc drift apart silently.
