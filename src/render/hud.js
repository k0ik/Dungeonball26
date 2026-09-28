// Top HUD bar (design doc: "Camera, HUD and presentation"): a dark bar as in
// the mockup, with gold (the score) on the left, lives in the middle and gear
// on the right (key slots join it in M6). Also shows short centred banners.

const SWORD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3h4v4L10 18l-4-4Z" fill="#d4d7dc" stroke="#1e1f21" stroke-width="1.5" stroke-linejoin="round"/><path d="m5 13 6 6M7 17l-3 3" stroke="#ffc24a" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const SHIELD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5Z" fill="#3a86ff" stroke="#1e1f21" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 5v14" stroke="#9cc2ff" stroke-width="2"/></svg>`;

export function createHud(container) {
  const bar = document.createElement('div');
  bar.className = 'hud';
  bar.innerHTML = `<div class="hud-left"><span class="coin"></span><span class="hud-gold">0</span></div><div class="hud-lives" aria-label="Lives"></div><div class="hud-right"></div>`;
  container.appendChild(bar);
  const lives = bar.querySelector('.hud-lives');
  const gold = bar.querySelector('.hud-gold');
  const gear = bar.querySelector('.hud-right');
  let shownGold = -1;
  let shownGear = '';

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.hidden = true;
  container.appendChild(banner);
  let bannerTimer = 0;

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
    setGear({ sword, shield }) {
      const key = `${sword}|${shield}`;
      if (key === shownGear) return;
      shownGear = key;
      gear.innerHTML = `${sword ? `<span class="gear" title="Sword: +3 attack">${SWORD_ICON}</span>` : ''}${shield ? `<span class="gear" title="Shield: blocks the next hit">${SHIELD_ICON}</span>` : ''}`;
    },
    setLives(n, max) {
      lives.setAttribute('aria-label', `${n} of ${max} lives`);
      lives.innerHTML = Array.from({ length: Math.max(n, max) }, (_, i) => `<span class="life${i < n ? '' : ' lost'}"></span>`).join('');
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
