// Loot and pickups (design doc: "Objects"). Pure rules: what a barrel drops,
// whether you can use a pickup right now, and what collecting it does.
//
// `run` is the player's run state: { gold, lives }. The hero ball carries
// hp, maxHp, atk, shield (bool) and sword (bool).

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
 * Can the hero use this right now? A potion at full HP or a shield while
 * already holding one can't be collected; it stays on the floor for later.
 */
export function canCollect(item, hero) {
  if (item.kind === 'potion' || item.kind === 'superPotion') return hero.hp < hero.maxHp;
  if (item.kind === 'shield') return !hero.shield;
  return true;
}

/** Apply a pickup. Returns the short label that floats above the hero. */
export function collect(item, hero, run) {
  switch (item.kind) {
    case 'gold':
    case 'coins':
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
      // One sword, no tiers: a second one changes nothing.
      if (!hero.sword) {
        hero.sword = true;
        hero.atk += L.swordAtk;
      }
      return 'Sword';
    case 'oneUp':
      run.lives += 1;
      return '1-up';
    default:
      throw new Error(`unknown item ${item.kind}`);
  }
}
