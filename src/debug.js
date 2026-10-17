import * as THREE from 'three';

// Debug overlay: current phase, hero state, and collision shapes on the ground.
// Toggle with the D key, or start with ?debug in the URL. Sight rays join in M4.
export function createDebug(scene) {
  const el = document.getElementById('debug');
  let on = new URLSearchParams(location.search).has('debug');
  const shapes = new THREE.Group();
  scene.add(shapes);
  const ringMat = new THREE.LineBasicMaterial({ color: 0x00ffcc });
  const circles = new Map();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') on = !on;
  });

  let frames = 0, fps = 0, last = performance.now();

  return {
    update({ phase, balls }) {
      frames++;
      const now = performance.now();
      if (now - last > 500) {
        fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
      }
      el.hidden = !on;
      shapes.visible = on;
      if (!on) return;
      for (const b of balls) {
        let c = circles.get(b);
        if (!c) {
          const pts = Array.from({ length: 33 }, (_, i) => {
            const a = (i / 32) * Math.PI * 2;
            return new THREE.Vector3(Math.cos(a) * b.radius, 0.02, Math.sin(a) * b.radius);
          });
          c = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
          circles.set(b, c);
          shapes.add(c);
        }
        c.position.set(b.x, 0, b.z);
      }
      const hero = balls.find((b) => b.kind === 'hero');
      el.textContent =
        `phase: ${phase}\nfps: ${fps}\n` +
        (hero ? `hero: ${hero.x.toFixed(2)}, ${hero.z.toFixed(2)}\nspeed: ${Math.hypot(hero.vx, hero.vz).toFixed(2)} t/s` : '');
    },
  };
}
