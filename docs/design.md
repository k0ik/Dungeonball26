# Dungeonball — MVP Design Doc

Sep 18, 2026 · @Kirk

## Overview

Dungeonball is a portrait phone game where you are a pool ball fighting through dungeon rooms to the exit. It's a roguelike with a light deck-building layer: at the end of each level you pick a trait card, and the cards you hold change how the whole run plays.

You pull back, release, and the ball ricochets off walls, barrels and enemies. Enemies that can see you lunge back, so where you stop matters as much as what you hit.

Design pillars:

- **Billiards feel first.** High-bounce ricochets, knockbacks and combos carry the fun, and stats stay simple.
- **Every stop is a decision.** Ending a shot in an enemy's sightline costs HP.
- **Risk against greed.** Gold is the score. Barrels and chests pay, but lingering near enemies is dangerous.
- **No surprises.** Aim preview, "!" alerts and visible HP bars make every loss legible.
- **Every run is a build.** The trait cards you choose between levels bend the rules in your favour, so two runs play differently.

Target: a true orthographic 3D view at a fixed isometric angle, rendered with Three.js and tested in a desktop browser first. The simulation underneath stays a 2D grid; only the rendering is 3D.

## Core loop and turn structure

A round is one shot by you, then one enemy move in which every enemy acts at the same time: those that can see you lunge, a random half of the rest patrol, and the others stay put. (This simultaneous phase is an experiment; before it, enemies took turns one at a time, nearest first, with the camera visiting each.)

```mermaid
flowchart TD
  A[Player aims and shoots] --> B[Balls roll until all at rest]
  B --> C[Every enemy decides at once: lunge if it sees the hero, else maybe patrol, else stay put]
  C --> D[Short telegraph: red rings, "!" over lungers]
  D --> E[All the moving enemies launch together]
  E --> G[Balls roll until all at rest]
  G --> H{Hero HP is 0?}
  H -- no --> A
  H -- yes --> I[Lose a life, respawn at start]
  I --> A
```

The loop repeats until the hero touches the exit, which ends the level at once, even mid-roll.

- **All at once:** every enemy decides from the board exactly as your shot left it (sight is checked once, for all of them), then all the moving ones launch together after a short telegraph. Their moves can collide with each other on the way, like any pool balls.
- **Once per round:** each enemy acts at most once per round: a lunge, a patrol, or nothing.
- **Pace:** a whole enemy phase takes about as long as one move (around 3 to 4 seconds in Long Hall), however many enemies there are. (An earlier trial let only the enemies on screen when your shot stopped take part; the simultaneous phase replaces it.)
- **At rest:** the next launch, lunge or patrol move waits until every ball is below the stop threshold, so positions are always stable before the next move. Nothing moves outside a shot or a turn.
- **Patrol:** each round, a random half of the enemies (rounded up) are picked to patrol; the rest sit the round out unless they can see the hero, in which case they still lunge. A picked enemy that does not currently see the hero picks a random open floor tile within about 3 tiles (one it can roll to in a straight line, with no ball on it) and rolls toward it at the modest speed (1 to 3 tiles/s) that friction brings to rest there. It behaves like any pool ball on the way, so it can still bounce off walls, barrels and other enemies. Two patrols never pick the same tile. If no open tile is available, it stays put this round. The camera stays on you, so moves far away happen off screen (see the camera section).
- **Exit:** enemies never follow you out. Killing everything is not required.
- **Enemy lunge:** an enemy that currently sees the hero launches in a straight line at it at a fixed speed instead of patrolling. Its "!" pulses for about half a second first, with a growl, so the attack never comes out of nowhere. Like any pool ball, it stays wherever it stops, which becomes its new position. Its hit only counts at an impact of at least 0.4 tiles/s, and it can hurt the hero at most once per round. Several lunges can land in the same round, one HP each.

## Ball physics and input

Physics is a small custom circle solver on a fixed timestep, because the pool feel is the whole game. Matter.js is the fallback if the solver proves too much work.

Every value below is a starting point to tune by feel. Distances are in tiles.

| Parameter | Start value | Why |
| --- | --- | --- |
| Ball diameter | 0.65 tile | Leaves room to thread one-tile gaps |
| Cancel radius | 0.6 tile | Releasing closer than this cancels; wide enough to read as its own space |
| Full-power drag | 1.6 tiles | Drag distance that reaches max launch speed |
| Max launch speed | 9 tiles/s | Reached at full drag |
| Friction | 1.75 tiles/s² constant | About 5 s and 23 tiles to stop from full power (halved from 3.5 after playtesting) |
| Stop threshold | 0.25 tiles/s | Below this a ball counts as at rest |
| Wall bounce | keeps 90% of speed | High bounce, as requested |
| Barrel and chest bounce | keeps 70% of speed | Loses some speed on impact |
| Ball-to-ball collision | equal mass, keeps 90% | Pool-style momentum transfer |
| Enemy lunge speed | 6 tiles/s | Fixed for every enemy in the MVP |
| Physics step | 1/120 s, fixed | Fastest ball moves 0.075 tile per step, so nothing tunnels |

Aim is a slingshot pull-back: press on the hero, drag away from the target, release to launch the opposite way. Mouse and touch share one pointer path, raycast onto the ground plane so a drag means the same thing from any camera angle, and the pull-back keeps the finger off the line of fire. There's no cue stick sprite and no filling power ring; the dashed path preview below carries the aiming information, with a faint cancel marker around the hero.

- **Power:** drag distance past the cancel radius sets launch speed, reaching full power at about 1.6 tiles; it doesn't depend on the drag's angle.
- **Your turn:** whenever you can shoot, a dashed green ring (as in your mockup) turns slowly around the hero at the cancel radius. It gives way to the cancel marker as soon as you start dragging, and is hidden while anything is moving or the enemies are acting.
- **Cancel marker:** while you drag, a thin, low-opacity circle at the cancel radius and a small "x" just below the hero on screen (inside the circle) mark the cancel zone. Both brighten while your finger is inside it, and disappear when you release.
- **Cancel zone:** within about 0.6 tile of the hero the preview disappears, which reads as "release here to cancel." Releasing inside it cancels the shot; releasing past it fires.
- **Preview:** a dashed line on the ground that runs the shot through the real physics ahead of time, so its length is exactly how far the ball will travel at the current power, including friction and bounce losses. It shows the first bounce, then ends where the ball stops or at its next contact. A small hoop marks each bounce and the end of the path, so the ball's next position is always marked, whether it comes to rest in the open or against something. The dash pattern also encodes power: a soft shot draws short, sparse dots, and a hard one draws long dashes packed close together.
- **Preview accuracy:** the preview must match the real shot exactly. It runs the same combat and object rules on copies of the enemies (with their HP) and of the barrels and chests (with their cracks), so a killing blow's ricochet, a barrel breaking on its second crack and a red barrel going off all show in the path. Releasing fires exactly the shot the preview last showed, rather than re-reading the release point, so a finger's lift-off jitter can't nudge the angle. A test fires many shots through the real simulation and checks each against its preview.
- **Locked:** while any ball is moving or during the enemy phase.

