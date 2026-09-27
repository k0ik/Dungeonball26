// Every tunable number lives here. Distances are in tiles, speeds in tiles/s,
// matching the parameter tables in docs/design.md. Values for systems that
// arrive in later milestones are included so the doc and code stay in one place.

export const CONFIG = {
  physics: {
    step: 1 / 120, // fixed timestep, seconds
    maxStepsPerFrame: 12, // cap catch-up after a stall so we never spiral
    friction: 1.75, // constant deceleration, tiles/s² (halved from the doc's 3.5 after playtesting)
    stopThreshold: 0.25, // below this a ball counts as at rest
    wallRestitution: 0.9, // fraction of speed kept after a wall bounce
    bumperRestitution: 0.7, // barrels and chests (M5)
    ballRestitution: 0.9, // equal-mass ball-to-ball
  },

  ball: {
    diameter: 0.65,
  },

  aim: {
    cancelRadius: 0.6, // releasing closer than this to the hero cancels the shot
    fullPowerDrag: 1.6, // drag distance that reaches max launch speed
    maxLaunchSpeed: 9,
    grabRadius: 1.0, // how close to the hero a press must land to start aiming
    // The preview runs the real physics ahead of time, so it ends where the
    // shot would stop. It shows at most this many bounces, then ends at the next contact.
    previewBounces: 1,
    previewMaxTime: 8, // seconds of simulated travel, a safety cap (full power stops in ~5 s)
    // Dash pattern encodes power: soft shots are short, sparse dots; hard
    // shots are long dashes packed close together. Lengths in tiles.
    dashMin: 0.06,
    dashMax: 0.42,
    gapMin: 0.12, // gap at full power
    gapMax: 0.3, // gap at the weakest shot
    dashWidth: 0.09,
    // Cancel marker, shown only while aiming: a thin circle at the cancel
    // radius with a small "x" on the ground just below the ball on screen,
    // inside the circle. Both brighten while the pointer is inside the cancel zone.
    ringWidth: 0.035,
    cancelXHalfLength: 0.11, // each arm reaches this far from the x's centre
    cancelXWidth: 0.035,
    cancelOpacity: 0.25,
    cancelActiveOpacity: 0.7,
    // "Your turn" ring: a dashed green ring at the cancel radius (as in the
    // mockup) shown whenever you can shoot, until you start dragging.
    turnRingDashes: 14,
    turnRingDashFill: 0.6, // fraction of each dash slot that is drawn
    turnRingWidth: 0.05,
    turnRingSpin: 0.5, // radians per second
    turnRingOpacity: 0.9,
    castStep: 0.02, // step size for swept-circle casts
  },

  enemy: {
    lungeSpeed: 6,
    damageToHero: 1, // HP an attacker's hit costs you, whatever its level (playtest change)
    patrolSpeedMin: 1,
    patrolSpeedMax: 3,
    patrolRadius: 3,
    patrolShare: 0.5, // fraction of enemies (picked at random each round) that patrol; the rest sit it out
    sightRange: 6,
    hpPerLevel: 2, // HP = 2 × level
    // Impacts below this don't count. Just above the stop threshold, so any
    // visible contact lands (the doc's 1.5 missed slow roll-ins once friction
    // was halved); the per-enemy cooldown still stops grinding.
    hitMinSpeed: 0.4,
    hitCooldown: 0.15, // seconds, per enemy
    lungeTelegraph: 0.45, // seconds the "!" pulses before a lunge launches
    patrolDelay: 0.2, // seconds before a patrol move
    enemyTurnMaxWait: 1.5, // seconds an enemy waits at most for the camera to reach it
  },

  hero: {
    downPause: 1.0, // seconds after a knockout before you respawn
    maxHp: 10,
    atk: 1,
    lives: 3,
  },

  camera: {
    // Matched to the mockup: the grid is turned so level columns run gently
    // down-right and rows run steeply down-left, seen from ~37° above the ground.
    elevationDeg: 37, // camera angle above the ground plane
    yawDeg: 30, // grid rotation on screen
    baseViewWidth: 9, // world units across the screen at rest
    maxViewWidth: 13, // speed zoom: world units across at max launch speed
    // Aiming: the zoom follows shot power, from the resting width at no power
    // to aimMaxWidth at full power, anchored on the ball (no panning).
    aimMaxWidth: 13,
    aimZoomRate: 6, // how quickly the zoom tracks the drag, 1/s
    // Framing: the camera fits every ball in play (plus the acting enemy)
    // with this much padding, zooming out as far as maxFrameWidth.
    framePadding: 2.2, // screen units around the framed balls
    maxFrameWidth: 22,
    zoomOutRate: 3, // exponential smoothing rates, 1/s
    zoomInRate: 1.5,
    followRate: 3, // pan smoothing, 1/s
    // An enemy waits for the camera to arrive before it moves (at most enemyTurnMaxWait).
    settleDistance: 0.6, // tiles from the framing goal that count as arrived
    settleZoom: 0.12, // fraction of the goal width that counts as arrived
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
    // Enemy HP bars get one notch per HP and grow with max HP, so a tougher
    // enemy has a visibly longer bar. Pixels.
    hpBarPxPerHp: 6,
    hpBarMinPx: 14,
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
    enemy: 0xc8005f, // mockup magenta
    enemyFace: 0x111111,
    hpFill: 0xe8336f,
    hpTrack: 0x2a2b2e,
    hero: 0xd6d7da,
    heroStripe: 0x3a86ff,
    aim: 0xffffff,
    turnRing: 0x5ad16a, // matches the hero's HP bar
    shadow: 0x000000,
  },

  audio: {
    masterVolume: 0.6,
    minWallSoundInterval: 0.04, // seconds; stops stacked contacts from buzzing
    minWallSoundSpeed: 0.4, // impacts softer than this are silent
  },
};
