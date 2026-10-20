import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;
const DEFAULT_FPS = 30;
const FFMPEG_PROBE = process.env.FFPROBE ?? 'ffprobe';
const DEFAULT_INPUT = 'output/one-million-chat.mp4';

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, timeline: 'output/timeline.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inline] = arg.split('=', 2);
    const valueFor = () => {
      const value = inline ?? argv[++index];
      if (value === undefined) throw new Error(flag + ' requires a value');
      return value;
    };
    if (flag === '--input') options.input = valueFor();
    else if (flag === '--timeline') options.timeline = valueFor();
    else if (flag === '--help' || flag === '-h') {
      console.log('Usage: node production/verify.mjs [--input output/one-million-chat.mp4] [--timeline output/timeline.json]');
      process.exit(0);
    } else throw new Error('Unknown option: ' + arg);
  }
  return options;
}

async function loadTimeline(filename) {
  let content;
  try {
    content = await fs.readFile(filename, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${filename}: ${error.message}`);
  }
  let timeline;
  try {
    timeline = JSON.parse(content);
  } catch (error) {
    throw new Error(`Cannot parse ${filename}: ${error.message}`);
  }
  const fps = Number(timeline?.fps ?? timeline?.frameRate ?? timeline?.video?.fps ?? DEFAULT_FPS);
  let duration = Number(timeline?.duration ?? timeline?.totalDuration ?? timeline?.video?.duration);
  if (!Number.isFinite(duration) && Array.isArray(timeline?.scenes)) {
    const ends = timeline.scenes.map((scene) => Number(scene.end ?? scene.endTime ?? scene.to)).filter(Number.isFinite);
    if (ends.length) duration = Math.max(...ends);
  }
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`${filename} has no positive fps`);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${filename} has no positive duration`);
  return { fps, duration, timeline };
}

function runProbe(filename) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PROBE, [
      '-v', 'error',
      '-count_frames',
      '-show_entries', 'stream=index,codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,duration:format=duration',
      '-of', 'json',
      filename,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(`[ffprobe] ${text}`);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with ${signal ? `signal ${signal}` : `code ${code}`}${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`ffprobe returned invalid JSON: ${error.message}`));
      }
    });
  });
}

function ratio(value) {
  if (!value || value === '0/0' || value === 'N/A') return NaN;
  const [numerator, denominator] = String(value).split('/').map(Number);
  return denominator ? numerator / denominator : Number(value);
}

function closeEnough(actual, expected, tolerance) {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

async function verifyMedia(filename, expected) {
  try {
    await fs.access(filename);
  } catch {
    throw new Error(`Missing rendered MP4: ${filename}`);
  }
  const probe = await runProbe(filename);
  const streams = probe.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  if (!video) throw new Error('MP4 has no video stream');
  if (!audio) throw new Error('MP4 has no audio stream');
  if (video.codec_name !== 'h264') throw new Error(`Expected H.264 video, got ${video.codec_name ?? 'unknown'}`);
  if (Number(video.width) !== WIDTH || Number(video.height) !== HEIGHT) {
    throw new Error(`Expected ${WIDTH}x${HEIGHT} video, got ${video.width}x${video.height}`);
  }
  if (video.pix_fmt !== 'yuv420p') throw new Error(`Expected yuv420p video, got ${video.pix_fmt ?? 'unknown'}`);

  const expectedFrames = Math.ceil(expected.duration * expected.fps);
  const actualFrames = Number(video.nb_read_frames ?? video.nb_frames);
  if (!Number.isInteger(actualFrames) || actualFrames !== expectedFrames) {
    throw new Error(`Expected exactly ${expectedFrames} video frames, got ${video.nb_read_frames ?? video.nb_frames ?? 'unknown'}`);
  }
  const frameRate = ratio(video.avg_frame_rate ?? video.r_frame_rate);
  if (!closeEnough(frameRate, expected.fps, 0.001)) throw new Error(`Expected ${expected.fps}fps video, got ${video.avg_frame_rate ?? video.r_frame_rate}`);

  const expectedDuration = expectedFrames / expected.fps;
  const videoDuration = Number(video.duration);
  const formatDuration = Number(probe.format?.duration);
  const durationTolerance = Math.max(0.02, 1 / expected.fps);
  if (!closeEnough(videoDuration, expectedDuration, durationTolerance)) {
    throw new Error(`Video duration ${video.duration ?? 'unknown'}s differs from expected ${expectedDuration.toFixed(6)}s`);
  }
  if (Number.isFinite(formatDuration) && !closeEnough(formatDuration, expectedDuration, durationTolerance + 0.05)) {
    throw new Error(`Container duration ${formatDuration}s differs from expected ${expectedDuration.toFixed(6)}s`);
  }
  const audioDuration = Number(audio.duration);
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) throw new Error('Audio stream has no duration');
  if (!closeEnough(audioDuration, expectedDuration, Math.max(0.1, durationTolerance * 2))) {
    throw new Error(`Audio duration ${audio.duration ?? 'unknown'}s differs from expected ${expectedDuration.toFixed(6)}s`);
  }
  return { expectedFrames, expectedDuration, videoDuration, audioDuration, frameRate };
}

