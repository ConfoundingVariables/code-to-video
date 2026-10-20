import { build } from 'esbuild';
import fs from 'fs';
import { spring } from 'motion';

const b64 = (p) => fs.readFileSync(p).toString('base64');
const DURATION = 136;

const bundle = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'chrome120', legalComments: 'none' });
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const credits = JSON.parse(fs.readFileSync('src/credits.json', 'utf8'))
  .map(([title, by]) => `<div class="c">${title}<em>${by}</em></div>`).join('');

let html = fs.readFileSync('src/index.html', 'utf8');
for (const f of ['sofia-xc', 'sofia-c', 'martian']) html = html.replace(`__FONT_${f}__`, `data:font/woff2;base64,${b64(`src/fonts/${f}.woff2`)}`);
html = html
  .replace('__GRAIN__', `data:image/webp;base64,${b64('src/grain.webp')}`)
  .replace('__SPRING_SEAT__', String(spring(0.45, 0.22)))
  .replace('__SPRING_SPLIT__', String(spring(0.6, 0.12)))
  .replace('__DURATION__', String(DURATION))
  .replace('__CREDITS__', credits);

const audioPath = process.argv[2];
if (audioPath && fs.existsSync(audioPath)) {
  html = html.replace('</body>', `<audio id="track" preload="auto" src="data:audio/mp4;base64,${b64(audioPath)}"></audio>\n</body>`);
}
html = html.replace('__BUNDLE__', () => js);

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/one-million-hellos.html', html);
console.log(`dist/one-million-hellos.html ${(html.length / 1024).toFixed(0)} KB`);
