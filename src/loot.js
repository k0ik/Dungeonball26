// Loot and pickups (design doc: "Objects"). Pure rules: what a barrel drops,
// whether you can use a pickup right now, and what collecting it does.
//
// `run` is the player's run state: { gold, lives, keys }. The hero ball carries
// hp, maxHp, atk, shield (bool) and swordHits (uses left: 2 whole, 1 broken, 0 none).

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
  // A new sword waits on the floor while you hold an unbroken one.
  if (item.kind === 'sword') return hero.swordHits < L.swordUses;
  return true;
}

/**
 * Your hit on an enemy used the sword (if you hold one). Returns 'broken'
 * when it's down to its last hit, 'gone' when it's used up, or null.
 */
export function useSwordHit(hero) {
  if (!hero.swordHits) return null;
  hero.swordHits--;
  if (hero.swordHits > 0) return 'broken';
  hero.atk -= L.swordAtk;
  return 'gone';
}

/** Apply a pickup. Returns the short label that floats above the hero. */
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
      // A fresh sword; picking one up over a broken one restores it.
      if (hero.swordHits === 0) hero.atk += L.swordAtk;
      hero.swordHits = L.swordUses;
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
