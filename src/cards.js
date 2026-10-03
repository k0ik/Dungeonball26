// Trait cards (design doc: "Trait cards"). Always-on abilities that last the
// rest of the run. You hold up to 3; after each level you're offered 3 and
// take one (replacing one of yours when full), or skip.
//
// Pure data and rules; the game and HUD ask `has(cards, id)` when an effect
// applies. Numbers live in CONFIG.cards.

import { CONFIG } from './config.js';

const K = CONFIG.cards;

export const CARDS = [
  { id: 'vampirism', name: 'Vampirism', icon: '🦇', text: `Every kill heals you ${K.vampirismHeal} HP.` },
  // Shelved for now. Its effect is still wired up in game.js.
  // { id: 'doppleganger', name: 'Doppleganger', icon: '👥', text: '+1 life, and +1 to the lives a game over restores.' },
  { id: 'junkHunter', name: 'Junk Hunter', icon: '🛡️', text: 'Swords and shields turn up twice as often in barrels.' },
  { id: 'bullionaire', name: 'Bullionaire', icon: '💰', text: `All gold you collect is worth ${K.bullionaire}×.` },
  { id: 'barrelOfFun', name: 'Barrel of Fun', icon: '🛢️', text: 'Barrels break in one hit.' },
  // Shelved for now: unclear that skipping doors pays off. Its effect is still wired up in game.js.
  // { id: 'locksmith', name: 'Locksmith', icon: '🗝️', text: 'Doors open without keys.' },
  { id: 'athletic', name: 'Athletic', icon: '👟', text: `Your ball rolls faster and farther: ${Math.round((1 - K.athleticFriction) * 100)}% less friction.` },
  { id: 'moneyMagnet', name: 'Money Magnet', icon: '🧲', text: `Coins within ${K.magnetRadius} tiles are pulled in to you.` },
  { id: 'elasticity', name: 'Elasticity', icon: '🏀', text: `Barrels, chests and enemies kick you away like pinball bumpers (+${K.elasticityKick} speed, up to ${K.elasticityKicksPerBumper}× each per shot).` },
];

export const cardById = (id) => CARDS.find((c) => c.id === id);

/** Does the hand hold this card? */
export const has = (cards, id) => cards.includes(id);

/**
 * The end-of-level offer: `n` different random cards you don't already hold
 * (fewer if the pool runs short).
 */
export function offerCards(held, rng = Math.random, n = K.offer) {
  const pool = CARDS.map((c) => c.id).filter((id) => !held.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/**
 * Take `id` into the hand. With a free slot it's added; when full,
 * `replace` (a held card's id) makes room. Returns the new hand, or null if
 * the hand is full and nothing was chosen to replace.
 */
export function takeCard(held, id, replace = null) {
  // Chosen slot taken: the new card replaces that one (even with a slot free).
  if (replace && held.includes(replace)) return held.map((c) => (c === replace ? id : c));
  if (held.length < K.slots) return [...held, id];
  return null;
}
