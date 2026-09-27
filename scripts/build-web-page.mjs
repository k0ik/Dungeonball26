// Bundle the game into one self-contained HTML page (all JS/CSS inlined) for
// sharing as a playable snapshot. Usage: npm run build:page -- <output.html>

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'dist/dungeonball.html');
execSync('npx vite build --logLevel warn', { stdio: 'inherit' });

const assets = join('dist', 'assets');
const files = readdirSync(assets);
const read = (ext) => files.filter((f) => f.endsWith(ext)).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
// An inline script must not contain a literal closing script tag.
const js = read('.js').replace(/<\/script/gi, '<\\/script');
const css = read('.css');

const page = `<title>Dungeonball</title>
<meta name="theme-color" content="#0c0a10">
<style>
:root { color-scheme: dark; }
html, body { height: 100%; }
${css}
.hint {
  position: absolute; top: 14px; left: 16px; right: 16px; margin: 0;
  font: 500 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #e4e5e8; text-align: center; letter-spacing: 0.01em;
  padding: 8px 12px; border-radius: 8px; background: rgba(24, 25, 28, 0.78);
  pointer-events: none; transition: opacity 0.6s;
}
.hint b { color: #ffd166; font-weight: 600; }
.hint.gone { opacity: 0; }
</style>
<div id="game"><p class="hint" id="hint"><b>Press on the ball</b>, drag back, release to shoot.<br>Let go near the ball to cancel. The green exit loops you back to the start.<br>Keys: <b>r</b> respawn, <b>d</b> debug.</p></div>
<script type="module">
${js}
</script>
<script>
(function watchFirstShot() {
  var hint = document.getElementById('hint');
  function tick() {
    var g = window.game;
    if (g && g.state && g.state.shots > 0) { hint.classList.add('gone'); return; }
    requestAnimationFrame(tick);
  }
  tick();
})();
</script>
`;
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} kB)`);
