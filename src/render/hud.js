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

  // Callouts (bonuses, Combo Kill, Bonus turn): a stack above the board's middle.
  const callouts = document.createElement('div');
  callouts.className = 'callouts';
  container.appendChild(callouts);
  let calloutNext = 0; // when the next callout may appear (ms)

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
  // screen just below your ball for a moment, then shrink and fly down to become
  // the label. The label itself stays hidden meanwhile, so it never doubles up.
  const toast = document.createElement('div');
  toast.className = 'turn-toast';
  toast.setAttribute('aria-hidden', 'true'); // the label already announces it
  container.appendChild(toast);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  toast.addEventListener('animationend', () => {
    toast.classList.remove('show', 'stay');
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
      // Both turns alike: the big label pops up, then flies down to the small
      // label at the bottom, which stays for the whole turn.
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
        toast.classList.remove('show', 'stay');
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
     * Bonuses Earned, as a level ends: the board dims under a dark veil and
     * the level's bonuses (already added to your gold) appear one by one,
     * name and value, in a chunky font, about three a second (onLine plays
     * each one's sound); the list scrolls if it outgrows the screen. Then a
     * Continue button; done() when it's pressed.
     */
    showBonuses(list, onLine, done) {
      const el = document.createElement('div');
      el.className = 'bonuses';
      el.innerHTML = '<h2>Bonuses Earned</h2><ul></ul><button type="button" class="card-skip bn-go" hidden>Continue</button>';
      container.appendChild(el);
      const ul = el.querySelector('ul');
      const go = el.querySelector('.bn-go');
      const items = list.length ? list : [{ name: 'None this time', gold: 0 }];
      items.forEach((b, i) => {
        setTimeout(() => {
          const li = document.createElement('li');
          li.innerHTML = '<span></span><b></b>';
          li.querySelector('span').textContent = b.name;
          li.querySelector('b').textContent = b.gold ? `${b.gold}` : '';
          if (!b.gold) li.className = 'none';
          ul.append(li);
          ul.scrollTop = ul.scrollHeight;
          if (b.gold) onLine?.();
          if (i === items.length - 1) setTimeout(() => (go.hidden = false), 350);
        }, 450 + i * CONFIG.render.bonusLineSeconds * 1000);
      });
      go.addEventListener('click', () => {
        el.remove();
        done();
      });
    },
    /**
     * A callout: a bonus, "Combo Kill!" or "Bonus turn!" (a trick shot's
     * with a small "Trick Shot" eyebrow over its name), centred above the
     * board for calloutSeconds. Callouts close together stack: each new one
     * waits at least calloutBeat after the last, then appears in place and
     * pushes the older ones up. Returns the seconds until this one is gone.
     */
    callout(title, sub = '', gold = 0, note = '', eyebrow = '') {
      const R = CONFIG.render;
      const now = performance.now();
      const at = Math.max(now, calloutNext);
      calloutNext = at + R.calloutBeat * 1000;
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'callout';
        el.innerHTML = '<small></small><strong></strong><span></span><em></em>';
        el.querySelector('small').textContent = eyebrow;
        el.querySelector('small').hidden = !eyebrow;
        el.querySelector('strong').textContent = gold ? `${title} +${gold}` : title;
        el.querySelector('span').textContent = sub;
        el.querySelector('span').hidden = !sub;
        el.querySelector('em').textContent = note;
        el.querySelector('em').hidden = !note;
        callouts.appendChild(el);
        setTimeout(() => {
          el.classList.add('out');
          setTimeout(() => el.remove(), 300);
        }, R.calloutSeconds * 1000);
      }, at - now);
      return (at - now) / 1000 + R.calloutSeconds;
    },
    /**
     * The peddler (between levels): a supply shop. Your gold and HP, then each
     * item with its price; one you couldn't use or can't afford is greyed out.
     * `model` is { gold, hp, maxHp, items: [{ name, icon, text, price, useless, poor }] };
     * `actions` { buy(i), leave() }. Returns { update(model), close() }.
     */
    showPeddler(model, actions) {
      const el = document.createElement('div');
      el.className = 'peddler';
      container.appendChild(el);
      const render = (m) => {
        el.innerHTML = `<div class="pd-panel"><h2>The Peddler</h2><p class="pd-gold"><i class="coin"></i><span></span><small></small></p><div class="pd-offers"></div>
          <div class="pd-actions"><button type="button" class="card-skip pd-leave">Continue</button></div></div>`;
        el.querySelector('.pd-gold span').textContent = m.gold;
        el.querySelector('.pd-gold small').textContent = `${m.hp}/${m.maxHp} HP`;
        const list = el.querySelector('.pd-offers');
        m.items.forEach((it, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `pd-offer${it.useless ? ' useless' : it.poor ? ' poor' : ''}`;
          b.disabled = it.useless || it.poor;
          b.innerHTML = '<span class="pd-icon" aria-hidden="true"></span><span class="pd-name"></span><span class="pd-text"></span><b class="pd-price"></b>';
          b.querySelector('.pd-icon').textContent = it.icon;
          b.querySelector('.pd-name').textContent = it.name;
          b.querySelector('.pd-text').textContent = it.text;
          b.querySelector('.pd-price').textContent = `${it.price}`;
          b.addEventListener('click', () => actions.buy(i));
          list.append(b);
        });
        el.querySelector('.pd-leave').addEventListener('click', actions.leave);
      };
      render(model);
      return {
        update: render,
        close: () => el.remove(),
      };
    },
    /**
     * A chest's artifact. With none held: the card, with Take and Skip. With
     * one held: yours and the new one side by side, with Keep yours and Swap.
     * A skipped artifact is gone. done(replace) gets null (taken into the
     * empty slot), the swapped-out card's id, or false for a skip.
     */
    showCardFind(id, held, done, { kicker = 'New artifact' } = {}) {
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
      const old = held.length >= CONFIG.cards.slots ? held[held.length - 1] : null;
      pick.innerHTML = '<p class="pick-kicker"></p><div class="pick-pair"></div><p class="pick-note">Skip it and it\'s gone.</p><div class="confirm-row"><button type="button" class="card-skip no"></button><button type="button" class="card-skip yes"></button></div>';
      pick.querySelector('.pick-kicker').textContent = kicker;
      const pair = pick.querySelector('.pick-pair');
      const side = (label, face) => {
        const col = document.createElement('div');
        col.className = 'pick-side';
        col.innerHTML = '<span class="pick-label"></span>';
        col.querySelector('.pick-label').textContent = label;
        col.append(face);
        pair.append(col);
      };
      if (old) side('Yours', cardFace(old, 'held'));
      side(old ? 'New' : '', cardFace(id, 'new'));
      pair.classList.toggle('two', !!old);
      pick.querySelector('.no').textContent = old ? 'Keep yours' : 'Skip';
      pick.querySelector('.yes').textContent = old ? 'Swap' : 'Take';
      pick.querySelector('.no').addEventListener('click', () => finish(false));
      pick.querySelector('.yes').addEventListener('click', () => finish(old));
      pick.classList.add('on');
      pick.querySelector('.yes').focus();
    },
    /**
     * Your artifacts are lost (a knockout): each held card is tossed up out
     * of the inventory, about its own height, then falls away off the bottom
     * of the screen, tumbling, one just after another. `delay` seconds first.
     * (The hand itself empties as the game clears your cards.)
     */
    tossCards(delay = 0) {
      const R = CONFIG.render;
      const box = container.getBoundingClientRect();
      const chips = [...hand.querySelectorAll('.card-chip')];
      chips.forEach((chip, i) => {
        const r = chip.getBoundingClientRect();
        const c = chip.cloneNode(true);
        Object.assign(c.style, {
          position: 'absolute',
          left: `${r.left - box.left}px`,
          top: `${r.top - box.top}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
          margin: '0',
          zIndex: '7',
          pointerEvents: 'none',
        });
        container.appendChild(c);
        const mid = (chips.length - 1) / 2;
        const drift = (i - mid) * 34 + (Math.random() - 0.5) * 16; // fanning out a little
        const spin = (i - mid) * 40 + (Math.random() - 0.5) * 50;
        const fall = box.bottom - r.top + r.height * 1.5;
        c.animate(
          [
            { transform: 'translate(0, 0) rotate(0deg)', easing: 'cubic-bezier(0.2, 0.75, 0.4, 1)' },
            { transform: `translate(${drift * 0.4}px, ${-r.height * R.cardTossHeight}px) rotate(${spin * 0.35}deg)`, offset: 0.33, easing: 'cubic-bezier(0.55, 0, 0.9, 0.45)' },
            { transform: `translate(${drift}px, ${fall}px) rotate(${spin}deg)` },
          ],
          { duration: R.cardTossSeconds * 1000, delay: (delay + i * 0.09) * 1000, fill: 'both' },
        ).onfinish = () => c.remove();
      });
      // The real hand goes at once, so nothing is left behind the tossed copies.
      hand.innerHTML = '';
      hand.hidden = true;
      shownCards = '';
      showInventory();
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
    /** A big centre banner; `cause` is a small line under it saying what earned it (a bonus turn's "Combo Kill"). */
    banner(title, sub = '', seconds = 1.6, cause = '') {
      banner.innerHTML = `<strong></strong><span></span><em></em>`;
      banner.querySelector('strong').textContent = title;
      banner.querySelector('span').textContent = sub;
      banner.querySelector('em').textContent = cause;
      banner.querySelector('em').hidden = !cause;
      banner.hidden = false;
      banner.classList.remove('show');
      void banner.offsetWidth; // restart the entry animation
      banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => (banner.hidden = true), seconds * 1000);
    },
  };
}
