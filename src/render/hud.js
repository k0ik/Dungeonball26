// Top HUD bar (design doc: "Camera, HUD and presentation"): a dark bar as in
// the mockup, with gold (the score) on the left and lives in the middle; key
// slots take the right in M6. (Gear is shown beside the hero instead.) Also
// shows short centred banners.

export function createHud(container) {
  const bar = document.createElement('div');
  bar.className = 'hud';
  bar.innerHTML = `<div class="hud-left"><span class="coin"></span><span class="hud-gold">0</span></div><div class="hud-lives" aria-label="Lives"></div><div class="hud-right"></div>`;
  container.appendChild(bar);
  const lives = bar.querySelector('.hud-lives');
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
    setLives(n, max) {
      lives.setAttribute('aria-label', `${n} of ${max} lives`);
      lives.innerHTML = Array.from({ length: Math.max(n, max) }, (_, i) => `<span class="life${i < n ? '' : ' lost'}"></span>`).join('');
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
