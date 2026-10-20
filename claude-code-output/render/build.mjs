// Bundles src/ into ONE self-contained HTML file: JS (GSAP + Three.js + scenes)
// via esbuild, CSS inlined, fonts embedded as base64 data URIs.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const src = p => resolve(root, 'src', p);

const js = await build({
  entryPoints: [src('main.js')], bundle: true, format: 'iife', minify: true,
  write: false, target: 'chrome120', legalComments: 'none',
});

const css = readFileSync(src('style.css'), 'utf8').replace(/url\(["']?\.\/fonts\/([^"')]+)["']?\)/g, (_, f) =>
  `url(data:font/woff2;base64,${readFileSync(src('fonts/' + f)).toString('base64')})`);

const html = readFileSync(src('index.html'), 'utf8')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js.outputFiles[0].text.replace(/<\/script/g, '<\\/script'))
  // the synthesized soundtrack rides along inside the same file, for live playback
  .replace('</body>', () => existsSync(resolve(root, 'out/soundtrack.m4a'))
    ? `<audio id="soundtrack" preload="auto" src="data:audio/mp4;base64,${readFileSync(resolve(root, 'out/soundtrack.m4a')).toString('base64')}"></audio>\n</body>`
    : '</body>');

mkdirSync(resolve(root, 'dist'), { recursive: true });
const out = resolve(root, 'dist/a-million-hellos.html');
writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} KB`);
