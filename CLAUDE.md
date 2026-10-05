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
- **Level order:** the run (`LEVELS` in `src/main.js`) starts with the tutorials in their teaching order (Tutorial 01, The Floor is Lava, Round the Bend, Line of Sight, Fight!, Barrel Run), then the rest. Levels are now playtested from the level editor (E, then Play), which plays the edited level in place of the current one, so a newly added level no longer has to go first; put a new tutorial where it belongs in that order and other new levels after the tutorials unless told otherwise.
- **Build order:** follow the M0–M8 milestones in the design doc in sequence — each is meant to be playable on its own before moving to the next.

## Workflow

How changes get made and shown in this project (the owner plays the game from a published page, not a local dev server):

- **Branch and PR:** work on the session's designated branch and push to it; pushes update the open pull request. Don't open a new PR unless asked.
- **Build the playable page:** `npm run build:page -- <path>.html` writes the whole game as one self-contained HTML file. Write it to the session's scratchpad directory, not the repo.
- **Publish:** publish that HTML file to the game's existing artifact, https://claude.ai/artifact/J5MVTZ9XUHiT9hm5DKRxhS (pass it as the artifact `url` from a new session, so the link stays the same). Always finish the build before publishing; never run the two in parallel.
- **Level grids pasted in chat:** save them under `src/levels/` (new levels also go in `LEVELS` in `src/main.js`, see Level order), describe the level in `docs/design.md` (Levels section), then commit, push, build and publish. For map-only changes, the quick level check is enough (`node --test tests/level.test.js`: it parses every map and catches a broken border, a missing start or exit, or a typo); skip the full suite and the browser check. If a grid breaks a rule (for example no start), make the smallest fix and say so.
- **Code changes:** run the full suite (`npm test`), and check anything visual or interactive in headless Chromium (Playwright, with `executablePath: '/opt/pw-browsers/chromium'` and `--use-gl=swiftshader`), with throwaway scripts kept in the scratchpad.
- **Design doc requests** ("design doc: ..." or "d'doc: ..."): write them into `docs/design.md` (usually the To-do section, or the relevant table such as cards or trick shots); they're not requests to build.
- **Level editor:** press E in the game. It can't save yet, so finished levels reach the repo by the owner pasting the editor's "Copy text" into chat.

## Keeping the design doc in sync

`docs/design.md` is a snapshot exported from a live, editable doc. If design decisions change during implementation, update `docs/design.md` directly (it becomes the canonical copy once a repo exists) rather than letting code and doc drift apart silently.
