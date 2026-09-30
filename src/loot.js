// Loot and pickups (design doc: "Objects"). Pure rules: what a barrel drops,
// whether you can use a pickup right now, and what collecting it does.
//
// `run` is the player's run state: { gold, lives, keys }. The hero ball carries
// hp, maxHp, atk, shield (bool) and sword: 0 (none), 'ready' (held, unused) or
// 'swinging' (it hit an enemy this shot; it breaks when the shot comes to rest).

import { CONFIG } from './config.js';

const L = CONFIG.loot;

export function randomInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Roll a barrel's drop from the weighted loot table. */
export function rollLoot(rng = Math.random) {
  const total = L.table.reduce((sum, e) => sum + e.weight, 0);
  let pick = rng() * total;
  for (const entry of L.table) {
    pick -= entry.weight;
    if (pick < 0) {
      return entry.kind === 'gold' ? { kind: 'gold', value: randomInt(L.goldMin, L.goldMax, rng) } : { kind: entry.kind };
    }
  }
  return { kind: L.table.at(-1).kind };
}

/**
 * What a killed enemy drops besides its coins: each of sword, shield and a
 * potion has its own small chance, so a lucky kill can drop more than one.
 * A potion drop is a super potion some of the time. Returns a list of kinds.
 */
export function rollEnemyDrops(rng = Math.random) {
  const D = L.enemyDrops;
  const out = [];
  if (rng() < D.sword) out.push('sword');
  if (rng() < D.shield) out.push('shield');
  if (rng() < D.potion) out.push(rng() < D.superPotionShare ? 'superPotion' : 'potion');
  return out;
}

/**
 * Can the hero use this right now? A potion at full HP or a shield while
 * already holding one can't be collected; it stays on the floor for later.
 */
export function canCollect(item, hero) {
  if (item.kind === 'potion' || item.kind === 'superPotion') return hero.hp < hero.maxHp;
  if (item.kind === 'shield') return !hero.shield;
  // A new sword waits on the floor while you hold one.
  if (item.kind === 'sword') return !hero.sword;
  return true;
}

/**
 * A sword is spent by the first shot of yours that hits an enemy: every hit
 * in that shot gets its +3, and it breaks as that shot comes to rest. Shots
 * that hit no enemy don't touch it. Call on each of your hits on an enemy.
 */
export function swingSword(hero) {
  if (hero.sword === 'ready') hero.sword = 'swinging';
}

/** Call as your shot comes to rest. Returns true if the sword broke. */
export function endSwordShot(hero) {
  if (hero.sword !== 'swinging') return false;
  hero.sword = 0;
  hero.atk -= L.swordAtk;
  return true;
}

/** Apply a pickup. Returns the short label that floats above the hero. */
/** The coin-streak bonus reached at exactly `count` coins in one shot, or null. */
export function coinStreakBonus(count) {
  return L.coinStreaks.find((s) => s.count === count) ?? null;
}

export function collect(item, hero, run) {
  switch (item.kind) {
    case 'gold':
    case 'coins':
    case 'coin':
      run.gold += item.value;
      return `+${item.value}`;
    case 'potion':
      hero.hp = Math.min(hero.maxHp, hero.hp + L.potionHeal);
      return `+${L.potionHeal} HP`;
    case 'superPotion':
      hero.hp = Math.min(hero.maxHp, hero.hp + L.superPotionHeal);
      return `+${L.superPotionHeal} HP`;
    case 'shield':
      hero.shield = true;
      return 'Shield';
    case 'sword':
      hero.atk += L.swordAtk;
      hero.sword = 'ready';
      return 'Sword';
    case 'oneUp':
      run.lives += 1;
      return '1-up';
    case 'key':
      run.keys.push(item.color);
      return `${item.color[0].toUpperCase()}${item.color.slice(1)} key`;
    default:
      throw new Error(`unknown item ${item.kind}`);
  }
}
