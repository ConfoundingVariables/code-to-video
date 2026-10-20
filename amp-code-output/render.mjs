import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const CHROME = process.env.CHROME || '/home/user/.agent-browser/browsers/chrome-155.0.8059.39/chrome';
const html = path.resolve(args.html || 'dist/one-million-hellos.html');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('page:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.evaluateOnNewDocument(() => { window.__RENDER__ = true; });
await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 120000, polling: 100 });
const { duration, fps, cues } = await page.evaluate(() => ({ duration: window.__duration, fps: window.__fps, cues: window.__cues }));
fs.mkdirSync('audio', { recursive: true });
fs.writeFileSync('audio/cues.json', JSON.stringify({ duration, fps, cues }, null, 1));
const cdp = await page.createCDPSession();
const shot = async (format, quality) => Buffer.from((await cdp.send('Page.captureScreenshot', { format, quality, optimizeForSpeed: true })).data, 'base64');

if (args.at) {
  const dir = args.out || 'out/stills';
  fs.mkdirSync(dir, { recursive: true });
  const times = String(args.at).split(',').map(Number);
  for (const t of times) {
    await page.evaluate((x) => window.__seek(x), t);
    fs.writeFileSync(`${dir}/t${t.toFixed(2).padStart(6, '0')}.png`, await shot('png'));
  }
  console.log(`stills: ${times.length} -> ${dir}`);
} else {
  const from = Math.round((+args.from || 0) * fps);
  const to = Math.round((+args.to || duration) * fps);
  const out = args.out || 'out/video.mp4';
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
  const t0 = Date.now();
  for (let f = from; f < to; f++) {
    await page.evaluate((x) => window.__seek(x), f / fps);
    await write(await shot('jpeg', 95));
    if ((f - from) % 150 === 0) {
      const done = f - from + 1;
      const rate = (Date.now() - t0) / done;
      console.log(`frame ${f}/${to}  ${(rate).toFixed(0)} ms/frame  eta ${((to - f) * rate / 60000).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`video: ${out} (${to - from} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
await browser.close();
