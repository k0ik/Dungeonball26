// HTML layer over the canvas for things that must always face the viewer:
// HP bars (one notch per HP; enemies' grow with max HP), "!" markers over
// enemies that can see the hero (pinned to the screen edge when the enemy is
// off screen), floating damage numbers, and the hero's gear icons (sword on
// the right, shield on the left). Positions come from projecting
// world points through the camera each frame.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SWORD_ICON, SWORD_BROKEN_ICON, SHIELD_ICON } from './icons.js';

const BAR_HEIGHT = 0.3; // tiles above the top of the ball
const ALERT_HEIGHT = 0.75; // tiles above the top of the ball
const EDGE_MARGIN = 18; // px kept clear at the screen edges for pinned markers
// px kept clear at the top: the gold, and the turn label under it (which ends
// at about 77px), so a "!" pinned to the top edge is never hidden behind them.
const TOP_RESERVED = 84;

export function createOverlay(container, camera) {
  const layer = document.createElement('div');
  layer.className = 'overlay';
  container.appendChild(layer);

  const bars = new Map(); // ball -> { el, fill, shown }
  const alerts = new Map(); // ball -> { el, on, acting }
  const floats = new Set(); // { el, x, y, z }: re-placed each frame so they stay on the world spot
  const v = new THREE.Vector3();
  const side = new THREE.Vector3();

  // Gear beside the hero: one slot each side.
  const gear = { ball: null, sword: makeGear('gear-icon sword'), shield: makeGear('gear-icon shield'), shown: '' };
  function makeGear(className) {
    const el = document.createElement('div');
    el.className = className;
    el.hidden = true;
    layer.appendChild(el);
    return el;
  }

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
    /**
     * Rising, fading label at a world point, e.g. "-1". With `follow` (a ball),
     * it rides above that ball as it moves instead of staying where it was made.
     */
    float(text, x, z, height, className = '', follow = null) {
      const el = document.createElement('div');
      el.className = `float ${className}`;
      el.textContent = text;
      layer.appendChild(el);
      const f = { el, x, y: height, z, follow };
      floats.add(f);
      place(el, x, height, z);
      el.addEventListener('animationend', () => {
        el.remove();
        floats.delete(f);
      });
    },
    /** Show the hero's gear: sword 'whole' | 'broken' | null, shield true/false. */
    setGear(ball, { sword, shield }) {
      gear.ball = ball;
      const key = `${sword}|${shield}`;
      if (key === gear.shown) return;
      gear.shown = key;
      gear.sword.hidden = !sword;
      gear.sword.innerHTML = sword === 'broken' ? SWORD_BROKEN_ICON : sword ? SWORD_ICON : '';
      gear.sword.title = sword === 'broken' ? 'Broken sword: +3 attack for one more hit' : 'Sword: +3 attack for two hits';
      gear.shield.hidden = !shield;
      gear.shield.innerHTML = shield ? SHIELD_ICON : '';
      gear.shield.title = 'Shield: blocks the next enemy hit';
    },
    update() {
      // Floating labels stay inside the view (below the HUD bar), so a value
      // earned near the edge is never lost off screen.
      for (const f of floats) {
        const p = f.follow ? toScreen(f.follow.x, f.y, f.follow.z) : toScreen(f.x, f.y, f.z);
        const half = f.el.offsetWidth / 2 + 4;
        placeAt(
          f.el,
          Math.min(layer.clientWidth - half, Math.max(half, p.left)),
          Math.min(layer.clientHeight - 8, Math.max(TOP_RESERVED + 2, p.top)),
        );
      }
      if (gear.ball && (!gear.sword.hidden || !gear.shield.hidden)) {
        // Beside the ball at its centre height, just clear of its edge on screen.
        const b = gear.ball;
        const c = toScreen(b.x, b.radius, b.z);
        side.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(b.radius);
        const e = toScreen(b.x + side.x, b.radius + side.y, b.z + side.z);
        const gap = Math.abs(e.left - c.left) + 13;
        gear.sword.style.transform = `translate(${(c.left + gap).toFixed(1)}px, ${c.top.toFixed(1)}px) translate(-50%, -50%)`;
        gear.shield.style.transform = `translate(${(c.left - gap).toFixed(1)}px, ${c.top.toFixed(1)}px) translate(-50%, -50%)`;
      }
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
