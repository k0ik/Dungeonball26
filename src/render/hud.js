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

  // Enemy turn: a soft red glow around the screen's edge, fading in and out
  // with the "Enemy Turn" label.
  const edge = document.createElement('div');
  edge.className = 'enemy-edge';
  container.appendChild(edge);

  // "Player Turn" / "Enemy Turn": a small pill under the bar, always shown,
  // separate from the centre banner so the two never cover each other.
  const turn = document.createElement('div');
  turn.className = 'turn-label';
  turn.setAttribute('role', 'status');
  container.appendChild(turn);
  let shownTurn = '';

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
      shownTurn = who;
      turn.textContent = who === 'enemy' ? 'Enemy Turn' : 'Player Turn';
      turn.dataset.who = who;
      edge.classList.toggle('on', who === 'enemy');
      turn.classList.remove('show');
      void turn.offsetWidth;
      turn.classList.add('show');
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
