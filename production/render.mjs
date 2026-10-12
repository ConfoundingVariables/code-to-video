import { promises as fs } from 'node:fs';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;
const DEFAULT_FPS = 30;
const DEFAULT_WORKERS = 4;
const DEFAULT_OUTPUT = 'output/one-million-chat.mp4';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

function usage() {
  return `Usage: node production/render.mjs [options]

Options:
  --smoke              Render the first two seconds.
  --from <seconds>    Start at this timeline time (inclusive frame).
  --to <seconds>      Stop at this timeline time (exclusive frame).
  --workers <count>   Concurrent browser pages (default: RENDER_WORKERS or 4).
  --poster             Save representative frames and a contact sheet.
  --output <path>     Final MP4 path (default: output/one-million-chat.mp4).
`;
}

function parseNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${flag} requires a finite number, got ${value}`);
  return number;
}

function parseArgs(argv) {
  const options = {
    smoke: false,
    poster: false,
    from: null,
    to: null,
    output: DEFAULT_OUTPUT,
    workers: parseNumber(process.env.RENDER_WORKERS ?? DEFAULT_WORKERS, 'RENDER_WORKERS'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [inlineFlag, inlineValue] = arg.split('=', 2);
    const valueFor = (flag) => {
      if (inlineValue !== undefined) return inlineValue;
      const value = argv[++index];
      if (value === undefined) throw new Error(`${flag} requires a value`);
      return value;
    };
    switch (inlineFlag) {
      case '--smoke':
        options.smoke = true;
        break;
      case '--poster':
        options.poster = true;
        break;
      case '--from':
        options.from = parseNumber(valueFor('--from'), '--from');
        break;
      case '--to':
        options.to = parseNumber(valueFor('--to'), '--to');
        break;
      case '--workers':
        options.workers = parseNumber(valueFor('--workers'), '--workers');
        break;
      case '--output':
        options.output = valueFor('--output');
        break;
      case '--help':
      case '-h':
        console.log(usage());
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}\n${usage()}`);
    }
  }
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 32) {
    throw new Error(`workers must be an integer from 1 to 32, got ${options.workers}`);
  }
  if (options.from !== null && options.from < 0) throw new Error('--from must be non-negative');
  if (options.to !== null && options.to < 0) throw new Error('--to must be non-negative');
  return options;
}

function timelineInfo(timeline) {
  const fps = Number(timeline?.fps ?? timeline?.frameRate ?? timeline?.video?.fps ?? DEFAULT_FPS);
  let duration = Number(timeline?.duration ?? timeline?.totalDuration ?? timeline?.video?.duration);
  if (!Number.isFinite(duration) && Array.isArray(timeline?.scenes)) {
    const sceneEnds = timeline.scenes.map((scene) => Number(scene.end ?? scene.endTime ?? scene.to)).filter(Number.isFinite);
    if (sceneEnds.length) duration = Math.max(...sceneEnds);
  }
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('output/timeline.json must contain a positive fps');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('output/timeline.json must contain a positive duration in seconds');
  return { fps, duration };
}

async function readTimeline(filename) {
  let text;
  try {
    text = await fs.readFile(filename, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${filename}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse ${filename}: ${error.message}`);
  }
}

function frameCeil(time, fps) {
  // Keep exact values such as 2 * 30 from becoming frame 61 because of binary rounding.
  return Math.ceil(time * fps - 1e-9);
}

function buildFrameRange(options, duration, fps) {
  const from = options.from ?? 0;
  let to = options.to ?? duration;
  if (options.smoke && options.to === null) to = Math.min(to, from + 2);
  if (from >= duration) throw new Error(`--from ${from} is beyond the ${duration}s timeline`);
  to = Math.min(to, duration);
  if (to <= from) throw new Error(`render range must have --to greater than --from (got ${from} to ${to})`);
  const totalFrames = Math.ceil(duration * fps);
  const startFrame = Math.max(0, Math.min(totalFrames - 1, frameCeil(from, fps)));
  const endFrame = Math.max(startFrame + 1, Math.min(totalFrames, frameCeil(to, fps)));
  return {
    duration,
    fps,
    totalFrames,
    startFrame,
    endFrame,
    frameCount: endFrame - startFrame,
    startTime: startFrame / fps,
    endTime: endFrame / fps,
  };
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

function createFfmpegInput(label, fps, frameCount, filename) {
  const child = spawn(FFMPEG, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-framerate', String(fps),
    '-i', 'pipe:0',
    '-frames:v', String(frameCount),
    '-fps_mode', 'cfr',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    filename,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  let stdinError;
  child.stdin.on('error', (error) => { stdinError = error; });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr = `${stderr}${text}`.slice(-16_384);
    process.stderr.write(`[ffmpeg ${label}] ${text}`);
  });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg ${label} exited with ${signal ? `signal ${signal}` : `code ${code}`}: ${stderr.trim()}`));
    });
  });
  return {
    child,
    async write(buffer) {
      if (stdinError) throw stdinError;
      if (child.stdin.destroyed || child.exitCode !== null) throw new Error(`ffmpeg ${label} closed before receiving all frames`);
      if (!child.stdin.write(buffer)) {
        await Promise.race([once(child.stdin, 'drain'), done]);
        if (stdinError) throw stdinError;
      }
    },
    finish() {
      child.stdin.end();
      return done;
    },
    async abort() {
      child.stdin.destroy();
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      try {
        await done;
      } catch {
        // The original worker error is more useful than the expected termination error.
      }
    },
  };
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = `${stderr}${text}`.slice(-16_384);
      process.stderr.write(`[${label}] ${text}`);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with ${signal ? `signal ${signal}` : `code ${code}`}${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

async function openFilmPage(context, url, workerLabel) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = `[${workerLabel}] browser console.error: ${message.text()}`;
      console.error(text);
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (error) => {
    const text = `[${workerLabel}] page error: ${error.stack ?? error.message}`;
    console.error(text);
    consoleErrors.push(text);
  });
  await page.goto(`${url}film.html?render=1`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (!window.__FILM__ || typeof window.__FILM__.seek !== 'function') {
      throw new Error('film.html must expose window.__FILM__ with seek(t)');
    }
    await window.__FILM__.ready;
    await document.fonts.ready;
    if (window.innerWidth !== 1920 || window.innerHeight !== 1080 || window.devicePixelRatio !== 1) {
      throw new Error(`unexpected viewport ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`);
    }
  });
  if (consoleErrors.length) throw new Error(consoleErrors.join('\n'));
  return { page, consoleErrors };
}

