// HTML layer over the canvas for things that must always face the viewer:
// HP bars (one notch per HP; enemies' grow with max HP), "!" markers over
// enemies that can see the hero (pinned to the screen edge when the enemy is
// off screen), and floating damage numbers. Positions come from projecting
// world points through the camera each frame.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const BAR_HEIGHT = 0.3; // tiles above the top of the ball
const ALERT_HEIGHT = 0.75; // tiles above the top of the ball
const EDGE_MARGIN = 18; // px kept clear at the screen edges for pinned markers
const TOP_RESERVED = 56; // px under the HUD bar

export function createOverlay(container, camera) {
  const layer = document.createElement('div');
  layer.className = 'overlay';
  container.appendChild(layer);

  const bars = new Map(); // ball -> { el, fill, shown }
  const alerts = new Map(); // ball -> { el, on, acting }
  const floats = new Set(); // { el, x, y, z }: re-placed each frame so they stay on the world spot
  const v = new THREE.Vector3();

  function toScreen(x, y, z) {
    v.set(x, y, z).project(camera);
    return { left: ((v.x + 1) / 2) * layer.clientWidth, top: ((1 - v.y) / 2) * layer.clientHeight };
  }

  function placeAt(el, left, top) {
    el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -100%)`;
  }

  function place(el, x, y, z) {
    const p = toScreen(x, y, z);
    placeAt(el, p.left, p.top);
  }

  function removeAlert(ball) {
    alerts.get(ball)?.el.remove();
    alerts.delete(ball);
  }

  return {
    /** HP bar over a ball; `variant` 'hero' draws it green like the mockup. */
    addBar(ball, variant = 'enemy') {
      const el = document.createElement('div');
      el.className = `tag ${variant}`;
      el.innerHTML = `<span class="hp"><span class="fill"></span></span>`;
      const hp = el.querySelector('.hp');
      hp.style.setProperty('--segments', ball.maxHp);
      hp.style.width = `${Math.max(CONFIG.render.hpBarMinPx, CONFIG.render.hpBarPxPerHp * ball.maxHp)}px`;
      layer.appendChild(el);
      bars.set(ball, { el, fill: el.querySelector('.fill'), shown: -1 });
    },
    removeBar(ball) {
      bars.get(ball)?.el.remove();
      bars.delete(ball);
      removeAlert(ball);
    },
    /** Remove every enemy's bar and marker (the hero's bar stays). */
    clearEnemies(hero) {
      for (const ball of [...bars.keys()]) if (ball !== hero) this.removeBar(ball);
      for (const ball of [...alerts.keys()]) removeAlert(ball);
    },
    /** Show or hide an enemy's "!"; `acting` makes it pulse while it takes its turn. */
    setAlert(ball, on, acting = false) {
      let a = alerts.get(ball);
      if (!a) {
        const el = document.createElement('div');
        el.className = 'alert';
        // The pulse animates the inner span: scaling the positioned element
        // itself would also scale its screen position.
        el.innerHTML = '<span>!</span>';
        el.hidden = true;
        layer.appendChild(el);
        a = { el, on: false, acting: false };
        alerts.set(ball, a);
      }
      if (a.on !== on) {
        a.on = on;
        a.el.hidden = !on;
      }
      if (a.acting !== acting) {
        a.acting = acting;
        a.el.classList.toggle('acting', acting);
      }
    },
    /** Rising, fading label at a world point, e.g. "-1". */
    float(text, x, z, height, className = '') {
      const el = document.createElement('div');
      el.className = `float ${className}`;
      el.textContent = text;
      layer.appendChild(el);
      const f = { el, x, y: height, z };
      floats.add(f);
      place(el, x, height, z);
      el.addEventListener('animationend', () => {
        el.remove();
        floats.delete(f);
      });
    },
    update() {
      for (const f of floats) place(f.el, f.x, f.y, f.z);
      for (const [ball, bar] of bars) {
        place(bar.el, ball.x, ball.radius * 2 + BAR_HEIGHT, ball.z);
        if (bar.shown !== ball.hp) {
          bar.shown = ball.hp;
          bar.fill.style.width = `${(100 * ball.hp) / ball.maxHp}%`;
        }
      }
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      for (const [ball, a] of alerts) {
        if (!a.on) continue;
        const p = toScreen(ball.x, ball.radius * 2 + ALERT_HEIGHT, ball.z);
        // Off screen: pin to the nearest edge so the watcher is never a surprise.
        const left = Math.min(w - EDGE_MARGIN, Math.max(EDGE_MARGIN, p.left));
        const top = Math.min(h - EDGE_MARGIN, Math.max(TOP_RESERVED + EDGE_MARGIN, p.top));
        const pinned = left !== p.left || top !== p.top;
        a.el.classList.toggle('edge', pinned);
        placeAt(a.el, left, pinned ? top + 12 : top);
      }
    },
  };
}
