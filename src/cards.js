// Artifacts (design doc: "Artifacts"; "cards" in the code). Always-on powers
// that last the rest of the run. You hold up to 3; each chest gives one, which
// you place in a slot (replacing one of yours if you choose) or skip.
//
// Pure data and rules; the game and HUD ask `has(cards, id)` when an effect
// applies. Numbers live in CONFIG.cards.

import { CONFIG } from './config.js';

const K = CONFIG.cards;

export const CARDS = [
  { id: 'vampirism', name: 'Leech in a Jar', icon: '🫙', text: `Defeating an enemy gives you +${K.vampirismHeal} HP.` },
  // Shelved for now. Its effect is still wired up in game.js.
  // { id: 'doppleganger', name: 'Doppleganger', icon: '👥', text: '+1 life, and +1 to the lives a game over restores.' },
  { id: 'junkHunter', name: "Warrior's Nose", icon: '👃', text: 'Find swords and shields more often.' },
  // Removed: gold won't be picked up in the planned economy. Its effect is still wired up in game.js.
  // { id: 'bullionaire', name: 'Sack of Plenty', icon: '💰', text: `The gold you collect is worth ${K.bullionaire}×.` },
  { id: 'barrelOfFun', name: "Cooper's Hammer", icon: '🔨', text: 'Break barrels with one hit.' },
  // Shelved for now: unclear that skipping doors pays off. Its effect is still wired up in game.js.
  // { id: 'locksmith', name: 'Locksmith', icon: '🗝️', text: 'Doors open without keys.' },
  { id: 'athletic', name: 'Skates of Rollering', icon: '🛼', text: 'Travel faster and farther.' },
  // Removed: coins won't lie on the floor in the planned economy. Its effect is still wired up in game.js.
  // { id: 'moneyMagnet', name: 'Value Vacuum', icon: '🌪️', text: 'Nearby coins are attracted to you.' },
  { id: 'elasticity', name: 'Bouncy Britches', icon: '🩳', text: 'Bounce off objects and enemies to go faster and farther.' },
  { id: 'chickenHeart', name: 'Chicken Heart', icon: '🐔', text: `+${K.chickenHeartHp} to max health.` },
  { id: 'bombSquad', name: 'Bomb Squad T-Shirt', icon: '👕', text: "Explosions don't hurt you." },
  { id: 'doctorsOrders', name: "Doctor's Orders", icon: '📋', text: 'Potions heal twice as much.' },
  { id: 'ninja', name: "Assassin's Cloak", icon: '🥷', text: 'Enemies are less likely to see you.' },
  { id: 'balletShoes', name: "Assassin's Boots", icon: '🥾', text: 'Free turn after every kill.' },
  { id: 'tapShoes', name: 'Tap Shoes', icon: '👞', text: 'Chance to dodge enemy attacks.' },
  { id: 'warriorSword', name: "Warrior's Sword", icon: '🗡️', text: 'Start each level with a sword.' },
  { id: 'warriorShield', name: "Warrior's Shield", icon: '🛡️', text: 'Start each level with a shield.' },
  { id: 'doctorsBottle', name: "Doctor's Bottle", icon: '🧴', text: 'Start each level with full health.' },
  { id: 'doctorsBag', name: "Doctor's Bag", icon: '🩺', text: 'Find more potions.' },
  { id: 'wizardStaff', name: 'Bug Zapper', icon: '⚡', text: 'Automatically zaps enemies.' },
  { id: 'rogueDagger', name: "Rogue's Dagger", icon: '🔪', text: 'Throw a dagger after each kill.' },
  { id: 'poisonedPen', name: 'Poisoned Pen', icon: '🖋️', text: 'Enemies you attack lose -1 HP per turn.' },
  { id: 'stoneShoes', name: 'Stone Shoes', icon: '🪨', text: 'Enemy hits barely knock you back.' },
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