async function renderChunk({ browser, baseUrl, fps, startFrame, endFrame, filename, abortState, workerIndex }) {
  const label = `worker ${workerIndex}`;
  let context;
  let page;
  let consoleErrors;
  let encoder;
  try {
    context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    ({ page, consoleErrors } = await openFilmPage(context, baseUrl, label));
    encoder = createFfmpegInput(label, fps, endFrame - startFrame, filename);
    abortState.processes.add(encoder);
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      if (abortState.error) throw abortState.error;
      const time = frame / fps;
      await page.evaluate(async (currentTime) => {
        await window.__FILM__.seek(currentTime);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }, time);
      if (abortState.error) throw abortState.error;
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 92, animations: 'disabled' });
      await encoder.write(screenshot);
      if (consoleErrors.length) throw new Error(consoleErrors.join('\n'));
    }
    await encoder.finish();
    return { startFrame, endFrame, frameCount: endFrame - startFrame, filename };
  } catch (error) {
    const failure = normalizeError(error);
    if (!abortState.error) {
      abortState.error = failure;
      for (const processHandle of abortState.processes) {
        if (processHandle !== encoder) await processHandle.abort();
      }
    }
    throw failure;
  } finally {
    if (encoder) {
      abortState.processes.delete(encoder);
      if (abortState.error) await encoder.abort();
    }
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
  }
}

function concatLine(filename) {
  // ffmpeg's concat demuxer accepts a single-quoted path with backslash-escaped quotes.
  const escaped = filename.replaceAll('\\', '\\\\').replaceAll("'", "'\\''");
  return `file '${escaped}'\n`;
}

async function concatenateSegments(segmentFiles, filename) {
  const listFile = `${filename}.concat.txt`;
  await fs.writeFile(listFile, segmentFiles.map(concatLine).join(''), 'utf8');
  try {
    await runCommand(FFMPEG, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c', 'copy', '-movflags', '+faststart', filename,
    ], 'ffmpeg concat');
  } finally {
    await fs.rm(listFile, { force: true });
  }
}

async function muxFinal({ videoFile, outputFile, audioFile, chaptersFile, startTime, duration, fullTimeline }) {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', videoFile,
    ...(startTime > 0 ? ['-ss', startTime.toFixed(9)] : []),
    '-i', audioFile,
  ];
  if (fullTimeline) args.push('-f', 'ffmetadata', '-i', chaptersFile);
  args.push(
    '-map', '0:v:0',
    '-map', '1:a:0',
    ...(fullTimeline ? ['-map_metadata', '2'] : ['-map_metadata', '-1']),
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', duration.toFixed(6),
    '-movflags', '+faststart',
    outputFile,
  );
  await runCommand(FFMPEG, args, 'ffmpeg mux');
}

