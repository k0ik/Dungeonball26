// Every tunable number lives here. Distances are in tiles, speeds in tiles/s,
// matching the parameter tables in docs/design.md. Values for systems that
// arrive in later milestones are included so the doc and code stay in one place.

export const CONFIG = {
  physics: {
    step: 1 / 120, // fixed timestep, seconds
    maxStepsPerFrame: 12, // cap catch-up after a stall so we never spiral
    friction: 3.5, // constant deceleration, tiles/s²
    stopThreshold: 0.25, // below this a ball counts as at rest
    wallRestitution: 0.9, // fraction of speed kept after a wall bounce
    bumperRestitution: 0.7, // barrels and chests (M5)
    ballRestitution: 0.9, // equal-mass ball-to-ball
  },

  ball: {
    diameter: 0.65,
  },

  aim: {
    ringInner: 0.6, // cancel zone radius
    ringOuter: 1.6, // full power radius
    maxLaunchSpeed: 9,
    grabRadius: 1.0, // how close to the hero a press must land to start aiming
    previewMaxLength: 40, // first segment is cast at most this far
    previewBounceLength: 3, // length of the reflected segment after the first contact
    previewDotSpacing: 0.35,
    previewDotRadius: 0.06,
    castStep: 0.02, // step size for the preview's swept-circle cast
  },

  enemy: {
    lungeSpeed: 6, // M4
    patrolSpeedMin: 1,
    patrolSpeedMax: 3,
    patrolRadius: 3,
    sightRange: 6,
    hitMinSpeed: 1.5, // M3: impacts below this don't count
    hitCooldown: 0.15, // seconds, per enemy
  },

  hero: {
    maxHp: 10,
    atk: 1,
    def: 0,
    lives: 3,
  },

  camera: {
    tiltDeg: 40, // camera tilt away from straight down; higher shows more wall, less board
    baseViewWidth: 9, // tiles across at rest
    maxViewWidth: 13, // tiles across at max launch speed
    zoomOutRate: 4, // exponential smoothing rates, 1/s
    zoomInRate: 1.5,
    distance: 60, // orthographic, so this only has to clear the scene
  },

  render: {
    maxAspect: 9 / 16, // desktop browsers get a portrait column like a phone
    maxPixelRatio: 2,
    wallHeight: 0.6, // short walls, per the mockup
    outlineScale: 1.08, // inverted-hull outline thickness for balls
  },

  colors: {
    background: 0x16121d,
    floorA: 0x6b6478,
    floorB: 0x625b6f,
    wallTop: 0x9a8fb0,
    wallSide: 0x4a4258,
    outline: 0x000000,
    exit: 0x5fd08a,
    hero: 0xf4efe3,
    heroStripe: 0x3a86ff,
    aim: 0xffffff,
    ringTrack: 0xffffff,
    ringFill: 0xffd166,
    shadow: 0x000000,
  },

  audio: {
    masterVolume: 0.6,
    minWallSoundInterval: 0.04, // seconds; stops stacked contacts from buzzing
    minWallSoundSpeed: 0.4, // impacts softer than this are silent
  },
};