- **Stall failsafe:** if balls have been moving for more than 10 seconds straight (`physics.stallSeconds`), every ball loses speed steadily (`physics.stallDamping`) until everything rests, so a turn can never hang on something caught bouncing in a tight spot.

## Combat rules and formulas

Who takes damage depends on whose phase it is, never on ball speed. Speed only decides how far things travel.

| Contact | Your shot | Enemy phase |
| --- | --- | --- |
| Hero hits enemy | Enemy loses ATK HP on each fresh contact; a killing blow ricochets you off it as if it were solid | No damage |
| Knocked enemy hits enemy | Both lose 1 HP, once per pair per shot | No damage |
| Enemy hits hero | No damage to hero | Hero loses HP, only from enemies moving this round (lunging or patrolling), at most once each |
| Anything hits a wall | No damage | No damage |
| Hero hits barrel or chest | Counts | Counts (recoil hits too) |
| Enemy hits barrel (e.g. one you knocked into it) | Cracks it | Cracks it |
| Hero or enemy hits red barrel | That ball takes 1 flat damage | That ball takes 1 flat damage |

**Killing blows ricochet.** Equal balls hitting head-on swap speeds, so without this a kill would hand all your speed to an enemy that then vanishes, and you'd stop dead. Instead, the contact that kills a ball is redone as if that ball were solid: the survivor bounces off it with the speed it came in with (keeping 90%, like any ball bounce), then the dead ball is removed. The same goes for a knocked enemy whose combo hit kills another enemy.

Damage and health formulas, with L as the enemy's level:

```latex
D_{\text{enemy}} = \text{ATK} \qquad D_{\text{hero}} = 1 \qquad \text{HP}_{\text{enemy}} = 2L
```

| Stat | Start value | Notes |
| --- | --- | --- |
| Hero max HP | 10 | A health potion heals 1 and a super health potion 5, capped at max |
| Hero ATK | 1 | A sword adds 3 (ATK 4) to every hit of the first shot in which you hit an enemy |
| Shield | None held | A held shield cancels the next enemy hit or red-barrel blast on you and is used up by it (replaces DEF, now that every hit costs 1 HP) |
| Enemy level L | 1 to 3 in the MVP | Read from the enemy's HP bar: one notch per HP, and the bar grows longer for tougher enemies |
| Kill reward | L gold | Drops as coins where it died |

Combo example: with ATK 1, you hit enemy A and it slides into enemy B. A takes 2 damage in total and B takes 1. A level-1 enemy has 2 HP, so A dies and B is left at 1 HP if it is also level 1.

Combos are called out so you can see them land. Within a single shot, the first enemy you damage shows the usual "-1"; every further enemy damaged in that shot (the second, third and so on) also shows "Combo!" above it. If two or more enemies die in one shot, "Combo Kill!" appears in the centre of the screen, and it earns a **bonus turn**: the enemy phase is skipped and you shoot again straight away. When an enemy hits you, your ball flashes red for about a quarter of a second.

Pinning works too. Trap an enemy between you and a wall and your rebound can hit it again within the same shot. A hit counts only at an impact speed of at least 0.4 tiles/s (just above the stop threshold, so any visible contact lands; it was 1.5 until halving friction made slow roll-ins common), with a 0.15 s cooldown per enemy, so a ball resting against another cannot grind it down.

Every enemy that currently sees the hero shows a "!" above it, updated live even mid-shot, so you can steer toward a safe stopping spot. Sight range is 6 tiles. Walls, barrels, closed doors and other enemies block sight, and sight is a hero-width sweep so a lunge can really reach you. Watchers off screen get an edge marker. An enemy's face shows its awareness too: while it can't see you it wears a calm, slightly dumb face; the moment it can, its face turns angry (slanted eyes, hard brows, a snarl) alongside the "!", and it calms down again when it loses sight of you. An enemy that has hit you (or your shield) during the enemy move is spent for the rest of it: it calms down and shows no "!" even if it can still see you, until every ball has come to rest, so the moving balls that can still hurt you this round stand out.

## Lives, death and progression

You have 3 lives. Reaching 0 HP costs one life and puts you back at the level start with full HP, while the board stays exactly as you left it.

- **Death screen:** at 0 HP, input is blocked and the screen darkens for 3 seconds with "You Died!" and, on a second line, the lives left ("2 lives remain", "1 life remains") or "Game Over". Anything still rolling stops under it, you're put back at the start (or the level restarts on a game over), and the screen lightens again with your move. Lives aren't shown in the HUD otherwise.

- **Board state persists:** dead enemies stay dead, damaged enemies stay damaged, broken barrels stay broken, opened chests and doors stay open, and keys you hold stay with you.
- **Respawn is safe:** enemies only act after your shot, so you always get the first move after respawning.
- **Extra lives** come only from a rare barrel drop (a 1-up).
- **Game over** at 0 lives restarts the current level from scratch with 3 lives, and the HP and gear you entered it with.
- **Between levels:** reaching the exit loads the next level at once (even mid-roll), with a short banner naming it ("One Key, Level 3 of 3"). HP, gear bonuses, lives and score carry over. Unused keys do not.
- **Run complete:** the exit of the last level darkens the screen with "Run Complete!" and your gold for 4 seconds, then a fresh run starts at level 1 (full HP, no gear, 3 lives, no gold).

Gold is the score, and it is where the risk against greed tension lives. Kills score and reduce future danger. Barrels and chests score too, but they keep you out in the open among enemies that are still alive.

Shots taken are tracked and shown on the level-complete screen but do not affect the score in the MVP.

## Trait cards

Trait cards are the roguelike layer. Each is an always-on ability that lasts for the rest of the run. (Built in M7 with the nine starting cards below.)

