// Every tunable number lives here. Distances are in tiles, times in seconds.
// Values mirror the parameter tables in docs/design.md — retune here, not in gameplay code.

export const PHYSICS = {
  step: 1 / 120, // fixed timestep
  maxSubsteps: 12, // cap per frame so a stalled tab doesn't spiral
  ballDiameter: 0.65,
  friction: 3.5, // constant deceleration, tiles/s²
  stopThreshold: 0.25, // tiles/s; below this a ball is at rest
  wallRestitution: 0.9, // fraction of speed kept after a wall bounce
  ballRestitution: 0.9, // ball-to-ball, equal mass
};

export const AIM = {
  ringInner: 0.6, // cancel zone radius
  ringOuter: 1.6, // full power at this drag distance
  maxLaunchSpeed: 9, // tiles/s
  pressRadius: 0.9, // how close to the hero a press must land to start aiming
  previewDotSpacing: 0.28,
  previewBendRingRadius: 0.16,
  previewMaxTime: 4, // seconds of ghost simulation for the preview
};

export const CAMERA = {
  // Elevation above the ground plane. 55° above horizontal = tilted ~35° from top-down.
  elevationDeg: 55,
  baseViewWidth: 9, // tiles visible across at rest
  margin: 0.4, // tiles of padding around a level that fits on screen
  distance: 50, // ortho camera distance; only affects near/far clipping
};

export const RENDER = {
  wallHeight: 0.5, // short walls, so they never block the isometric view
  outlineThickness: 0.035, // inverted-hull outline, in tiles
  maxPixelRatio: 2,
  colors: {
    background: 0x15121c,
    wall: 0x6b5d7a,
    wallTop: 0x8a7b9b,
    floorA: 0x3a3346,
    floorB: 0x342e40,
    exit: 0x4fd18b,
    hero: 0xf2c14e,
    heroStripe: 0xffffff,
    outline: 0x000000,
    ringTrack: 0xffffff,
    ringFill: 0xf2c14e,
    ringCancel: 0xff6b6b,
    preview: 0xffffff,
  },
};

export const AUDIO = {
  masterVolume: 0.6,
  bounceMinSpeed: 0.4, // impacts slower than this are silent
  bouncePoolSize: 4, // simultaneous bounce voices
};
