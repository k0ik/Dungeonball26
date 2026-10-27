// Camera view presets (CONFIG.camera.viewPresets), for comparing angles: the
// choice is kept in the URL hash (#level-id:view2) and in localStorage, and is
// applied to CONFIG.camera before the game builds its camera. Switching reloads
// the page on the level you're on, since every view (faces, aim marks, the
// camera) is built for one angle.
import { CONFIG } from './config.js';

const KEY = 'dungeonball.view';

/** The preset index in use: from the hash, else storage, else 0. */
export function currentView() {
  const n = CONFIG.camera.viewPresets.length;
  const m = /:view(\d+)$/.exec(location.hash);
  let i = m ? Number(m[1]) : NaN;
  if (Number.isNaN(i)) {
    try {
      i = Number(localStorage.getItem(KEY) ?? 0);
    } catch {
      i = 0;
    }
  }
  return Number.isInteger(i) && i >= 0 && i < n ? i : 0;
}

/** Set CONFIG.camera's angle from the current preset. Returns the preset. */
export function applyView() {
  const p = CONFIG.camera.viewPresets[currentView()];
  CONFIG.camera.elevationDeg = p.elevationDeg;
  CONFIG.camera.yawDeg = p.yawDeg;
  return p;
}

/** The level id in the hash, without any view suffix. */
export const hashLevel = () => location.hash.replace(/:view\d+$/, '');

/** Move to the next preset and reload on level `levelId`. */
export function nextView(levelId) {
  const i = (currentView() + 1) % CONFIG.camera.viewPresets.length;
  try {
    localStorage.setItem(KEY, String(i));
  } catch {
    // no storage: the hash still carries it
  }
  location.hash = `#${levelId}:view${i}`;
  location.reload();
}
