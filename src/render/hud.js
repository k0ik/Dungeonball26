// Top HUD (design doc: "Camera, HUD and presentation"): no bar behind it,
// just gold (the score) outlined on the left; key slots take the right in M6.
// (Gear is shown beside the hero instead.) Also shows short centred banners
// and the death screen.

import { CONFIG } from '../config.js';

export function createHud(container) {
  const bar = document.createElement('div');
  bar.className = 'hud';
  bar.innerHTML = `<div class="hud-left"><span class="coin"></span><span class="hud-gold">0</span></div><div class="hud-right"></div>`;
  container.appendChild(bar);
  const gold = bar.querySelector('.hud-gold');
  let shownGold = -1;

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

  // Death screen: darkens everything (HUD included) and swallows input until
  // hidden, then lightens again.
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
      turn.classList.remove('show');
      void turn.offsetWidth;
      turn.classList.add('show');
    },
    /** Darken the screen and block input, with a title and a second line. */
    deathScreen(title, sub) {
      death.querySelector('strong').textContent = title;
      death.querySelector('span').textContent = sub;
      banner.hidden = true;
      death.classList.add('on');
    },
    hideDeathScreen() {
      death.classList.remove('on');
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
