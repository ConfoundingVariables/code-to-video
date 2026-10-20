// Frame-by-frame renderer: headless Chromium seeks the page's master timeline,
// screenshots each frame, and pipes PNGs into ffmpeg. Frame ranges are split
// across workers (every frame is a pure function of t), then concatenated.
//
// usage: node render/render.mjs dist/a-million-hellos.html out/video.mp4
//          [--fps 60] [--workers 5] [--from 0] [--to <sec>] [--scale 1] [--stills 1,2.5,...]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const html = resolve(argv[0]);
const out = resolve(argv[1]);
const fps = +opt('fps', 60);
const workers = +opt('workers', 5);
const scale = +opt('scale', 1);
const stills = opt('stills', null);
const W = 1920, H = 1080;
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--force-color-profile=srgb', '--font-render-hinting=none'];

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('[console]', m.text()); });
  await page.goto('file://' + html + '?render=1');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  return page;
}

const browser = await chromium.launch({ args: GPU });
const probe = await openPage(browser);
const meta = await probe.evaluate(() => ({ duration: window.__duration, cues: window.__cues }));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(join(dirname(out), 'cues.json'), JSON.stringify({ duration: meta.duration, fps, cues: meta.cues }, null, 1));
console.log(`duration ${meta.duration.toFixed(2)}s, ${meta.cues.length} audio cues`);

if (stills) {
  for (const t of stills.split(',').map(Number)) {
    await probe.evaluate(t => window.seek(t), t);
    const p = join(dirname(out), `still-${String(t).padStart(6, '0')}.png`);
    await probe.screenshot({ path: p });
    console.log('still', p);
  }
  await browser.close();
  process.exit(0);
}
await probe.close();

const from = +opt('from', 0), to = Math.min(+opt('to', meta.duration), meta.duration);
const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
const total = f1 - f0;
const per = Math.ceil(total / workers);
const segDir = join(dirname(out), 'segments'); rmSync(segDir, { recursive: true, force: true }); mkdirSync(segDir, { recursive: true });
let done = 0; const t0 = Date.now();

async function worker(i) {
  const a = f0 + i * per, b = Math.min(f1, a + per);
  if (a >= b) return null;
  const seg = join(segDir, `seg-${String(i).padStart(2, '0')}.mp4`);
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
    '-tune', 'animation', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
  const page = await openPage(browser);
  const cdp = await page.context().newCDPSession(page);
  for (let f = a; f < b; f++) {
    await page.evaluate(t => window.seek(t), f / fps);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (++done % 120 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`${done}/${total} frames  ${(done / el).toFixed(1)} fps  eta ${((total - done) / (done / el)).toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
  await page.close();
  return seg;
}

const segs = (await Promise.all([...Array(workers)].map((_, i) => worker(i)))).filter(Boolean);
await browser.close();
writeFileSync(join(segDir, 'list.txt'), segs.map(s => `file '${s}'`).join('\n'));
await new Promise((res, rej) => spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(segDir, 'list.txt'), '-c', 'copy', out], { stdio: 'inherit' })
  .on('close', c => c === 0 ? res() : rej(new Error('concat ' + c))));
console.log(`rendered ${total} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
