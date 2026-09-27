// HTML layer over the canvas for things that must always face the viewer:
// enemy HP bars (one notch per HP, longer for tougher enemies) and floating
// damage numbers.
// Positions come from projecting world points through the camera each frame.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const BAR_HEIGHT = 0.3; // tiles above the top of the ball

export function createOverlay(container, camera) {
  const layer = document.createElement('div');
  layer.className = 'overlay';
  container.appendChild(layer);

  const bars = new Map();
  const floats = new Set(); // { el, x, y, z }: re-placed each frame so they stay on the world spot
  const v = new THREE.Vector3();

  function toScreen(x, y, z) {
    v.set(x, y, z).project(camera);
    return { left: ((v.x + 1) / 2) * layer.clientWidth, top: ((1 - v.y) / 2) * layer.clientHeight };
  }

  function place(el, x, y, z) {
    const p = toScreen(x, y, z);
    el.style.transform = `translate(${p.left.toFixed(1)}px, ${p.top.toFixed(1)}px) translate(-50%, -100%)`;
  }

  return {
    addBar(ball) {
      const el = document.createElement('div');
      el.className = 'enemy-tag';
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
    },
    clearBars() {
      for (const ball of [...bars.keys()]) this.removeBar(ball);
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
    },
  };
}
