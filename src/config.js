// Every tunable number lives here. Distances are in tiles, speeds in tiles/s,
// matching the parameter tables in docs/design.md. Values for systems that
// arrive in later milestones are included so the doc and code stay in one place.

export const CONFIG = {
  physics: {
    step: 1 / 120, // fixed timestep, seconds
    maxStepsPerFrame: 12, // cap catch-up after a stall so we never spiral
    friction: 1.3125, // constant deceleration, tiles/s² (the doc's 3.5 halved after playtesting, then cut by a quarter more: what the Athletic card used to give)
    stopThreshold: 0.25, // below this a ball counts as at rest
    wallRestitution: 0.9, // fraction of speed kept after a wall bounce
    bumperRestitution: 0.7, // barrels and chests (M5)
    // Barrels are pinball bumpers for every ball: bouncing off one adds this
    // speed (tiles/s, up to the max launch speed), up to barrelKicksPerBumper
    // times per barrel per ball each move. (What the Elasticity card used to
    // give, barrels only; the card now kicks harder, off more.)
    barrelKick: 1.5,
    barrelKicksPerBumper: 3,
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
    fullPowerDrag: 2.1, // drag distance that reaches max launch speed (about the screen's half-width at rest)
    // Power rises slowly near the ball and faster as you pull further:
    // power = (share of the drag range) ^ powerCurve. A shot's travel grows
    // with the square of its speed, so with a straight line (1) small drags
    // were twitchy; at 1.8 half the drag range gives a short ~2.5-tile shot.
    powerCurve: 1.8,
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
    // Red rings under the enemies moving this round. Off for now: they were
    // easily confused with your own green ring.
    turnRings: false,
    enemyTurnMaxWait: 1.5, // seconds the enemies wait at most for the camera to frame them
    // Enemy types (design doc: "Enemy ideas"). Each changes one thing about
    // the basic enemy; anything a type doesn't set uses the values above.
    types: {
      ice: {
        // The Slider grown up: it glides far on every move, lunges included...
        friction: 0.25, // of normal friction
        patrolRadius: 6, // tiles; its patrols range further too
        color: 0xa9dcf5, // pale ice blue, with a crown of ice crystals
        // ...and leaves an icy puddle on every floor tile it crosses (src/ice.js).
        puddleKick: 1.5, // tiles/s added to a ball rolling onto a puddle (once per puddle per move; never past the max launch speed)
        puddleMoves: 1, // a puddle lasts the move it's laid in and this many more, then melts
      },
      sticky: {
        // Sticky Icky: the Ice ball's opposite. A slowish ball that leaves a
        // trail of goop (src/ice.js, the same puddles with kind 'goop');
        // anything rolling over goop drags as if through glue.
        friction: 1.4, // of normal friction: it doesn't roll far itself
        patrolRadius: 3,
        color: 0x8fbf3a, // sickly green, with drips of goop as its shape cue
        goopDrag: 6, // tiles/s² of extra deceleration while a ball is on goop (normal friction is ~1.3)
        puddleMoves: 1, // goop lasts the move it's laid in and this many more, like ice
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
    itemScale: 2, // coins and potions are drawn this much bigger than their first size: game pieces beside the balls, not props
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
    // When an enemy hits you, you lose this share of your gold (rounded up)...
    hurtGoldShare: 0.1,
    // ...and this share of that (rounded up) is scattered around you to win
    // back; the rest is gone. 100 gold: lose 10, 5 scattered, 5 gone.
    hurtScatterShare: 0.5,
    // At most this many coin pieces fly out per hit; above it, the gold is
    // shared out among them (some coins worth more than 1), so a big purse
    // can't flood the board.
    hurtCoinsMaxPieces: 20,
    // A Gold ball struck bursts one coin per this much impact speed
    // (tiles/s), rounded up, from 1 up to impactCoinsMax.
    impactCoinsPerSpeed: 2,
    impactCoinsMax: 4,
    // Those dropped coins land red and stay red for this long (seconds, from
    // landing), then fade softly to gold over hurtCoinFadeSeconds; they can't
    // be taken until they're gold: you're losing money.
    hurtCoinRedSeconds: 1,
    hurtCoinFadeSeconds: 0.5,
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
    startDealt: 0,
    chestPickDelay: 0.9, // seconds after a chest opens (its coins flying) before its card pick opens
    vampirismHeal: 1, // HP per kill
    bullionaire: 1.5, // gold multiplier (fractions carry over, so it's exact)
    junkHunter: 2, // barrel weight multiplier for swords and shields
    athleticFriction: 0.6, // the hero's friction scale (on top of the lower base friction)
    magnetRadius: 1.5, // tiles from the ball's centre
    magnetPull: 10, // how fast pulled coins close in, 1/s
    elasticityKick: 2.5, // tiles/s added on bouncing off a barrel, chest or enemy (instead of the barrels' own physics.barrelKick)
    elasticityKicksPerBumper: 3, // kicks each bumper gives per shot (so a ball pinned against one still runs down)
  },

  hero: {
    // Death screen: the screen darkens with "You Died!" and the lives left
    // (or "Game Over") and input is blocked for this long, then it lightens
    // and play resumes from the start.
    deathScreenSeconds: 3,
    skullRollMaxSeconds: 8, // the death screen waits for your skull to stop rolling, at most this long
    // Your skull (knocked out): smaller and slippery, so it skitters on.
    skullScale: 0.8, // its size (and collision radius) against your ball's
    skullFriction: 0.6, // a scale on the floor's friction
    // At the knockout the skull is flung on at least this speed (tiles/s), the
    // way it was going, so you watch it careen round the room.
    skullLaunch: 4.5,
    skullLaunchMax: 5.5,
    // It's lumpy: its heading wobbles as it rolls (a random walk in its turn
    // rate, radians/s, kicked each physics step and damped).
    skullJiggleKick: 2,
    skullJiggleDamping: 12, // high: small, quick wobbles
    deathFadeSeconds: 0.4, // darken / lighten time, inside the 3 s
    runCompleteSeconds: 4, // the "Run Complete!" screen after the last level, before a new run
    maxHp: 1, // TESTING: 1 HP, to try the knockout quickly (normally 10)
    atk: 1,
    lives: 3,
  },

  camera: {
    // Knocked out: the camera closes in on your skull as it slows, ending
    // with it filling skullFill of the view's width; faster, it widens by
    // skullSpeedWidth tiles per tile/s.
    skullFill: 0.5,
    skullSpeedWidth: 1,
    skullZoomRate: 2.5,
    deathCamSeconds: 1.1, // your own kill cam at a knockout (real seconds, in slow motion)
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
    // Closeness (design doc: "Camerawork"). On your turn the camera sits
    // tight on your ball, which fills restFill of the view's width (aiming
    // zooms out from there with power). During shots and enemy moves it
    // stays on you and widens to keep every moving ball in view (padding
    // followPadding), zooming out quickly and back in slowly.
    restFill: 0.157, // your ball's share of the view's width at rest (0.2, then 0.188, felt too close)
    restZoomRate: 2.2, // 1/s, easing in to the tight view
    followPadding: 1.6, // screen units around moving balls while the camera stays on you
    followZoomOutRate: 3.5, // 1/s: widen quickly when something heads off screen
    followZoomInRate: 0.9, // 1/s: come back in slowly (a heavy lerp, so it never pumps)
    // Close calls: when your moving ball is about to reach an enemy (or an
    // enemy is rushing you), the camera swings in tight on the pair and time
    // eases to closeSlow, so you're there for the hit or the near miss.
    // Off for now: the tight zoom is kept for the kill cam and your turn.
    closeCalls: false,
    closeGap: 1.6, // tiles between their surfaces at most
    closeTime: 0.45, // seconds to contact at most, at the speed they're closing
    closeMinSpeed: 2, // tiles/s they must be closing at least
    closeHold: 0.35, // real seconds it lingers after the moment passes
    closeWidth: 3.2, // tiles across at the tightest
    closeSlow: 0.55, // time scale during a close call
    closeZoomRate: 5, // 1/s
    // Kill cam: a kill (during a shot or the enemy move) drops time to
    // killSlow and holds tight on it for killSeconds of real time; a combo
    // kill (2+ in one shot) holds comboSeconds.
    killSeconds: 0.7,
    comboSeconds: 1.1,
    killSlow: 0.3,
    killWidth: 2.8,
    timeEaseRate: 9, // 1/s: how quickly time slows and comes back
    // Camera shake when you're hurt: a short, decaying rattle of the view
    // (never of aiming). Off with shake: false or the device's reduce-motion
    // setting (a Settings switch to come).
    shake: true,
    shakeMax: 0.35, // tiles of offset at full strength
    shakeSeconds: 0.35, // a full-strength shake dies away in about this long
    shakeHit: 0.45, // strength of an enemy's hit (more for harder hits, up to 1)
    shakeBlast: 0.85, // strength of a red barrel or bomb blast
    distance: 60, // orthographic, so this only has to clear the scene
  },

  // Where faces look (src/look.js; drawn by faces.js faceLook): a ball's
  // face slides toward the side of the ball it's looking at.
  look: {
    offset: 0.42, // of the ball's radius at a full look (the face stays inside the outline)
    squash: 0.12, // the face narrows this much along the look, as if turning on the ball
    ease: 0.08, // seconds: the face glides to its new spot (time constant)
    moveMin: 0.15, // tiles/s: slower than this isn't "moving"
    moveFull: 2, // tiles/s: from here up it looks fully along its way; slower, the look eases back to centre
    reactSeconds: 1, // a ball that's hit looks at its attacker, and balls near a blast at the blast, this long
    blastRadius: 3, // tiles: balls this close to a red barrel or bomb going off (with no wall between) look at it
    watchRange: 7, // tiles: during the enemy move, your ball watches the nearest moving enemy this close
    heroIdleSeconds: 5, // your ball waits this long with nothing to look at before glancing about
    idleMin: 2, // seconds between an enemy's idle glances (random in between; yours too, after the wait)
    idleMax: 6,
    glanceSeconds: 1, // how long a glance lasts before the face drifts back to centre
  },

  render: {
    // Reaching the exit (game.js reachExit): your ball glides into the middle
    // of the exit tile (momentum damped by exitGlideDamping, pulled in by
    // exitGlidePull, 1/s and 1/s²), is drawn up in a golden glow and swirl of
    // sparkles after exitGlideSeconds over exitBeamSeconds, and the screen
    // fades out and back in over exitFadeSeconds.
    exitGlideSeconds: 0.45,
    exitGlideDamping: 7,
    exitGlidePull: 45,
    exitBeamSeconds: 0.6,
    exitFadeSeconds: 0.3,
    // Ice puddles (iceView): size and corner rounding in tiles, opacity when
    // fresh, the share of it left in the move after, and how fast they ease.
    icePuddleSize: 0.92,
    icePuddleCorner: 0.22,
    iceOpacity: 0.6,
    iceOldShare: 0.5,
    iceFadeRate: 4,
    maxAspect: 9 / 16, // desktop browsers get a portrait column like a phone
    maxPixelRatio: 2,
    // Adaptive resolution: every adaptiveSeconds, if the frame rate was under
    // adaptiveMinFps, the pixel ratio steps down by adaptiveStep (to no less
    // than minPixelRatio), trading sharpness for smoothness on slower phones.
    adaptive: true,
    adaptiveSeconds: 1.5,
    adaptiveMinFps: 50,
    adaptiveStep: 0.25,
    minPixelRatio: 1,
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
    keyCenterScale: 3.9, // its size in the middle, relative to the HUD icon (20px)
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
  // Lighting (src/render/lighting.js): light pools on the flat floor and
  // walls, plus a few real lights for the round objects.
  lighting: {
    ambient: 0.36, // the floor and walls away from any pool (1 = their full colour)
    maxPools: 24, // pools drawn at once: flashes, your torch, then the nearest
    torchColor: 0xffb46a, // warm
    torchPool: 2.8, // added light at your ball's centre
    torchPoolRadius: 3.8, // tiles
    torchLight: 7, // the real point light's intensity, for nearby objects
    torchRadius: 6, // tiles it reaches
    torchHeight: 1.4,
    enemyPool: 2.0, // tinted by the enemy's colour
    enemyPoolRadius: 2.4,
    chestPool: 1.8, // gold, while it's closed
    chestPoolRadius: 2.0,
    chestFadeSeconds: 0.6, // an opened chest's glow dies away over this
    explosivePool: 1.2, // a low red glow
    explosivePoolRadius: 1.8,
    exitColor: 0x5fd08a, // the exit's green glow
    exitPool: 1.6, // at the pulse's peak
    exitPoolRadius: 2.0,
    exitPulseHz: 1, // the glow breathes slowly, once a second
    exitPulseDepth: 0.45, // how far it dims between peaks (share of its strength)
    flashColor: 0xffb04a, // an explosion's flash
    flashPool: 6,
    flashPoolRadius: 6,
    flashLight: 14,
    flashRadius: 7,
    flashSeconds: 0.45,
    ambientLight: 0.85, // the scene's lights, for the round objects
    sunLight: 2.0,
    vignette: 0.55, // darkness at the screen's corners (0 = none)
  },

  // Effects (src/render/effects.js): particles, barrel debris, floor marks.
  effects: {
    maxParticles: 600, // per layer (glowing and soft)
    particleScale: 1.7, // all particle sizes
    maxDebris: 120, // barrel staves in flight or settling
    stavesPerBarrel: 7,
    minHitSpeed: 1.2, // tiles/s: softer contacts make no dust or sparks
    dustColor: 0xb8aa98,
    sparkColor: 0xffe2a0,
    fireColor: 0xff9a2a,
    emberColor: 0xffc860,
    smokeColor: 0x3a3330,
    glintColor: 0xffe27a,
    ringRadius: 2.2, // tiles a blast's shockwave ring grows to
    ringSeconds: 0.45,
    scorchSize: 1.8, // tiles across; scorch marks stay for the level
    hitStopKill: 0.06, // seconds the action freezes on a kill
    hitStopBlast: 0.08, // and on an explosion
  },

  // Procedural textures (src/render/textures.js), drawn at load.
  textures: {
    pxPerTile: 128, // texture resolution
    floorTiles: 4, // the flagstone texture covers this many tiles each way
    grout: 0.5, // grout lines' tone (0.8 = the baked colour)
    groutPx: 3,
    stoneTone: 0.07, // each stone's tone varies this much either side
    bigStones: 0.25, // share of floor stones that span a whole tile (2×2 half-tile cells)
    wallCourses: 2, // rows of near-square blocks up a wall's side
    shadePxPerTile: 12, // corner-shade map resolution
    shadeBlurTiles: 0.35, // how far the floor darkens out from a wall
    shadeDepth: 0.45, // how dark the floor gets right at the wall (0 = off)
  },

  colors: {
    background: 0x2e2b2a, // warm dark
    floorA: 0x55575a,
    floorB: 0x55575a, // same as floorA: the mockup floor has no checker
    wallTop: 0x8a8c91, // darkened from 0xb5b8be with the higher-contrast lighting
    wallFront: 0x6c6e72, // faces pointing down-left on screen
    wallSide: 0x626468, // faces pointing down-right on screen
    wallBack: 0x57595d, // faces pointing away from the camera
    outline: 0x1e1f21,
    exit: 0x5fd08a,
    exitBeam: 0xffd27a, // the golden glow your ball is drawn up into at the exit
    exitSpark: 0xfff1b8, // the sparkles swirling up around it
    enemy: 0xc8005f, // mockup magenta
    enemyFace: 0x111111,
    hpFill: 0xe8336f,
    hpTrack: 0x2a2b2e,
    hero: 0xffffff, // tint over the hero's chrome (silver) shading
    skull: 0xf1ede2, // your ball once knocked out: bone white
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
    ice: 0xbfe9ff, // ice puddles
    goop: 0x7da832, // Sticky Icky's goop
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
