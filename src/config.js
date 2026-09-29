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
    patrolShare: 0.5, // fraction of enemies (picked at random each round) that patrol; the rest stay put unless they can see you
    sightRange: 6,
    hpPerLevel: 2, // HP = 2 × level
    // Impacts below this don't count. Just above the stop threshold, so any
    // visible contact lands (the doc's 1.5 missed slow roll-ins once friction
    // was halved); the per-enemy cooldown still stops grinding.
    hitMinSpeed: 0.4,
    hitCooldown: 0.15, // seconds, per enemy
    lungeTelegraph: 0.45, // seconds the "!" pulses before a lunge launches
    patrolDelay: 0.2, // seconds before a patrol move
    // The enemies' red turn rings stay on screen at least this long, counted
    // once the camera has framed them all, before they move together.
    turnRingBeat: 0.6,
    enemyTurnMaxWait: 1.5, // seconds the enemies wait at most for the camera to frame them
  },

  // Barrels, chests and red barrels (design doc: "Objects").
  objects: {
    barrelRadius: 0.34,
    barrelHits: 2, // the second hit breaks it; its loot then waits on the floor
    barrelCooldown: 0.15, // seconds between cracks, per barrel
    chestHalfX: 0.36, // chest footprint, half-size along x and z
    chestHalfZ: 0.28,
    chestGoldMin: 8,
    chestGoldMax: 24,
    explosiveDamage: 1, // flat, ignores ATK; a held shield absorbs it instead
    itemRadius: 0.25, // floor pickups (coins, barrel loot, keys)
    // A door opens when the hero comes within this distance (tiles, ball
    // centre to the door tile's edge) holding the matching key.
    doorReach: 0.5,
    doorOpenSeconds: 0.35, // the door sinks into the floor this fast
    // While you aim, chests this close to the ball turn see-through so an
    // open lid never hides it.
    chestFadeRadius: 2.2,
    chestFadeOpacity: 0.3,
  },

  // Barrel loot (design doc: "Objects"). Weights are relative.
  loot: {
    table: [
      { kind: 'gold', weight: 45 },
      { kind: 'potion', weight: 25 },
      { kind: 'superPotion', weight: 8 },
      { kind: 'shield', weight: 12 },
      { kind: 'sword', weight: 5 },
      { kind: 'oneUp', weight: 5 },
    ],
    goldMin: 1,
    goldMax: 5,
    potionHeal: 1,
    superPotionHeal: 5,
    swordAtk: 3, // added to ATK while you hold a sword
    swordUses: 2, // hits on enemies before it breaks: whole -> broken half -> gone
    killGoldPerLevel: 1, // a kill drops coins worth the enemy's level
    // Besides its coins, a kill has these separate, rare chances of dropping
    // gear or a potion (rolled independently, so more than one can drop).
    enemyDrops: { sword: 0.05, shield: 0.08, potion: 0.12, superPotionShare: 0.25 },
    // Coin strips: single coins placed in a level ('*'), 1 gold each.
    // Collecting a whole strip in one of your shots is a "Clean Sweep".
    stripCoinValue: 1,
    sweepBonus: 5,
    sweepMinCoins: 3, // shorter strips pay no sweep bonus
    // Kills and barrel gold scatter that many single coins (the same coins as
    // strips) around the spot: each flies out to a random clear spot at a
    // random distance, arc height and speed, bounces once, then can be taken.
    scatterMin: 0.5, // tiles from the spot
    scatterMax: 1.7,
    scatterHeightMin: 0.5, // arc height, tiles
    scatterHeightMax: 1.0,
    scatterTimeMin: 0.4, // seconds in the air, bounce included
    scatterTimeMax: 0.85,
    scatterBounceAt: 0.75, // fraction of the flight spent on the first arc; the rest is the bounce
    scatterBounceHeight: 0.25, // bounce height as a fraction of the arc
    // Chest gold, shown as a fountain of the same coins (one per gold) that
    // pop out of the chest in turn, arc high, flash white and vanish.
    chestCoinSpreadMin: 0.2, // tiles from the chest
    chestCoinSpreadMax: 1.1,
    chestCoinHeightMin: 1.0, // arc height above the rim, tiles
    chestCoinHeightMax: 1.8,
    chestCoinTimeMin: 0.55, // seconds from popping out to vanishing
    chestCoinTimeMax: 0.85,
    chestCoinStagger: 0.035, // seconds between one coin and the next
    chestCoinFlash: 0.3, // fraction of the flight, at the end, spent flashing
    coinSpin: 1.6, // radians per second; every coin on the floor shares one angle
    collectHopHeight: 0.8, // a taken coin hops this high (tiles), flashes and vanishes
    collectHopTime: 0.4,
  },

  hero: {
    // Death screen: the screen darkens with "You Died!" and the lives left
    // (or "Game Over") and input is blocked for this long, then it lightens
    // and play resumes from the start.
    deathScreenSeconds: 3,
    deathFadeSeconds: 0.4, // darken / lighten time, inside the 3 s
    runCompleteSeconds: 4, // the "Run Complete!" screen after the last level, before a new run
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
    // Enemy phase: the camera stays on you, pulled out just enough to show the
    // enemies about to move (where they stand), up to this width; then it
    // eases back to the resting width for your shot.
    enemyPhaseWidth: 13,
    // The enemies wait for the camera to arrive before they move (at most enemyTurnMaxWait).
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
    hitFlashSeconds: 0.28, // the hero glows red this long when an enemy hits it
    // The hero's face: confident at rest, determined while aiming and during
    // its shot, and an "ouch" face for this long after taking a hit.
    heroOuchSeconds: 0.8,
    dangerHp: 1, // at this HP or less, a soft red glow pulses around the screen edge
    // Labels about you (gold, health, gear...) ride along above the ball.
    // false: they stay at the spot where they were earned, like enemy labels.
    heroLabelsFollowBall: true,
    bonusReminderAfter: 1.5, // s after "Combo Kill!" before a separate "Bonus turn!" banner is worth showing
    hpBarMinPx: 14,
    itemXrayOpacity: 0.6, // floor pickups hidden behind a wall show through it as a silhouette this opaque
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
    hero: 0xffffff, // tint over the hero's chrome (silver) shading
    aim: 0xffffff,
    turnRing: 0x5ad16a, // matches the hero's HP bar
    enemyTurnRing: 0xff2a2a, // the enemy that's about to move
    hitFlash: 0xff2a2a,
    // Objects and pickups, after the mockup.
    barrel: 0xa87c40,
    barrelTop: 0xfcc062,
    explosive: 0xd01818,
    explosiveTop: 0xf06a6a,
    chest: 0xd79a3c,
    chestBand: 0xffd84a,
    explosion: 0xff9a2a,
    coin: 0xffc24a,
    potion: 0xe8336f,
    superPotion: 0x9b5cff,
    shieldItem: 0x3a86ff,
    oneUpItem: 0xc9cdd4, // a little silver hero ball
    // Keys and their doors.
    keys: { red: 0xe8413c, blue: 0x3a86ff, yellow: 0xffd23f },
    sword: 0xd4d7dc,
    shadow: 0x000000,
  },

  audio: {
    masterVolume: 0.6,
    minWallSoundInterval: 0.04, // seconds; stops stacked contacts from buzzing
    minWallSoundSpeed: 0.4, // impacts softer than this are silent
  },
};
