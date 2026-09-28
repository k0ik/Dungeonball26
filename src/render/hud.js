// Top HUD (design doc: "Camera, HUD and presentation"): no bar behind it,
// just gold (the score) outlined on the left and the keys you hold on the
// right. (Gear is shown beside the hero instead.) Also shows short centred
// banners and the full-screen death / run-complete screen.

import { CONFIG } from '../config.js';
import { keyIcon } from './icons.js';

export function createHud(container) {
  const bar = document.createElement('div');
  bar.className = 'hud';
  bar.innerHTML = `<div class="hud-left"><span class="coin"></span><span class="hud-gold">0</span></div><div class="hud-right"></div>`;
  container.appendChild(bar);
  const gold = bar.querySelector('.hud-gold');
  const keySlots = bar.querySelector('.hud-right');
  let shownKeys = null;
  let shownGold = -1;

  // Low HP: a soft red glow around the screen's edge, slowly pulsing, while
  // you're one hit from a knockout.
  const edge = document.createElement('div');
  edge.className = 'danger-edge';
  container.appendChild(edge);
  let shownDanger = false;

  // "Player Turn" / "Enemy Turn": a small pill under the bar, always shown,
  // separate from the centre banner so the two never cover each other.
  const turn = document.createElement('div');
  turn.className = 'turn-label';
  turn.setAttribute('role', 'status');
  container.appendChild(turn);
  let shownTurn = '';

  // Turn toast: at each change of turn the same words appear big in the
  // middle of the screen for a moment, then shrink and fly up into the label,
  // so the change is hard to miss and you learn where the label lives.
  const toast = document.createElement('div');
  toast.className = 'turn-toast';
  toast.setAttribute('aria-hidden', 'true'); // the label already announces it
  container.appendChild(toast);

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
      turn.classList.remove('show');
      void turn.offsetWidth;
      turn.classList.add('show');
      if (!first) {
        toast.textContent = turn.textContent;
        toast.dataset.who = who;
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
    /** The keys you hold, as a list of colours ('red', 'blue', 'yellow'). */
    setKeys(keys) {
      const key = keys.join();
      if (key === shownKeys) return;
      shownKeys = key;
      keySlots.innerHTML = keys
        .map((c) => `<span class="key-slot" title="${c} key">${keyIcon(`#${CONFIG.colors.keys[c].toString(16).padStart(6, '0')}`)}</span>`)
        .join('');
      keySlots.setAttribute('aria-label', keys.length ? `Keys: ${keys.join(', ')}` : 'No keys');
    },
    /** Red screen edge on or off (low HP). */
    setDanger(on) {
      if (on === shownDanger) return;
      shownDanger = on;
      edge.classList.toggle('on', on);
    },
    /** Centred message for `seconds`; a second line is optional. */
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