- **Slots:** you hold up to 3 cards.
- **The pick:** at the end of each level you're offered 3 cards and choose 1. If your 3 slots are full, you then pick one of your cards to replace. You can skip at any point, from the offer or the replace step, and keep what you have.
- **Always on:** cards have no activation and no cooldown; their effect simply applies while you hold them. The cards you hold sit as a small row of chips (icon and name) along the bottom of the screen. Tapping a chip pauses the game (everything holds still, mid-shot or mid-enemy-turn) and shows that card large, with its full effect; a tap anywhere closes it and play resumes.
- **The pick screen:** reaching an exit (except the last level's) darkens the board and shows the 3 offered cards, each with its icon, name and effect. Tap one to take it. With 3 cards already held, a second step shows your cards ("Take Bullionaire: tap the card to give up for it"), with "Keep my cards" to back out. "Skip" is always there. The next level loads once you've chosen.
- **Carry-over:** cards carry between levels; a game over restores the cards you entered the level with; a new run starts with none.
- **Testing aid:** while cards are being tuned, every new game starts with 3 random cards already dealt (`cards.startDealt`; set it to 0 for the real game). A dealt Doppleganger gives its extra life.

Starting cards (numbers are defaults to tune):

| Card | Effect |
| --- | --- |
| Vampirism | Each kill heals you 1 HP, capped at max |
| Doppleganger | +1 life, and +1 to the lives you're restored to on a game over |
| Junk Hunter | Swords and shields turn up twice as often in barrels |
| Bullionaire | All gold you collect is worth 1.5× (rounded up) |
| Barrel of Fun | Barrels break in one hit |
| Locksmith | Doors open without keys |
| Athletic | Your ball rolls faster and farther: 25% less friction on it (enemies unaffected; the aim preview includes it) |
| Money Magnet | Gold on the floor (enemy coins, barrel gold and strip coins) is collected from farther away: within 1.5 tiles of your ball's centre instead of just on contact (about 0.6 tiles), drawn in to you as you roll past. Other loot still needs contact |
| Elasticity | Barrels, chests and enemies act like pinball bumpers for you: when your ball bounces off one, it's kicked away with +1.5 tiles/s of extra speed along the bounce (never above the 9 tiles/s max launch speed). Each bumper kicks once per shot, so a ball caught rattling between a chest and a wall (worst with Athletic) runs down instead of bouncing forever. Walls bounce as normal. The aim preview includes the kick |

Defaults assumed until you say otherwise: an offer never includes a card you already hold, and a card you replace goes back into the pool. Cards carry over between levels like HP and gold, and a game over restores the cards you entered the level with.

**Card ideas** (candidates for the pool, not yet in the starting set; numbers to tune):

| Card | Effect | Notes |
| --- | --- | --- |
| Wizard | When you hit an enemy, lightning zaps other enemies within about 2 tiles: each takes 1 damage and is pushed away as if hit | Zapped enemies count as combos |
| Medic | Potions turn up more often in barrels and kill drops | Alt: start each level at full HP |
| Warrior | Swords turn up more often | Alt: start each level holding a sword |
| Paladin | Shields turn up more often | Alt: start each level holding a shield |
| Poisoner | Each enemy you hit directly (not by combo) is poisoned: it turns green and loses 1 HP at the start of each round, stopping at 1 HP | Poison never kills, so the last hit is still yours |
| Ninja | Enemies see a shorter distance (sight range down), so sneaking is easier | |
| Rogue | After you hit an enemy, a dagger flies at the nearest other enemy you can see, for 1 damage | Once per shot, or once per hit? Open |
| Chainsmoker | Any kill earns a bonus turn, not just a combo kill | Toggle; doesn't stack |
| Clairvoyance | The aim preview shows twice as far (two bounces instead of one) | For this to matter, the normal preview gets shorter when cards arrive (M7), so the default only hints at the path |
| Fleet Feet | 10% less friction on your ball | Overlaps Athletic (25%); could be its smaller, stackable version |
| Bomb Squad | Explosions (red barrels, bomb enemies) don't hurt you | Toggle; doesn't stack |

Medic, Warrior and Paladin overlap Junk Hunter (swords and shields twice as often); if they go in, Junk Hunter could be dropped, or kept as the all-in-one.

**To explore: stackable cards.** Copies of a card add up, each in its own slot: one Medic is +5% potion chance, two Medics (two slots) +10%, three Medics (all three slots) +15%. That's all a stack gives: each copy adds the same step, with no extra bonus for matching sets and no levelling up. Likewise Ninja at −5%, −10%, −15% sight range, and Fleet Feet at −2%, −5%, −8% friction. Since there are only 3 slots, stacking trades breadth for depth. Cards that are simple on/off toggles (Chainsmoker, Barrel of Fun, Bomb Squad, Locksmith) do nothing extra as a second copy, so you can only ever hold one of each. This changes the default above: an offer can include a stackable card you already hold (taking it fills another slot with another copy), but never a toggle you already hold.

## End-of-level scorecard

When you reach the exit, a scorecard sums up how you played the level before the next one (and the card pick, M7) starts. The scoring math comes later; for now, what it tracks:

| Line | What it counts |
| --- | --- |
| Chests found | n of N chests opened |
| Enemies slain | n of N enemies killed |
| Untouched | Took no damage in the level (yes or no) |
| Combos | n combos landed (enemy-to-enemy hits in your shots) |
| Shots taken | n shots; this one counts against you, since fewer is better |

Later candidates: coins collected (n of N, strips included), Clean Sweeps, trick shots landed, and lives lost. Each line would convert into bonus gold (or a grade) once the math is decided.

## Trick shots

Trick shots are special one-shot combos, tracked as achievements. Each one pays a gold bonus the first time you land it, with a big centre banner naming it, like "Trick shot: Double Kill! +10". After that it still shows its name, but pays nothing extra. All of them happen within a single shot of yours, except Backfire, which happens on the enemy turn.

| Trick shot | How to land it | First-time bonus |
| --- | --- | --- |
| Pit Stop | Collect a potion or super potion, then kill an enemy, in the same shot | +10 gold |
| Bring a Sword to a Ball Fight | Collect a sword, then kill an enemy, in the same shot (the sword's +3 is often what makes the kill) | +10 gold |
| Double Kill | Kill 2 enemies in one shot (this also earns the combo-kill bonus turn) | +10 gold |
| Triple Kill | Kill 3 enemies in one shot | +25 gold |
| Barrel Roll | Knock an enemy into a barrel: you hit it and it cracks or breaks a barrel | +10 gold |
| Bank Shot | Combo an enemy into a barrel: an enemy you knocked hits another enemy, which then hits a barrel | +20 gold |
| Drop Shot | Knock an enemy into a bottomless pit (needs pits) | +15 gold |
| Long Drop | Combo an enemy into a pit: it falls in after being hit by another knocked enemy, not by you directly (needs pits) | +30 gold |
| Boomerang | Hit enemy A, it bounces off enemy B and comes back into you, and that return hit kills it (your hits count whichever ball is moving) | +25 gold |
| Backfire | On the enemy turn, an enemy hits you, bounces off into a barrel and dies. Only a red barrel can kill it, since plain barrels don't deal damage; if plain barrels ever learn to hurt (a card, say), they'd count too. A shield that blocks the hit still counts | +20 gold |

The names and bonus amounts are placeholders to tune.
- **Tracking:** credit for a hit passes along a chain. An enemy you hit is "knocked by you", and an enemy it hits is "combo-knocked". Whatever a knocked enemy touches next (a barrel, a pit, another enemy) is credited to the chain for the rest of the shot.
- **Bigger combos:** Triple Kill replaces Double Kill for that shot; you don't get both.

## Objects

Barrels, chests, keys and doors are the level's furniture. Chest gold is granted immediately with a short floating label above the hero; barrel loot lands on the floor for you to roll over.

| Object | Behavior |
| --- | --- |
| Barrel | Solid bumper. Each contact above 0.4 tiles/s, from the hero or an enemy (say one you knocked into it), cracks it one stage, with a 0.15 s cooldown per barrel. The second hit breaks it and leaves random loot on the floor where it stood, collected like enemy coins by rolling over it (so taking the loot is the "third hit"). The crack is obvious at a glance: the barrel gets darker, shorter and more faceted, and leans. |
| Chest | Solid bumper. The first contact opens it and grants a random 8 to 24 gold. It's hollow, lined with darker wood, so once the lid swings up you see its empty inside. The gold comes out as the same spinning coins as everywhere else, one per gold: they pop out of the chest one after another in a fountain, on higher arcs than a kill's coins, and each flashes white once and vanishes on the way down. They're show only: the gold is credited the moment the chest opens, with the "+N" label over your ball. |
| Key | Floor pickup (a standing key in red, blue or yellow), collected by rolling over it. Color-matched to one door and shown in a HUD slot at the top right until used. Picking one up shows no label: the key flies from where it lay to the middle of the screen, growing to about three times its HUD size and spinning, holds there a moment still spinning, then flies into its slot at the top right, its spin settling to face front, and the slot fills as it lands (about 1.4 s in all, `render.key*`). |
| Door | Solid and opaque until the hero is within half a tile while holding the matching key, during your own shot (being knocked against it by an enemy in the enemy move doesn't unlock it, or the enemy would roll through while it sinks). Then it opens for good (it sinks into the floor with a clunk and "Unlocked!") and the key is consumed; the check runs every physics step, so a ball rolling at a door with its key usually goes straight through. A closed door is a slab in its key's colour, 0.3 tiles thick (`objects.doorThickness`), standing across the middle of its tile in line with the walls either side, a little lower than them, with a keyhole on its broad faces: it sits in an indent that breaks up the wall, so it reads as a door rather than more wall, and a ball rolls into the indent before it meets the door. Enemies can pass through an open door. |
| Exit | Ends the level when the hero's center enters its tile. |
| Coin strip | Single coins placed in the level with `*`, 1 gold each, set out in rows or columns like Pac-Man dots. Coins that touch side by side form one strip. They don't block the ball and are collected by rolling over them (enemies don't take them), with a quick tick that rises in pitch with each coin in the same shot instead of a floating label. **Coin streaks:** any coins you take within one of your shots count up, strip coins and dropped coins alike. 5 in one shot is a **Clean Sweep** (+5 gold), 10 a **Super Sweep** (+10) and 20 a **Mega Sweep** (+25), each with a sparkle and a label ("Clean Sweep! +5"); the bonuses add up, so a 20-coin shot pays all three. Coins taken outside your shot (knocked about on the enemy turn) don't count. A strip also shows you a line: a trail of coins toward a wall hints at a bank shot, and it can draw you across a room into enemies' sight. Money Magnet (a trait card) sweeps up strips from a near miss. |
| Coins | There is one coin: the single 1-gold coin of the strips. A killed enemy scatters as many as its level (and now and then gear or a potion, see below), and barrel gold scatters its 1 to 5 the same way. Each coin flies out from the spot in an arc to a random clear spot 0.5 to 1.7 tiles away (never into a wall, door or bumper, nor across one), with a random arc height and flight time, so they land one after another, each with a single small bounce and a faint tink. A coin can be taken once it has landed. Collected by rolling over them, so grabbing them can pull you back into an enemy's sight. Scattered coins belong to no strip. Every coin on the floor spins in step with the others (one shared angle), and the same goes for every other pickup of a kind: all shields turn and bob together, all 1-ups, and so on. A coin you take hops straight up, flashes white once and vanishes, like the chest's coins. |
| Enemy drops | Besides its coins, a kill has separate, rare chances of dropping a sword (5%), a shield (8%) and a potion (12%, a quarter of those a super potion). They're rolled independently, so a lucky kill can drop more than one. Extras fly out and bounce just like the coins, and wait on the floor to be rolled over. |
| Explosive barrel (red) | Solid bumper with the same physics as a barrel. Any contact from the hero or an enemy, at any speed, detonates it: the ball that touched it takes 1 flat damage, ignoring ATK, and the barrel is destroyed with no loot. If it's you and you hold a shield, the shield takes the blast instead ("Blocked!") and is used up. |

A barrel may be empty; otherwise what it drops is left on the floor where the barrel was. You collect it by rolling over it, unless you can't use it right now: a shield while you already hold one, or a potion (or super potion) while your HP is full. Then it stays there, visible, until you roll over it once you can use it. Starting weights, to tune by feel:

| Result | Chance | Effect |
| --- | --- | --- |
| Empty | 40% | Nothing |
| Gold | 30% | 1 to 5 coins scattered around the barrel, 1 gold each |
| Health potion | 12% | +1 HP, capped at max |
| Super health potion | 4% | +5 HP, capped at max |
| Shield | 7% | You now hold a shield: it cancels the next enemy hit or red-barrel blast on you, then is used up. Shields don't stack |
| Sword | 4% | +3 ATK (ATK 4). It's spent by the first shot of yours that hits an enemy: every hit in that shot gets the +3, and it breaks as that shot comes to rest ("Sword broke!"). Shots that hit no enemy don't touch it |
| 1-up | 3% | +1 life |

There is no inventory. Each pickup floats above the hero, for example "+1 HP", "+5 HP", "+3", "Shield", "Sword" or "1-up". Like every floating value (damage numbers, "Combo!", labels), it's set large (about twice the HUD text size), rises for about half a second and then holds still for another half second before fading, so it can be read. Anything about you (gold, including a chest's, health, gear, "Blocked!", damage you take) floats above your ball and rides along with it; labels about an enemy stay where they were earned. (A config switch, `render.heroLabelsFollowBall`, leaves your labels in place instead, if that reads better.) Floating values are always kept inside the visible screen. While you hold gear, its icon sits beside your ball: the sword to the right, the shield to the left. Barrels crack from any ball, so knocking an enemy into one breaks it too; only the hero opens chests.

A red barrel is a hazard, not a reward: it can hurt an enemy that bumps it as easily as it can hurt you, so it's worth luring enemies into one.

You hold at most one shield; while you hold one, another shield stays on the floor until yours is used up. Likewise, a sword stays on the floor while you hold one.

## Levels

Each level is a plain text file with one character per tile. The screen shows about 9 tiles across, and levels can be any size; the camera follows the hero, so larger ones scroll.

| Character | Meaning |
| --- | --- |
| `#` | Wall |
| `.` | Floor |
| `S` | Hero start |
| `X` | Exit |
| `O` | Barrel |
| `C` | Chest |
| `1` to `5` | Enemy of that level |
| `r` `b` `y` | Key: red, blue, yellow |
| `R` `B` `Y` | Door matching that key |
| `E` | Explosive barrel (red) |
| `*` | Coin (touching coins form a strip) |
| `1` to `5` in the top-left corner only | Curviness of the walls (1 square to 5 roundest); that corner is still a wall, not an enemy |

An illustrative level in this format, with one enemy, two barrels, a chest, a red key and a red door in front of the exit, which sits in its alcove at the top:

```text
#########
####X####
#.......#
#.......#
###R#####
#.......#
#.O.1.O.#
#.......#
#.C.r...#
#.......#
#...S...#
#########
```

Every level is ringed by walls: the loader rejects a grid with anything else on its edge. The one exception is the top-left corner, which may hold the level's curviness digit (see Rounded walls below); the loader reads it and then treats that corner as wall like the rest.

Every exit is tucked into a one-tile alcove in the outer wall (walls on three sides, open to the room, or to a door, on one), so you only leave on purpose, by aiming into the gap, never by rolling across it by accident. A test enforces this for every shipped level.

Barrel loot is random by default. Per-barrel overrides can be added later without changing the format.

### Rounded walls

Each level sets how curvy its walls are with a single digit, 1 to 5, in the top-left corner of its grid in place of that `#`: 1 keeps square right angles (a level that relies on crisp cover), 5 is the roundest, 3 is halfway, and 2 and 4 are subtler steps between. A level without a digit there gets 5 (`walls.defaultCurve`). The digit is only read, never drawn: that corner is always a wall. The rest of the grid doesn't change: the level builder traces the outline of every wall mass and rounds its corners.

- **Outside corners** (a pillar or a wall end sticking into a room) become rounded bumps; a lone 1×1 pillar becomes a round post.
- **Inside corners** (a room's corners) become curved walls, so square rooms turn rounded and, with big enough curves, nearly circular.
- **How round:** each corner's biggest possible curve is 3 tiles (`walls.maxRound`) or half of the straight wall on either side, whichever is smaller, so neighbouring curves never overlap. The digit sets how much of that every corner gets, in even steps: 1 none (square), 2 a quarter, 3 half, 4 three quarters, 5 all of it. So a lower digit softens every corner, the 1-tile steps of a jagged cave included, not just the big room corners. At 5, rooms become round chambers and corridors pills with round end caps. Draw rooms as plain rectangles and let the rounding shape them: a stair-stepped edge (drawn to look diagonal or round) comes out wavy, since each 1-tile step gets its own small curve. A character to force one room round or square can come later if needed.
- **Doors:** corners touching a door stay square, so doors still fit their openings, and doors keep their box shape (they can open).
- **Walls touching only at a corner** (diagonal neighbours) stay joined, as square walls are, so no gap opens between them.
- **Physics:** the ball collides with the traced outline: straight runs, rounded outside corners (a round bump that keeps 90% of speed, like any wall) and rounded inside corners (the ball runs around the inside of the curve). The aim preview runs the same physics, so it draws curved bank shots correctly. Sight, patrol paths and scattered coins use the same rounded shapes, so what an enemy can see matches what a ball can hit.
- **Drawing:** the outlines are raised to wall height, curves included, instead of one block per tile, with the same face colours (blended around curves). The floor, exit tiles, doors and barrels are unchanged.
- **Keeping things clear:** an inside curve shrinks as far as it needs to so that anything placed in the room's corner (the hero's start, an enemy, a barrel, a chest, a key, a coin) keeps its full size clear of the wall; the other corners keep their full curves. A test checks every level for this.
- **Narrow bends stay open:** an inside curve is also no bigger than the open square of floor in its corner, so the outside of a 1-wide corridor's turn curves by at most 1 tile and can't pinch the bend shut against the inner corner. A test rolls a ball's footprint through every level to check the exits and keys can still be reached.
- **Play:** round rooms act like bowls where a hard shot circles the edge and sweeps enemies; rounded pillars bend shots instead of stopping them; pill corridors make long, flowing shots. The cost is crisp cover, since sharp corners are what hide-and-strike play relies on. That's why it's per level: some levels stay square and tactical, others go round and flowing, and a run can mix both.

**Bowls** (15×22, curviness 5) was the trial level for rounded walls and is still first in the run for now: two rectangular rooms that round into bowls, joined by a pill-shaped corridor with a red barrel in it, with four round posts in the lower room and one in the upper, three barrels, three enemies above and one below, and a strip of 7 coins across the top bowl.

The five MVP levels ramp one idea at a time. Sizes are suggestions in tiles.

Levels 1 to 3 are built (M6), followed for now by **Warrens** (24×21, your design): a wide warren of tunnels and rooms with ten enemies (levels 1 to 3), a two-key chain, and a coin vault. The blue key sits in the top-left room, guarded by the level-2 enemy; it opens the blue door to the bottom-right room with the red key, which opens the red door to the top floor: the exit, and a vault of 19 coins around a chest (a Super Sweep in one shot, one coin short of a Mega). Then comes **Crawlspace** (26×40, your design): you start in an alcove at the bottom of a long climb through rooms and barrel-strewn halls (20 enemies, 59 barrels, 9 red barrels, 5 chests, 26 coins), with a one-tile express shaft straight up the middle from the start room. At the top of the shaft the red door and then the blue door stand between you and the top floor's exit, which is itself walled in by barrels. The blue key sits in a notch between two level-3 enemies; the red key's notch has a level-3 enemy sitting right in its mouth, so it has to be knocked aside or killed first. Last for now is **Caverns** (26×33, your design, curviness 2): a winding cave system that rounds into organic tunnels and chambers (10 enemies, levels 1 to 3; 16 barrels, 17 red barrels, 5 chests, 16 coins). You start in an alcove at the bottom; the exit sits at the top of a one-tile shaft behind the red door, and the red key is in a nook off the top-right chamber, flanked by red barrels. After it, **Roomies** (26×28, your design, curviness 3): a grid of rooms linked by short gaps (13 enemies, levels 1 to 3; 33 barrels, 17 red barrels, a chest, 17 coins). You enter from a corridor at the bottom. The red key sits in a nook by the coins in the lower-right room (placed by Claude: the level had a red door but no red key); the red door leads up to the top-right room, which opens into the top-middle room and the blue door in front of the exit. The blue key is in the top-left room, reached through a gap in its floor. Levels 4 and 5 from the table below may still arrive in M8. Coin strips are optional: most levels have a few (Long Hall's right-hand corridor, One Key's trail toward the key nook), but a level doesn't need one.

| # | Name | Size | Enemies | Keys and doors | Teaches |
| --- | --- | --- | --- | --- | --- |
| 1 | Long Hall | 12×33 | Eight, levels 1 to 3 (a touching pair blocks the first doorway), plus six barrels, three chests and two red barrels | None | Aiming, bouncing, hitting enemies, combos, the exit |
| 2 | Breakables | 9×21 | Two level-1, plus seven barrels and a chest among pillars | None | Barrels, chest, potions, sightlines |
| 3 | One Key | 12×21 | Level 1 and level 2 (the level 2 guards the door), plus barrels, two chests and a red barrel | Red: the key sits in a nook out of the guard's sight; the door seals the exit room | Keys, doors, hiding from sight |
| 4 | Two Keys | 14×24 | Four, levels 1 to 3 | Red, blue | Routing, combos, using enemies as blockers |
| 5 | Gauntlet | 16×32 | Seven, levels 1 to 3 | Red, blue, yellow | Scrolling, risk against greed, everything together |

## Camera, HUD and presentation

The camera is a true orthographic projection at a fixed isometric angle matched to your mockup: the grid is turned about 30° on screen (columns run gently down-right, rows run steeply down-left) and seen from about 37° above the ground, so parallel lines never converge and scale stays constant with distance. It never rotates and has no manual zoom; it pans and zooms automatically to frame the action, as below.

- **Looking around:** on your turn, a drag that starts anywhere except on your ball pans the map instead (it must move a few pixels first, `camera.panStartPx`), keeping the spot you grabbed under your finger, within the level's bounds, so you can check keys, doors and the exit. The view then stays where you left it. To shoot you still press on the ball and drag. If the ball ends up off screen, a pulsing silver ball marker, like the enemies' edge "!", clings to the screen edge in its direction; tapping it glides the view back to the ball. Taking your shot also returns the camera to following the play. You can't pan while balls are moving or during the enemy move. On a small level that nearly fits the screen, there's little or nothing to pan.

- **Camera type:** `THREE.OrthographicCamera`, fixed isometric angle, no rotation or manual zoom in the MVP. Angles live in the config as `camera.yawDeg` (30) and `camera.elevationDeg` (37).
- **Frame the action:** the camera eases its centre and zoom to fit whatever matters right now, with about 2 tiles of padding, so no collision or combo happens out of view. While balls are moving, that's every moving ball (not every enemy, only the ones in motion); at rest on your turn, it's the hero, centred. It zooms out at most to 22 tiles across, and it keeps its view inside the level's on-screen outline wherever the level is big enough to fill the screen, so it doesn't show empty space past the level's edge (near an edge, the hero sits off-centre as a result).
- **Aiming:** while you drag, the zoom follows shot power: from the resting width at no power out to 13 tiles across at full power, easing smoothly and anchored on the ball (no panning), so pulling harder shows more of where the shot will go. The drag is measured in screen terms from the moment you pressed, so the zoom never feeds back into the shot's power, and the cancel marker keeps its size on screen so it always matches where releasing cancels.
- **Enemy phase:** the camera doesn't chase the enemies. It stays centred on you and pulls out only as far as it takes to show where the moving enemies stand as the phase begins, up to 13 tiles across (`camera.enemyPhaseWidth`); if none are near, it doesn't zoom out at all. You watch whatever enemy action lands in view. Then it returns to the resting 9-tile view for your shot, three times faster than it normally follows (`camera.returnBoost`, until it arrives or 1.2 s pass), so your turn starts without a slow drift. The enemies wait for that zoom to settle (up to 1.5 s) before they move. Every enemy that will move gets a red dashed, slowly turning ring on the floor, like your green turn ring, from the telegraph until the moves end, grown with the zoom so it keeps its size on screen. The rings (and the "!" over lungers) stay up for at least 0.6 s (`enemy.turnRingBeat`) before they all launch. Moves out of view simply happen off screen; the "!" edge markers still warn you about watchers.
- **View size:** the orthographic frustum has a base width of 9 tiles measured across the screen (with the grid turned, that is not the same as 9 columns), adjusted for aspect ratio, and scales to fit the browser window.
- **Dynamic zoom:** the frustum widens as the hero speeds up, so a hard shot pulls the camera out to reveal more of its path, then eases back to the base 9-tile width once every ball is at rest. Default range: 9 tiles at rest up to about 13 tiles at max launch speed (9 tiles/s). This is the minimum width; framing several moving balls can widen it further.
- **Walls:** short, so they never hide a ball behind them. The mockup's walls stand a little taller than the ball; the build uses 0.55 tile (`render.wallHeight`) so a ball resting just behind a wall stays visible.
- **Lighting:** one ambient light plus one directional light, no dynamic shadows for the MVP.
- **Turn label:** a small pill below the gold, at the top centre, always shows whose turn it is: "Player Turn" (green) while you aim and while your shot rolls, "Enemy Turn" (magenta) from the enemies' telegraph until it's your move again. It pulses when it changes, and sits apart from the centre banners, so it never covers "Combo Kill!".
- **Turn toast:** because the label is small and easy to miss, the start of your turn shows "Player Turn" big in the upper third of the screen, as a green pill. It pops in, holds for about half a second, then shrinks and flies up to land exactly on the label's spot and become the label (about 1 s in all). The small label stays hidden while it flies, so the two never show at once. The enemy turn doesn't toast or pulse: its label just switches, since the red rings and "!" already mark it. The very first label of a level doesn't toast, and a bonus turn isn't a change, so it doesn't either. With reduced motion on, the label simply switches.
- **Low HP:** at 1 HP (`render.dangerHp`) a soft red glow pulses slowly around the edge of the screen, like a heartbeat, until you heal or respawn. (It was first tried as the enemy-turn cue, but it read as "you're hurt", so it moved here.)
- **See-through walls:** only while you aim (pressed and dragged past the cancel ring, so the preview shows), any wall or door standing between the camera and your ball fades to a quarter opacity (`render.seeThroughOpacity`) in a soft circle about a tile across around the ball (`seeThroughBallRadius`) and along a narrower band around the whole aim path (`seeThroughPathRadius`), so the ball and the aimer are never hidden behind a wall. It fades in and back out in about 0.15 s (`seeThroughSeconds`); the rest of the time walls are solid. Only the part that actually covers them fades: it's measured on the ground each wall pixel hides, so walls beside or behind the ball stay solid.
- **Pickups through walls:** a floor pickup (coins, a potion, gear) hidden behind a wall shows through it as a flat see-through silhouette in its own colour (`render.itemXrayOpacity`), only where a wall or closed door covers it (a stencil mask), never through a ball standing on it, so loot is never lost from view. Keys are drawn 1.5× the size of other pickups.
- **See-through chests:** while you aim, any chest within about 2 tiles of the ball fades to 30% opacity, so an open lid never hides the ball; it turns solid again when you release.
- **HUD:** no bar behind it (the mockup's dark bar was dropped): gold (the score, next to a coin) sits on the left with a dark outline and drop shadow so it reads over any floor, and the keys you hold sit on the right as small key icons in their colours. Lives aren't shown; the death screen says how many remain. Gear isn't in the bar: its icons sit beside the hero ball instead (sword to the right, shield to the left). HP bars sit above the hero (green) and each enemy (pink), rendered as an HTML/CSS overlay on top of the canvas so they always face the viewer. The aim preview is different: it's drawn in the 3D scene itself, on the ground plane, so it lands exactly where you're dragging under the isometric projection rather than as a flat screen overlay.
- **Art:** procedural 3D primitives matching your mockup: extruded boxes for walls, cylinders for barrels, boxes for chests, spheres for hero and enemies. Walls and floor are flat greys with no outlines, shaded per face (light tops, darker sides); balls and props are toon-shaded with outlines.
- **The hero:** a polished silver ball (a stylized chrome matcap: bright sky, a hard horizon line, dark ground and a highlight) with an outline and a face that always looks at the camera. Its expression follows the play: confident at rest (cocked brow, smirk), determined while you aim and while your shot rolls (brows down, narrowed eyes, set mouth), worried through the enemy turn (brows pinched up in the middle, wide eyes, a wobbly mouth, a bead of sweat), and an "ouch" face (eyes squeezed shut, mouth open) for 0.8 s after any hit that costs HP, and while you're down. The reflection is fixed to the camera and doesn't turn as the ball rolls, so it reads as a reflection rather than a painted stripe; motion reads from the ball's movement and the aim path instead.

## Audio

Sound is MVP scope, not a later pass — a game about impacts needs impacts to sound like something.

**Ambient:** one looping ambient or music track plays under a level, non-positional. Per-level variation is a good post-MVP addition, not required now.

**Impact and event SFX:** a short one-shot per event — shot launch, wall bounce, barrel crack and break, red barrel explosion, chest open, the hero's hit on an enemy, an enemy-to-enemy combo hit, enemy lunge launch, the hero taking damage, coin pickup, potion or sword or shield or extra-life pickup, key pickup, door unlock, level exit, and death or respawn.

**Implementation:** Three.js's built-in `THREE.AudioListener` and `THREE.Audio` cover both layers without adding a library. Non-positional playback is enough given the MVP's small view; simple stereo panning by world x-position is a nice-to-have, not required. For the MVP, source SFX and the ambient loop from a free, CC0 pack (for example, Kenney's audio assets) rather than composing original audio. Swapping in custom or licensed audio later doesn't change any of the event hookups.

Feedback to add once the loop is fun: a short hit-stop on damaging hits, a small screen shake, and ball squash on impact. (Floating damage numbers and simple synthesized sounds are already in: pink "-1" for your hits, gold for combos.)

## Tech and build order

Build it in Three.js (current stable release) with Vite and plain JavaScript, adding one system per step so every step is playable on its own.

Two habits keep tuning cheap. Put every number from this doc in one config file. Add a debug overlay that toggles sight rays, collision shapes and the current phase. To test on a phone, run the Vite dev server with `--host` and open the LAN address.

| Step | Adds | Playable result |
| --- | --- | --- |
| M0 | Vite and Three.js skeleton, orthographic camera at the isometric angle, text-level loader that draws walls as extruded boxes | Level 1 renders |
| M1 | Hero ball, slingshot aim, custom 2D physics, aim preview projected onto the ground plane, launch and bounce SFX | Bounce around an empty room |
| M2 | Deadzone camera and larger levels | Explore a tall level |
| M3 | Enemy balls, HP bars, your-shot damage and combos, hit SFX | Kill enemies with ricochets |
| M4 | Turn manager, line of sight, "!" markers, lunges, lives, respawn, lunge and hero-hit SFX | The full core loop |
| M5 | Barrels, chests, loot table, coin drops, floating labels, HUD, pickup and break SFX | Loot and score |
| M6 | Keys, doors, exit, carry-over between levels, door and key SFX | Finish a run of levels |
| M7 | Trait cards: the end-of-level pick (offer 3, replace when full, skip), the nine starting cards, held cards in the HUD | A run you build as you go |
| M8 | Five levels, tuning pass, feedback effects, ambient music, phone test | The MVP |

## To-do

Changes agreed during development that aren't built yet. (Trait cards are scheduled as M7.)

- **Kill cam:** on a combo kill (2 or more kills in one shot), the camera zooms in on the last kill and time slows to about a quarter speed for a moment, then eases back to normal speed and framing. It must never cost you control: it happens only during your own shot, while balls are rolling, and the slow-motion stretch is short (well under a second of real time).
- **Tutorial:** a tutorial level, or a short series of them, before Long Hall, each teaching one thing: aim and shoot; bouncing and the preview; hitting enemies; enemy turns and hiding; pickups and gear; keys and doors. It needs a message box, in one of two forms:
  - a persistent message panel at the bottom of the screen that changes as you progress ("Drag back from the ball and release"), or
  - a dismissable modal that pauses play until you tap it.
  - The panel is lighter and keeps play flowing, so it's the likely default, with a modal only for the first message of each lesson. Messages would be triggered by level events (first shot, first bounce, first enemy seen). The level file would carry them, perhaps as a short script section below the grid.

- **Trick shots:** the achievements in the section above, with their first-time gold bonuses. Most can be built now; the two pit shots need the bottomless pit.
- **Red barrel blast push:** a red barrel's explosion also shoves nearby balls. Every ball, hero or enemy, within 2 tiles of the barrel's centre is pushed straight away from it with a quick burst of speed, up to 6 tiles/s at the centre, falling off to nothing at the edge. Only balls the blast can reach get pushed: a wall between the barrel and a ball shields it, using the same line check as sight. The push deals no damage by itself; only the ball that touched the barrel takes the 1 damage. A push that sends an enemy into another enemy counts as a combo, and one that sends an enemy into a barrel counts as your knock during your shot. Blasts can chain into other red barrels.

- **Bottomless pit:** a new tile that any ball, the hero or an enemy, can fall into, dying instantly.
  - **Falling in:** a ball falls when its centre passes over the pit, so it can graze the edge and roll on. It drops out of sight with a short fall.
  - **The hero:** falling in is a death (the death screen, one life lost), whatever your HP. The shield doesn't save you.
  - **Enemies:** an enemy that falls in dies and counts as a kill for combos and the "Combo Kill!" bonus turn, but its coins fall with it. Knocking enemies into pits is the reward for the risk.
  - **Everything else:** patrols never pick a route over a pit, and a lunge can still end in one. The aim preview shows a path ending in a pit, which marks the end with a warning. Sight passes over pits, since they're holes, not walls.
  - **Look:** a black hole in the floor with a darker rim.
  - **Level format:** a proposed character, `_`, joins the legend and the loader when it's built.

## Enemy ideas

More enemy types, to add variety after the MVP. Each keeps the core rules (a ball that rolls, takes turns and can be hit) and changes one thing. The notes fill in details to settle when building.

| Enemy | Behaviour | Notes |
| --- | --- | --- |
| Double | Moves or attacks twice per enemy turn | The second move starts once the first is at rest; its "!" and ring show twice |
| Ghost | Semi-transparent every other round: while faded it can't deal or take damage, and balls pass through it | Shown by opacity; its turn ring still shows, so you know it's there |
| Brute | Big, heavy ball with high HP; moves fast and hits hard, but barely moves when hit | Needs mass in the physics (every ball is equal mass today); it knocks you further than you knock it |
| Slider | Very low friction, so it travels far on every move | Great for long combos; dangerous from across the room |
| Bomb | Rolls like a normal enemy. The first hit lights its fuse. At the start of the next move (yours or an enemy's) the fuse burns down to half and the bomb turns red; at the start of the move after that it explodes where it lies. It can still be hit and moved while lit | The blast uses the red-barrel rules: 1 damage and the push, walls shield. Knock it into a group before it goes |
| Rubber | Hitting it doubles your speed on the rebound, so it's risky: you can't be sure where you'll end up | The aim preview runs the real rules, so it bends correctly at the rubber ball, but it's short (and shorter still once cards arrive, see Clairvoyance): the doubled rebound runs far past the visible path, so where you end up stays a gamble |
| Seeker | Knows roughly where you are even without sight, and its patrols drift toward you | Rather than full pathfinding, it tries 5 to 8 of its usual patrol moves and plays the one that ends closest to you, measured by walking distance on the tile grid (a quick breadth-first search). Cheap, and it naturally goes around walls |
| Golem | 3 HP. When hit, it splits into two 2-HP golems that roll off along your hit, as if they'd just been struck (the split doesn't damage them). When one of those is destroyed, it splits into two 1-HP ones | Splits carry the golem's momentum; the pieces can combo each other |
| Slime | A green orb. Hitting it doesn't hurt it: your ball is absorbed and sits inside it. While you're inside, enemy attacks damage the slime instead of you until it's gone, and your hits on other enemies damage them as normal and the slime too | You move the slime by shooting from inside it. It's both armour and a trap, since it slows you |
| Jekyll | Passive until hit; then it turns angry, and on its next turn attacks the nearest ball it can see, you or another enemy. After that turn it calms down again until hit again | A tool as much as a threat: hit it next to enemies to set it on them |

## Out of scope for the MVP

These are good ideas that wait until the five-level loop is fun.

- **Endless mode:** after the five handmade levels, levels are generated from a seed, one after another, getting harder, so a run can go on as long as you survive. Each candidate level is generated, checked with the same rules the handmade levels are tested against, and scored; the best of several is kept.
  - **Shape:** portrait, like the handmade levels: 9 to 14 tiles wide, 20 to 40 tall, start at the bottom, exit in its alcove at the top. 4 to 8 rooms (4×4 up to 8×6) along a main route, joined by corridors at least 2 tiles wide, plus a few side branches.
  - **Keys and doors:** a door on the main route with its key down a side branch reachable before it (checked by the same "can it be finished" test). Keys rise with depth: 0, then 1, then 2 or 3.
  - **Cover:** about one pillar or wall stub per 12 floor tiles, so there is always somewhere to hide; no enemy can see the start tile.
  - **Enemies:** a budget of total enemy levels that grows with depth (for example 4 + 2 × depth), spent on a mix of weak and strong enemies. Enemies at least 3 tiles apart, none within 6 tiles of the start, some deliberate pairs for combos, and a guard near each door.
  - **Objects:** about one barrel per 25 floor tiles, along walls; chests in dead ends, so they're worth the detour; red barrels near enemy groups for lures, never at a narrow passage or near the start; a few coin strips, some pointing along good shot lines.
  - **Difficulty with depth:** a bigger enemy budget, more keys, longer levels, fewer loot barrels; later, pits and rounded walls.
  - **Seeds:** every level comes from a seed number, so levels can be shared or replayed, and a daily run (the same seed for everyone that day) becomes possible.
  - **Scoring the candidates:** route length, how much cover there is, and how many good bank-shot angles the rooms offer; keep the best of several.
  - **Cost:** sizable, larger than M6.

- **Stories (elevation):** floors at different heights joined by ramps, as in isometric dungeon sketches; the ball never leaves the floor.
  - **Physics:** stays 2D. Each tile gets a floor height (story 0, 1, 2…), and ramp tiles slope in one direction between two heights. On a ramp, gravity pulls a ball downhill along the slope, so shots curve on slopes and an uphill shot can run out of speed and roll back.
  - **Drops between stories:** a drop acts as a wall at first. Rolling off a ledge onto the story below is a later, riskier addition.
  - **Level format:** a level file gains an optional second grid below the first: a height map of digits, plus ramp characters (`^` `v` `<` `>`) for each ramp's downhill direction. A level without one is all floor, so existing levels stay valid.
  - **What else it touches:** the aim preview runs the real physics, so it shows slopes for free. Sight is blocked by story drops, perhaps allowing a view down but not up. Patrols stay on their story unless their route uses a ramp, and a lunge downhill gains speed, so high ground is dangerous. Taller stories hide balls behind them, so the pickup see-through silhouette extends to balls. The camera tracks the ball's height.
  - **Cost:** a milestone of its own ("Stories", after M8), starting with ramps between two heights. Most of the work is drawing floors, cliff faces and ramps at different heights, and the level format.

- Multiple weapon and shield tiers, or any gear comparison
- XP, leveling and permanent upgrades between runs
- Enemies that move on their own, shoot from range, or drop keys
- Bosses and special rooms
- Shot limits, par scores and star ratings
- Spin, curved shots or steering mid-roll
- Saved progress, a level editor and a level-select screen
- Real art: modeled assets and textures, as opposed to the procedural primitives
- **Skins for the player:** alternative looks for the hero ball, with the polished silver ball as the default. A skin changes only the look (the ball's material and colour, its band and outline), never size, physics or stats, and it keeps the same face and expressions (confident, determined, ouch) so the ball always reads as you. Open questions: how skins are unlocked (bought with gold, earned for milestones such as clearing all five levels, or all available from the start), and where you choose one (a title screen, or between levels next to the card pick).
- Native packaging for phones, for example with Capacitor

## Assumptions and open questions

The rules above use these defaults where your answers left a gap. Change any that miss the intent.

- Knocked enemies that collide on your shot cost each other a flat 1 HP, not your ATK.
- Your hits on an enemy have no per-shot limit, so pinning one against a wall lands several hits. A pair of enemies trades damage at most once per shot, which stops grinding in tight rooms.
- Each enemy attacks at most once per round, and only enemies moving that round can damage the hero. Red barrels are the exception: they damage whichever ball touches them, hero included, in any phase.
- If the hero dies mid-round, the round ends there: anything still rolling stops under the death screen and the hero respawns with the first move.
- Sight range is 6 tiles, not the screen width, because a portrait screen is only 9 tiles wide. Other enemies also block sight, so they can shield you.
- Gear is the shield, a one-hit consumable held until an enemy hit or a red-barrel blast uses it up (they don't stack), and the sword, +3 ATK for every hit of the first shot in which you hit an enemy (combo and blast damage don't use it).
- Chest gold is granted at once with a floating label. Barrel loot, keys and enemy coins lie on the floor until you roll over them.
- Respawn restores full HP, and keys you hold are kept.
- Aiming is a slingshot pull-back rather than dragging toward the target.
- An explosive barrel deals a flat 1 damage regardless of ATK (a held shield absorbs it and is used up), ignores the normal 0.4 tiles/s hit threshold, and drops no loot.
- Zoom tracks the hero's speed only. Enemy lunges and patrols don't drive it.
- Patrol speed is 1–3 tiles/s, well under the 6 tiles/s lunge speed, so a patrolling enemy always reads as calmer than an attacking one.
- A patrol move follows normal physics, so if it happens to collide with the hero it still deals damage, the same as a lunge would. Contact is what matters, not intent.

Open questions:

- **Trait card pool:** offers exclude cards you hold, and a replaced card goes back into the pool (built that way in M7; stackable copies are still to explore).
- **Doppleganger when replaced:** you keep the extra life it gave you (built that way).
- **Locksmith and keys:** with Locksmith, keys don't appear at all, since doors open without them (built that way).
- **Athletic:** just 25% less friction for now; should it also raise your launch speed?
- **Bullionaire:** the 1.5× applies to all gold (coins, chests, streak bonuses), with the fraction carried over, so it's exact over time; the labels show the gold actually added.
- **Trick shots, "first time":** first time per run, or first time ever? "Ever" needs saved progress, which is out of scope for the MVP, so it's assumed per run for now.
