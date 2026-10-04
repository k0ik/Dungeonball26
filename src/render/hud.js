// HUD (design doc: "Camera, HUD and presentation"): no bar behind it, just
// gold (the score) outlined at the top left; along the bottom, the inventory:
// your artifacts with the keys you hold stacked beside them. (Gear is shown
// beside the hero instead.) Also shows short centred
// banners and the full-screen death / run-complete screen.

import { CONFIG } from '../config.js';
import { keyIcon } from './icons.js';
import { cardById } from '../cards.js';

export function createHud(container) {
  const bar = document.createElement('div');
  bar.className = 'hud';
  bar.innerHTML = `<div class="hud-left"><span class="coin"></span><span class="hud-gold">0</span></div>`;
  container.appendChild(bar);
  const gold = bar.querySelector('.hud-gold');
  // The keys you hold: a small column beside the artifacts (inventory below).
  const keySlots = document.createElement('div');
  keySlots.className = 'key-stack';
  keySlots.hidden = true;
  const keyHex = (c) => `#${CONFIG.colors.keys[c].toString(16).padStart(6, '0')}`;
  let arriving = 0; // keys still flying into their slots

  // A soft vignette framing the board (lighting.vignette), under the HUD.
  const vignette = document.createElement('div');
  vignette.className = 'vignette';
  vignette.style.setProperty('--vignette', CONFIG.lighting.vignette);
  container.appendChild(vignette);

  // A full-screen fade (to dark and back) for level changes.
  const fader = document.createElement('div');
  fader.className = 'screen-fade';
  container.appendChild(fader);

  // Along the bottom, above the held artifacts: the turn label, then the
  // level's message (tutorials) under it, stacked so they never overlap.
  const bottom = document.createElement('div');
  bottom.className = 'bottom-stack';
  container.appendChild(bottom);
  // A level's message stays for as long as you're on the level.
  const message = document.createElement('div');
  message.className = 'level-message';
  message.setAttribute('role', 'status');
  message.hidden = true;
  bottom.appendChild(message);

  // The inventory, at the foot of the stack: the artifacts you hold (cards in
  // the code) as a row of mini cards, and your keys stacked beside them.
  const inventory = document.createElement('div');
  inventory.className = 'inventory';
  inventory.hidden = true;
  bottom.appendChild(inventory);
  const showInventory = () => (inventory.hidden = hand.hidden && keySlots.hidden);
  // Artifacts: the held row, and the chest pick, a full-screen panel that
  // takes the input.
  const hand = document.createElement('div');
  hand.className = 'card-hand';
  hand.setAttribute('aria-label', 'Your artifacts');
  hand.hidden = true;
  inventory.append(hand, keySlots);
  let shownCards = null;
  // Tapping a held card pauses the game and shows the card; a tap anywhere
  // closes it and play resumes.
  const view = document.createElement('div');
  view.className = 'card-view';
  view.setAttribute('role', 'dialog');
  container.appendChild(view);
  let paused = false;
  function showCardView(id) {
    const c = cardById(id);
    view.innerHTML = '<div class="card big"><span class="card-name"></span><span class="card-icon" aria-hidden="true"></span><span class="card-text"></span></div><p class="card-view-hint">Paused · tap anywhere to continue</p>';
    view.querySelector('.card-icon').textContent = c.icon;
    view.querySelector('.card-name').textContent = c.name;
    view.querySelector('.card-text').textContent = c.text;
    view.setAttribute('aria-label', c.name);
    view.classList.add('on');
    paused = true;
  }
  view.addEventListener('click', () => {
    view.classList.remove('on');
    paused = false;
  });

  const pick = document.createElement('div');
  pick.className = 'card-pick';
  pick.setAttribute('role', 'dialog');
  pick.setAttribute('aria-label', 'A new artifact');
  container.appendChild(pick);
  let shownKeys = null;
  let shownGold = -1;

  // Low HP: a soft red glow around the screen's edge, slowly pulsing, while
  // you're one hit from a knockout.
  const edge = document.createElement('div');
  edge.className = 'danger-edge';
  container.appendChild(edge);
  let shownDanger = false;

  // "Player Turn" / "Enemy Turn": a small pill near the bottom, above the
  // level's message, always shown, apart from the centre banner.
  const turn = document.createElement('div');
  turn.className = 'turn-label';
  turn.setAttribute('role', 'status');
  bottom.prepend(turn);
  let shownTurn = '';

  // Turn toast: at each change of turn the same words appear big in the
  // upper third of the screen for a moment, then shrink and fly down to become
  // the label. The label itself stays hidden meanwhile, so it never doubles up.
  const toast = document.createElement('div');
  toast.className = 'turn-toast';
  toast.setAttribute('aria-hidden', 'true'); // the label already announces it
  container.appendChild(toast);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  toast.addEventListener('animationend', () => {
    toast.classList.remove('show');
    turn.classList.remove('landing');
  });

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.hidden = true;
  container.appendChild(banner);
  let bannerTimer = 0;

  // Full-screen message ("You Died!", "Run Complete!"): darkens everything
  // (HUD included) and swallows input until hidden, then lightens again.
  const death = document.createElement('div');
  death.className = 'death';
  death.setAttribute('role', 'alert');
  death.innerHTML = '<strong></strong><span></span>';
  death.style.setProperty('--fade', `${CONFIG.hero.deathFadeSeconds}s`);
  container.appendChild(death);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'contextmenu']) {
    death.addEventListener(type, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  return {
    /** True while a card is open (the game holds still). */
    get paused() {
      return paused;
    },
    setGold(n) {
      if (n === shownGold) return;
      const up = n > shownGold && shownGold >= 0;
      shownGold = n;
      gold.textContent = n;
      gold.setAttribute('aria-label', `${n} gold`);
      if (up) {
        gold.classList.remove('bump');
        void gold.offsetWidth;
        gold.classList.add('bump');
      }
    },
    /** Whose turn it is: 'player' or 'enemy'. Pulses when it changes. */
    setTurn(who) {
      if (who === shownTurn) return;
      const first = shownTurn === ''; // no toast for the very first label
      shownTurn = who;
      turn.textContent = who === 'enemy' ? 'Enemy Turn' : 'Player Turn';
      turn.dataset.who = who;
      if (who === 'enemy') {
        // The enemy turn just switches the label: no pulse, no toast (and any
        // toast still flying is dropped).
        turn.classList.remove('show', 'landing');
        toast.classList.remove('show');
        return;
      }
      turn.classList.remove('show');
      void turn.offsetWidth;
      turn.classList.add('show');
      if (!first && !reducedMotion?.matches) {
        turn.classList.add('landing'); // hidden until the toast lands on it
        toast.textContent = turn.textContent;
        toast.dataset.who = who;
        // Land on the label's centre, wherever the bottom stack puts it.
        const at = turn.getBoundingClientRect();
        const box = container.getBoundingClientRect();
        toast.style.setProperty('--land-y', `${at.top - box.top + at.height / 2}px`);
        toast.classList.remove('show');
        void toast.offsetWidth; // restart the animation
        toast.classList.add('show');
      }
    },
    /**
     * Darken the screen and block input, with a title and a second line.
     * `variant` 'death' titles in red, 'win' in gold.
     */
    showScreen(title, sub, variant = 'death') {
      death.querySelector('strong').textContent = title;
      death.querySelector('span').textContent = sub;
      death.dataset.variant = variant;
      banner.hidden = true;
      death.classList.add('on');
    },
    hideScreen() {
      death.classList.remove('on');
    },
    /**
     * The end-of-level card pick. Tap a card to take it; if your slots are
     * full you then pick one of yours to replace. Skip is always there.
     * Calls done(id, replaceId) once, with id null for a skip.
     */
    /**
     * A chest's card: "New artifact" shows it, then your slots ("Choose a slot").
     * Tap an empty slot to put it there; tap a held card to replace it (after
     * a "Discard ...?" confirmation); or Skip. done(replace) gets null for an
     * empty slot, the replaced card's id, or false for skip.
     */
    showCardFind(id, held, done) {
      paused = true; // the game holds still while you choose
      const finish = (answer) => {
        pick.classList.remove('on');
        paused = false;
        done(answer);
      };
      const cardFace = (cid, extra = '') => {
        const c = cardById(cid);
        const el = document.createElement('div');
        el.className = `card ${extra}`;
        el.innerHTML = `<span class="card-name"></span><span class="card-icon" aria-hidden="true"></span><span class="card-text"></span>`;
        el.querySelector('.card-icon').textContent = c.icon;
        el.querySelector('.card-name').textContent = c.name;
        el.querySelector('.card-text').textContent = c.text;
        return el;
      };
      const found = cardById(id);
      const showSlots = () => {
        pick.innerHTML = '<p class="pick-kicker">New artifact</p><div class="pick-new"></div><h2>Choose a slot</h2><div class="slot-row"></div><button type="button" class="card-skip">Skip</button>';
        pick.querySelector('.pick-new').append(cardFace(id, 'new'));
        const row = pick.querySelector('.slot-row');
        for (let i = 0; i < CONFIG.cards.slots; i++) {
          const held_ = held[i];
          const b = document.createElement('button');
          b.type = 'button';
          if (held_) {
            const c = cardById(held_);
            b.className = 'slot held';
            b.innerHTML = '<span class="slot-icon" aria-hidden="true"></span><span class="slot-name"></span>';
            b.querySelector('.slot-icon').textContent = c.icon;
            b.querySelector('.slot-name').textContent = c.name;
            b.addEventListener('click', () => confirmReplace(held_));
          } else {
            b.className = 'slot empty';
            b.innerHTML = '<span class="slot-name">Empty</span>';
            b.addEventListener('click', () => finish(null));
          }
          row.append(b);
        }
        pick.querySelector('.card-skip').addEventListener('click', () => finish(false));
        pick.classList.add('on');
        row.querySelector('.slot')?.focus();
      };
      const confirmReplace = (old) => {
        pick.innerHTML = '<h2></h2><p></p><div class="pick-new"></div><div class="confirm-row"><button type="button" class="card-skip no">No</button><button type="button" class="card-skip yes">Yes</button></div>';
        pick.querySelector('h2').textContent = `Discard ${cardById(old).name}?`;
        pick.querySelector('p').textContent = `${found.name} will replace it.`;
        pick.querySelector('.pick-new').append(cardFace(old, 'held'));
        pick.querySelector('.no').addEventListener('click', showSlots);
        pick.querySelector('.yes').addEventListener('click', () => finish(old));
        pick.querySelector('.yes').focus();
      };
      showSlots();
    },
    /** The row of cards you hold. */
    setCards(ids) {
      const key = ids.join();
      if (key === shownCards) return;
      shownCards = key;
      hand.innerHTML = '';
      for (const id of ids) {
        const c = cardById(id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'card-chip';
        chip.setAttribute('aria-label', `${c.name}: ${c.text}`);
        chip.innerHTML = '<span aria-hidden="true"></span><b></b>'; // a mini artifact card: icon over name
        chip.firstChild.textContent = c.icon;
        chip.lastChild.textContent = c.name;
        chip.addEventListener('click', () => showCardView(id));
        hand.appendChild(chip);
      }
      hand.hidden = ids.length === 0;
      showInventory();
    },
    /**
     * A key you just picked up, at page point `from`: it flies to the middle
     * of the screen, growing and spinning, holds there a moment, then flies
     * into its slot in the inventory (settling its spin), and the slot fills
     * as it lands. Call after the key is added to your keys (it flies to the
     * last slot).
     */
    flyKey(color, from) {
      const K = CONFIG.render;
      const el = document.createElement('div');
      el.className = 'key-fly';
      el.innerHTML = keyIcon(keyHex(color));
      document.body.appendChild(el);
      arriving++;
      shownKeys = null;
      const start = performance.now();
      const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
      const t1 = K.keyToCenterSeconds;
      const t2 = t1 + K.keyHoldSeconds;
      const t3 = t2 + K.keyToSlotSeconds;
      const spinAt = (t) => t * K.keySpinTurns * 360; // degrees, while spinning freely
      const spinEnd = Math.ceil(spinAt(t2) / 360 + 0.5) * 360; // the next full turn after the hold: faces front
      const frame = (now) => {
        const t = (now - start) / 1000;
        const mid = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        let x;
        let y;
        let scale;
        let spin;
        if (t < t1) {
          const u = ease(t / t1);
          x = from.x + (mid.x - from.x) * u;
          y = from.y + (mid.y - from.y) * u;
          scale = 1 + (K.keyCenterScale - 1) * u;
          spin = spinAt(t);
        } else if (t < t2) {
          x = mid.x;
          y = mid.y;
          scale = K.keyCenterScale;
          spin = spinAt(t);
        } else {
          const u = ease(Math.min(1, (t - t2) / K.keyToSlotSeconds));
          const slots = keySlots.querySelectorAll('.key-slot');
          const slot = slots[slots.length - arriving] ?? slots[slots.length - 1];
          const r = slot ? slot.getBoundingClientRect() : keySlots.getBoundingClientRect();
          x = mid.x + (r.left + r.width / 2 - mid.x) * u;
          y = mid.y + (r.top + r.height / 2 - mid.y) * u;
          scale = K.keyCenterScale + (1 - K.keyCenterScale) * u;
          spin = spinAt(t2) + (spinEnd - spinAt(t2)) * u;
          if (t >= t3) {
            el.remove();
            arriving--;
            shownKeys = null; // re-render on the next setKeys, showing the slot
            return;
          }
        }
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) perspective(200px) rotateY(${spin.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    /** The keys you hold, as a list of colours ('red', 'blue', 'yellow'). */
    setKeys(keys) {
      const key = `${keys.join()}|${arriving}`;
      if (key === shownKeys) return;
      shownKeys = key;
      // The newest slots stay empty while their keys are still flying in (flyKey).
      keySlots.innerHTML = keys
        .map((c, i) => `<span class="key-slot${i >= keys.length - arriving ? ' arriving' : ''}" title="${c} key">${keyIcon(keyHex(c))}</span>`)
        .join('');
      keySlots.setAttribute('aria-label', keys.length ? `Keys: ${keys.join(', ')}` : 'No keys');
      keySlots.hidden = keys.length === 0;
      showInventory();
    },
    /** Red screen edge on or off (low HP). */
    setDanger(on) {
      if (on === shownDanger) return;
      shownDanger = on;
      edge.classList.toggle('on', on);
    },
    /** Centred message for `seconds`; a second line is optional. */
    /** Fade the screen to dark (on) or back (off) over `seconds`. */
    fade(on, seconds = 0.3) {
      fader.style.transitionDuration = `${seconds}s`;
      fader.classList.toggle('on', on);
    },
    /** Show a level's message at the bottom of the screen, or hide it (null). */
    setMessage(text) {
      message.textContent = text ?? '';
      message.hidden = !text;
    },
    banner(title, sub = '', seconds = 1.6) {
      banner.innerHTML = `<strong></strong><span></span>`;
      banner.querySelector('strong').textContent = title;
      banner.querySelector('span').textContent = sub;
      banner.hidden = false;
      banner.classList.remove('show');
      void banner.offsetWidth; // restart the entry animation
      banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => (banner.hidden = true), seconds * 1000);
    },
  };
}
