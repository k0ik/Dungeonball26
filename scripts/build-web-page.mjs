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

const page = `<meta charset="utf-8">
<title>Dungeonball</title>
<meta name="theme-color" content="#0c0a10">
<style>
:root { color-scheme: dark; }
html, body { height: 100%; }
${css}
</style>
<div id="game"></div>
<script type="module">
${js}
</script>
`;
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} kB)`);
