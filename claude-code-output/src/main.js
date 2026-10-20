import { master, cues, seek, frameHooks } from './core.js';
import { createWorld } from './world.js';
import { buildScenes } from './scenes.js';

const RENDER = new URLSearchParams(location.search).has('render');

async function boot() {
  const faces = ['500 40px Barlow', '600 40px Barlow', '700 100px "Barlow Condensed"', '800 100px "Barlow Condensed"', '600 30px "Barlow Semi Condensed"', '500 30px "Barlow Condensed"'];
  await Promise.all(faces.map(f => document.fonts.load(f)));
  await document.fonts.ready;

  const world = createWorld(document.getElementById('gl'));
  frameHooks.unshift(t => world.render(t));
  const duration = buildScenes(world);

  window.__duration = duration;
  window.__cues = cues.sort((a, b) => a.t - b.t);
  window.seek = seek;
  await seek(0);
  window.__ready = true;
  if (!RENDER) player(duration);
}

// Live playback for opening the file directly: fit-to-window, play/pause, scrub.
function player(duration) {
  const stage = document.getElementById('stage'), ui = document.getElementById('player');
  const btn = document.getElementById('play'), scrub = document.getElementById('scrub'), clock = document.getElementById('clock');
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`; };
  fit(); addEventListener('resize', fit);
  ui.hidden = false;
  const audio = document.getElementById('soundtrack');
  let playing = false, t = 0, last = 0, busy = false;
  const setPlaying = p => {
    playing = p; btn.textContent = p ? 'Pause' : 'Play';
    if (audio) { if (p) { audio.currentTime = t; audio.play().catch(() => {}); } else audio.pause(); }
    last = performance.now();
  };
  btn.onclick = () => setPlaying(!playing);
  addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); setPlaying(!playing); } });
  scrub.oninput = () => { t = (scrub.value / 1000) * duration; if (audio) audio.currentTime = t; render(); };
  async function render() {
    if (busy) return; busy = true;
    await seek(t); busy = false;
    clock.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  }
  (function loop(now) {
    if (playing) {
      t = audio && !audio.paused ? audio.currentTime : t + (now - last) / 1000;
      last = now;
      if (t >= duration) { t = 0; setPlaying(false); }
      scrub.value = (t / duration) * 1000;
      render();
    }
    requestAnimationFrame(loop);
  })(performance.now());
  // with the embedded soundtrack, wait for a click so picture and sound start together
  if (!audio && !matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true);
}

boot();
