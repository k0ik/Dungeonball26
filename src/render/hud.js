// Top HUD bar (design doc: "Camera, HUD and presentation"): a dark bar as in
// the mockup. Lives sit in the middle for now; gold (M5) and key slots (M6)
// take the left and right. Also shows short centred banners ("Knocked out").

export function createHud(container) {
  const bar = document.createElement('div');
  bar.className = 'hud';
  bar.innerHTML = `<div class="hud-left"></div><div class="hud-lives" aria-label="Lives"></div><div class="hud-right"></div>`;
  container.appendChild(bar);
  const lives = bar.querySelector('.hud-lives');

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.hidden = true;
  container.appendChild(banner);
  let bannerTimer = 0;

  return {
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
