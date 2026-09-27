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
    // Matched to the mockup: the grid is turned so level columns run gently
    // down-right and rows run steeply down-left, seen from ~37° above the ground.
    elevationDeg: 37, // camera angle above the ground plane
    yawDeg: 30, // grid rotation on screen
    baseViewWidth: 9, // world units across the screen at rest
    maxViewWidth: 13, // world units across at max launch speed
    zoomOutRate: 4, // exponential smoothing rates, 1/s
    zoomInRate: 1.5,
    // Fraction of the view the hero can roam before the camera pans. 0 keeps
    // the hero centred (eased by followRate); the design doc's original
    // deadzone was 0.6 x 0.5.
    deadzoneWidth: 0,
    deadzoneHeight: 0,
    followRate: 4, // pan smoothing, 1/s
    distance: 60, // orthographic, so this only has to clear the scene
  },

  render: {
    maxAspect: 9 / 16, // desktop browsers get a portrait column like a phone
    maxPixelRatio: 2,
    // The mockup's walls stand a bit taller than the ball; kept lower here so a
    // ball just behind a wall stays visible. Raise toward 0.8 for the mockup look.
    wallHeight: 0.55,
    wallOutlines: false, // the mockup's walls read by shading alone
    outlineScale: 1.08, // inverted-hull outline thickness for balls
  },

  // Flat greys from the mockup.
  colors: {
    background: 0x3b3c3f,
    floorA: 0x55575a,
    floorB: 0x55575a, // same as floorA: the mockup floor has no checker
    wallTop: 0xb5b8be,
    wallFront: 0x85878c, // faces pointing down-left on screen
    wallSide: 0x7a7c81, // faces pointing down-right on screen
    wallBack: 0x6e7075, // faces pointing away from the camera
    outline: 0x1e1f21,
    exit: 0x5fd08a,
    hero: 0xd6d7da,
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