function browserArgs() {
  return [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--force-color-profile=srgb',
    '--disable-dev-shm-usage',
  ];
}

function launchBrowser() {
  const executablePath = process.env.BROWSER_EXECUTABLE_PATH;
  return chromium.launch({
    headless: true,
    args: browserArgs(),
    ...(executablePath ? { executablePath } : {}),
  });
}

function representativeTimes(duration, fps, timeline) {
  const candidates = [0, duration * 0.25, duration * 0.5, duration * 0.75, Math.max(0, duration - 1 / fps)];
  if (Array.isArray(timeline?.scenes)) {
    for (const scene of timeline.scenes) {
      const start = Number(scene.start ?? scene.startTime ?? scene.from);
      if (Number.isFinite(start)) candidates.push(start);
    }
  }
  return [...new Set(candidates.map((time) => Math.min(Math.max(0, time), Math.max(0, duration - 1 / fps))))].sort((a, b) => a - b);
}

async function verifyBrowser(root, expected) {
  const server = await startServer({ root, port: 0 });
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.stack ?? error.message}`));
  try {
    const response = await page.goto(`${server.url}film.html?render=1`, { waitUntil: 'load' });
    if (!response || !response.ok()) throw new Error(`film.html returned HTTP ${response?.status() ?? 'no response'}`);
    const metadata = await page.evaluate(async () => {
      if (!window.__FILM__ || typeof window.__FILM__.seek !== 'function' || typeof window.__FILM__.sceneAt !== 'function') {
        throw new Error('film.html must expose __FILM__={duration,fps,ready,seek,sceneAt}');
      }
      await window.__FILM__.ready;
      await document.fonts.ready;
      const visibleSurfaces = [...document.querySelectorAll('body *')].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
      }).length;
      const textLength = (document.body?.innerText ?? '').trim().length;
      const htmlLength = document.documentElement?.outerHTML?.length ?? 0;
      return {
        duration: Number(window.__FILM__.duration),
        fps: Number(window.__FILM__.fps),
        visibleSurfaces,
        textLength,
        htmlLength,
        viewport: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
      };
    });
    if (metadata.viewport[0] !== WIDTH || metadata.viewport[1] !== HEIGHT || metadata.viewport[2] !== 1) {
      throw new Error(`Unexpected browser viewport ${metadata.viewport.join('x')}`);
    }
    if (!closeEnough(metadata.duration, expected.duration, 1 / expected.fps) || !closeEnough(metadata.fps, expected.fps, 0.001)) {
      throw new Error(`film metadata ${metadata.duration}s @${metadata.fps}fps disagrees with timeline ${expected.duration}s @${expected.fps}fps`);
    }
    if (metadata.htmlLength < 200 || metadata.visibleSurfaces < 1) {
      throw new Error(`film.html has no non-empty visual surface (HTML ${metadata.htmlLength} chars, ${metadata.visibleSurfaces} visible surfaces)`);
    }

    const times = representativeTimes(expected.duration, expected.fps, expected.timeline);
    for (const time of times) {
      await page.evaluate(async (currentTime) => {
        await window.__FILM__.seek(currentTime);
        const scene = window.__FILM__.sceneAt(currentTime);
        if (scene === undefined || scene === null) throw new Error(`sceneAt(${currentTime}) returned no scene`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }, time);
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 35, animations: 'allow' });
      if (screenshot.byteLength < 1024) throw new Error(`seek(${time}) produced an unexpectedly empty screenshot`);
      if (consoleErrors.length) throw new Error(consoleErrors.join('\n'));
    }
    if (consoleErrors.length) throw new Error(consoleErrors.join('\n'));
    return { times, metadata };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const expected = await loadTimeline(path.resolve(root, options.timeline));
  const media = await verifyMedia(path.resolve(root, options.input), expected);
  const browser = await verifyBrowser(root, expected);
  console.log(`Verified ${options.input}`);
  console.log(`  video: ${media.expectedFrames} frames, ${media.videoDuration.toFixed(3)}s, ${media.frameRate.toFixed(3)}fps, H.264 ${WIDTH}x${HEIGHT} yuv420p`);
  console.log(`  audio: ${media.audioDuration.toFixed(3)}s`);
  console.log(`  browser seeks: ${browser.times.map((time) => `${time.toFixed(3)}s`).join(', ')}`);
  console.log(`  visual surfaces: ${browser.metadata.visibleSurfaces}, HTML: ${browser.metadata.htmlLength} chars`);
}

try {
  await main();
} catch (error) {
  console.error(`Verify failed: ${error.stack ?? error.message ?? error}`);
  process.exitCode = 1;
}