async function capturePosters({ baseUrl, duration, fps, outputDir, timeline }) {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}film.html?render=1`, { waitUntil: 'load' });
    await page.evaluate(async () => {
      if (!window.__FILM__?.seek) throw new Error('film.html has no __FILM__.seek');
      await window.__FILM__.ready;
      await document.fonts.ready;
    });
    const sceneTimes = Array.isArray(timeline?.scenes)
      ? timeline.scenes.map((scene) => Number(scene.start ?? scene.startTime ?? scene.from)).filter(Number.isFinite)
      : [];
    const times = (sceneTimes.length ? sceneTimes : [0, 0.25, 0.5, 0.75, 0.999].map((fraction) => duration * fraction))
      .map((time) => Math.min(Math.max(0, time), Math.max(0, duration - 1 / fps)));
    const files = [];
    for (let index = 0; index < times.length; index += 1) {
      await page.evaluate(async (time) => {
        await window.__FILM__.seek(time);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }, times[index]);
      const filename = path.join(outputDir, `poster-${String(index + 1).padStart(3, '0')}.jpg`);
      await page.screenshot({ path: filename, type: 'jpeg', quality: 92, animations: 'disabled' });
      files.push(filename);
    }
    await runCommand(FFMPEG, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-framerate', '1', '-i', path.join(outputDir, 'poster-%03d.jpg'),
      '-vf', 'tile=3x5:padding=8:margin=8',
      '-frames:v', '1', '-q:v', '2',
      path.join(outputDir, 'poster-contact-sheet.jpg'),
    ], 'ffmpeg poster');
    console.log(`Poster frames: ${files.join(', ')}\nContact sheet: ${path.join(outputDir, 'poster-contact-sheet.jpg')}`);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const outputDir = path.resolve(root, 'output');
  const timelineFile = path.join(outputDir, 'timeline.json');
  const timeline = await readTimeline(timelineFile);
  const { fps, duration } = timelineInfo(timeline);
  const range = buildFrameRange(options, duration, fps);
  const workers = Math.min(options.workers, range.frameCount);
  const segmentDir = path.join(outputDir, 'segments');
  await fs.mkdir(segmentDir, { recursive: true });
  await fs.rm(segmentDir, { recursive: true, force: true });
  await fs.mkdir(segmentDir, { recursive: true });

  const server = await startServer({ root, port: 0 });
  let browser;
  try {
    browser = await launchBrowser();
    const abortState = { error: null, processes: new Set() };
    const chunks = [];
    for (let index = 0; index < workers; index += 1) {
      const chunkStart = range.startFrame + Math.floor(index * range.frameCount / workers);
      const chunkEnd = range.startFrame + Math.floor((index + 1) * range.frameCount / workers);
      chunks.push({
        workerIndex: index,
        startFrame: chunkStart,
        endFrame: chunkEnd,
        filename: path.join(segmentDir, `segment-${String(index).padStart(3, '0')}.mp4`),
      });
    }
    console.log(`Rendering ${range.frameCount} frames at ${fps}fps (${range.startTime.toFixed(3)}s–${range.endTime.toFixed(3)}s) with ${workers} workers`);
    const results = await Promise.all(chunks.map((chunk) => renderChunk({
      browser,
      baseUrl: server.url,
      fps,
      ...chunk,
      abortState,
    })));
    results.sort((a, b) => a.startFrame - b.startFrame);
    const renderedFrames = results.reduce((sum, result) => sum + result.frameCount, 0);
    if (renderedFrames !== range.frameCount) throw new Error(`renderer wrote ${renderedFrames} frames; expected ${range.frameCount}`);

    const videoOnly = path.join(outputDir, range.startFrame === 0 && range.endFrame === range.totalFrames ? 'video-only.mp4' : 'preview-video-only.mp4');
    await concatenateSegments(results.map((result) => result.filename), videoOnly);
    const audioFile = path.join(outputDir, 'master.wav');
    const chaptersFile = path.join(outputDir, 'chapters.ffmeta');
    try {
      await fs.access(audioFile);
      await fs.access(chaptersFile);
    } catch {
      throw new Error(`Missing mux input. Expected ${audioFile} and ${chaptersFile}`);
    }
    const fullTimeline = range.startFrame === 0 && range.endFrame === range.totalFrames;
    const defaultOutput = fullTimeline ? DEFAULT_OUTPUT : 'output/one-million-chat-preview.mp4';
    const finalOutput = path.resolve(root, options.output === DEFAULT_OUTPUT ? defaultOutput : options.output);
    await fs.mkdir(path.dirname(finalOutput), { recursive: true });
    await muxFinal({
      videoFile: videoOnly,
      outputFile: finalOutput,
      audioFile,
      chaptersFile,
      startTime: range.startTime,
      duration: range.frameCount / fps,
      fullTimeline,
    });
    console.log(`Wrote ${finalOutput} (${range.frameCount} frames, ${(range.frameCount / fps).toFixed(3)}s)`);
    if (options.poster) await capturePosters({ baseUrl: server.url, duration, fps, outputDir, timeline });
  } finally {
    await browser?.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

try {
  await main();
} catch (error) {
  console.error(`Render failed: ${error.stack ?? error.message ?? error}`);
  process.exitCode = 1;
}
