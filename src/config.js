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
    // Failsafe against a ball caught bouncing forever (say, pinned between a
    // bumper and a wall): after this long in continuous motion, every ball
    // loses speed at this rate (per second, exponential) until all rest.
    stallSeconds: 10,
    stallDamping: 1.5,
  },

  ball: {
    diameter: 0.65,
  },

  // Rounded walls: a level sets its curviness, 1 to 5, with a digit in the
  // top-left corner of its grid (docs/design.md, Levels).
  walls: {
    defaultCurve: 5, // for levels without a digit there
    maxRound: 3, // biggest corner radius, tiles, also limited to half the straight run either side; curviness 5 gets all of that, 3 half, 1 none
    chordsPerTile: 12, // drawing: chords per tile of curve radius on each quarter circle
    minChords: 4, // ...but at least this many per quarter circle
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
    maxHp: 8, // no enemy has more
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
    // Enemy types (design doc: "Enemy ideas"). Each changes one thing about
    // the basic enemy; anything a type doesn't set uses the values above.
    types: {
      slider: {
        friction: 0.25, // of normal friction: it glides far on every move, lunges included
        patrolRadius: 6, // tiles; its patrols range further too
        color: 0xa9dcf5, // pale blue
      },
      rubber: {
        rebound: 2, // your ball comes off it at this times its rebound speed...
        maxRebound: 13.5, // ...up to this (tiles/s; 1.5× the max launch speed)
        color: 0xff8fc8, // pink
      },
      brute: {
        radius: 0.45, // tiles (a basic ball is 0.325): still fits a one-tile gap
        mass: 3, // a basic ball is 1: it knocks you further than you knock it
        hpScale: 2, // twice a basic enemy's HP at its level
        lungeSpeed: 8, // tiles/s (basic 6)
        damageToHero: 2, // HP its hit costs you (basic 1)
        color: 0x8b5a2b, // brown
      },
      golem: {
        // Its stages, whole golem first: 1 golem of 4 HP, then 2 of 2 HP,
        // then 4 of 1 HP. The whole golem splits into two of the next stage
        // the moment it's hit; a middle-stage golem takes damage and splits
        // when it would die; a last-stage golem just dies.
        stageHp: [4, 2, 1],
        stageRadius: [0.45, 0.34, 0.26], // tiles
        spread: 0.45, // radians each piece veers off the struck golem's path
        color: 0x7a5a9c, // dark lilac
      },
      bomb: {
        // Hits don't hurt it: the first one lights its fuse and turns it red.
        // It goes off where it lies when your next shot comes to rest (one
        // lit during a shot waits for the end of the shot after).
        fuse: 1, // fuse steps when lit: armed (0) when your next shot starts
        blastRadius: 1.6, // tiles, centre to centre; walls shield
        blastDamage: 1, // to every ball caught (a held shield takes it instead)
        blastPush: 5, // tiles/s outward at the centre, falling off to 0 at the edge
        color: 0x5a5d68, // slate grey (light enough for its face to read), with a fuse on top
        litColor: 0xd8342c, // its colour once lit
      },
      jekyll: {
        // Passive until hurt; then enraged: on the next enemy move it lunges
        // at the nearest ball it can see (you or another enemy) and its hit
        // costs that ball 1 HP. Then it calms down until hurt again.
        color: 0x8fc49a, // calm: sage green
        enragedColor: 0x6b1f4f, // enraged: dark plum...
        enragedScale: 1.12, // ...and visibly swollen (a shape cue as well as colour)
      },
      gold: {
        // A tool ball, not an enemy: no face, no will, never hurt. While it
        // rolls it drops a coin every `coinEvery` tiles; it shatters at the
        // end of the 3rd move (your shot or the enemy move) in which it rolled.
        coinEvery: 1, // tiles rolled per coin dropped
        shots: 3,
        radiusByShotsLeft: [0.24, 0.32, 0.42], // tiles: small, medium, large (1, 2, 3 shots left)
        color: 0xf2c230, // gold
      },
      seeker: {
        // Knows roughly where you are even without sight: every enemy move it
        // patrols (never sits out), trying `tries` patrol moves and taking the
        // one that ends closest to you by walking distance on the tile grid.
        // When it can see you, it lunges like any enemy.
        tries: 8,
        color: 0x1e8fff, // bright blue, with an antenna on top
      },
      ghost: {
        // Every other round it fades: while faded, balls pass through it and
        // it can't hurt or be hurt, though it doesn't know it and acts as
        // usual (watching, lunging). It starts solid and switches each time
        // your turn comes round.
        color: 0xdcdcf0, // pale lavender white
        fadedOpacity: 0.3, // how see-through it is while faded (its ring and bar still show)
      },
    },
    // Testing aid: every enemy on these levels (ids from src/main.js) is this
    // type, so one type at a time can be tried out. 'random' gives each one a
    // random type from `types` (tool balls included); null leaves them all basic.
    testType: 'random',
    testLevels: ['enemytester01'],
    // Testing aid for tool balls: on the test levels, every other enemy
    // becomes this tool ball instead (so there are still enemies to roll it).
    // null to leave them all testType.
    testTool: null,
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
    // A door is a slab this thick (tiles) across the middle of its tile, in
    // line with the walls either side, so it sits in an indent in the wall.
    doorThickness: 0.3,
    // While you aim, chests this close to the ball turn see-through so an
    // open lid never hides it.
    chestFadeRadius: 2.2,
    chestFadeOpacity: 0.3,
  },

  // Barrel loot (design doc: "Objects"). Weights are relative.
  loot: {
    table: [
      { kind: 'empty', weight: 40 }, // nothing inside
      { kind: 'gold', weight: 30 },
      { kind: 'potion', weight: 12 },
      { kind: 'superPotion', weight: 4 },
      { kind: 'shield', weight: 7 },
      { kind: 'sword', weight: 4 },
      { kind: 'oneUp', weight: 3 },
    ],
    goldMin: 1,
    goldMax: 5,
    potionHeal: 1,
    superPotionHeal: 5,
    swordAtk: 3, // added to ATK while you hold a sword (it lasts one round: your next shot)
    killGoldPerLevel: 1, // a kill drops coins worth the enemy's level
    // When an enemy hits you, you drop gold: one coin per this much impact
    // speed (tiles/s), rounded up, from 1 up to hurtCoinsMax, scattered around you.
    hurtCoinsPerSpeed: 2,
    hurtCoinsMax: 4,
    // Those dropped coins land red and stay red for this long (seconds, from
    // landing), and can't be taken until they turn gold: you're losing money.
    hurtCoinRedSeconds: 1,
    // Besides its coins, a kill has these separate, rare chances of dropping
    // gear or a potion (rolled independently, so more than one can drop).
    enemyDrops: { sword: 0.05, shield: 0.08, potion: 0.12, superPotionShare: 0.25 },
    // Coin strips: single coins placed in a level ('*'), 1 gold each.
    stripCoinValue: 1,
    // Coin streaks: any coins taken within one of your shots (placed or
    // dropped) count up, and these counts pay a bonus as you reach them.
    coinStreaks: [
      { count: 5, bonus: 5, name: 'Clean Sweep!' },
      { count: 10, bonus: 10, name: 'Super Sweep!' },
      { count: 20, bonus: 25, name: 'Mega Sweep!' },
    ],
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
    itemSpin: 1.6, // other pickups: every one of a kind shares one angle and bob
    collectHopHeight: 0.8, // a taken coin hops this high (tiles), flashes and vanishes
    collectHopTime: 0.4,
  },

  // Trait cards (M7).
  cards: {
    slots: 3, // cards you can hold
    offer: 3, // cards offered after each level
    // Testing aid: every new game starts with this many random cards already
    // dealt (0 for the normal game, which starts with none).
    startDealt: 3,
    vampirismHeal: 1, // HP per kill
    bullionaire: 1.5, // gold multiplier (fractions carry over, so it's exact)
    junkHunter: 2, // barrel weight multiplier for swords and shields
    athleticFriction: 0.75, // the hero's friction scale
    magnetRadius: 1.5, // tiles from the ball's centre
    magnetPull: 10, // how fast pulled coins close in, 1/s
    elasticityKick: 1.5, // tiles/s added on bouncing off a barrel, chest or enemy
    elasticityKicksPerBumper: 3, // kicks each bumper gives per shot (so a ball pinned against one still runs down)
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
    panStartPx: 8, // a drag off the ball must move this far (screen px) before it pans the map
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
    // Back to your turn: the camera returns to you this many times faster than
    // it normally follows, until it has arrived (at most returnBoostSeconds).
    returnBoost: 3,
    returnBoostSeconds: 1.2,
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
    // A key you pick up flies to the middle of the screen, spinning and
    // growing, holds there a moment, then flies into its HUD slot.
    keyToCenterSeconds: 0.45,
    keyHoldSeconds: 0.45,
    keyToSlotSeconds: 0.5,
    keyCenterScale: 3, // its size in the middle, relative to the HUD icon
    keySpinTurns: 1.6, // turns per second while it spins
    itemXrayOpacity: 0.6, // floor pickups hidden behind a wall show through it as a silhouette this opaque
    // While you aim (dragged past the cancel ring), walls and doors between
    // the camera and your ball or aim path fade to this opacity, over these
    // distances (tiles, on the ground behind the wall) around the ball and the path.
    seeThroughOpacity: 0.25,
    seeThroughSeconds: 0.15, // time to fade in or back out
    seeThroughBallRadius: 1.0,
    seeThroughPathRadius: 0.45,
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
    hurtCoin: 0xd8242c, // a coin knocked out of you, while it can't be taken yet
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
