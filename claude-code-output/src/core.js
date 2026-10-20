// Core: one paused GSAP master timeline is the single source of time.
// Everything else (Three.js, scroll-driven CSS, View Transitions, audio cues)
// is derived from it, so any frame can be rendered in isolation via seek(t).
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { TextPlugin } from 'gsap/TextPlugin';

gsap.registerPlugin(CustomEase, SplitText, DrawSVGPlugin, MotionPathPlugin, ScrambleTextPlugin, TextPlugin);
gsap.ticker.lagSmoothing(0);
gsap.config({ force3D: true });

// House easing. "arrive" = expo-like deceleration for confident entrances,
// "move" = symmetric for things travelling between two known points,
// "leave" = exits, still decelerating (no ease-in anywhere), and shorter.
CustomEase.create('arrive', 'M0,0 C0.16,1 0.3,1 1,1');
CustomEase.create('settle', 'M0,0 C0.23,1 0.32,1 1,1');
CustomEase.create('move', 'M0,0 C0.77,0 0.175,1 1,1');
CustomEase.create('leave', 'M0,0 C0.3,0 0.2,1 1,1'); // exits: still ease-out, just shorter
CustomEase.create('anticipate', 'M0,0 C0.36,0 0.66,-0.56 1,1'); // pulls back before going

export { gsap, SplitText };
export const BPM = 120, BEAT = 0.5, BAR = 2;
export const master = gsap.timeline({ paused: true, defaults: { ease: 'arrive', duration: 0.6 } });

// ---- audio cue registry: the soundtrack is synthesized from this list
export const cues = [];
export const cue = (t, type, p = {}) => cues.push({ t: Math.round(t * 1000) / 1000, type, ...p });
export const section = (t, chord, energy, extra = {}) => cue(t, 'section', { chord, energy, ...extra });

// ---- per-frame hooks (Three.js render, projected labels ...)
export const frameHooks = [];

// ---- deterministic randomness
export function rng(seed = 1) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- View Transitions, made seekable.
// A transition is {t0, dur, from, to, apply(state)}. Outside its window we just
// apply() the right state. Inside it, we start a real document.startViewTransition,
// then pause every ::view-transition-* animation and set its currentTime from t.
export const viewTransitions = [];
let active = null;
const raf = () => new Promise(r => requestAnimationFrame(() => r()));

function stateAt(t) {
  const groups = new Map();
  for (const v of [...viewTransitions].sort((a, b) => a.t0 - b.t0)) {
    if (!groups.has(v.apply)) groups.set(v.apply, v.from);
    if (t >= v.t0) groups.set(v.apply, v.to);
  }
  return groups;
}

async function syncViewTransitions(t) {
  const want = viewTransitions.find(v => t >= v.t0 && t < v.t0 + v.dur) || null;
  if (active && active.def !== want) {
    active.vt.skipTransition();
    await active.vt.finished.catch(() => {});
    active = null;
  }
  if (!want) {
    for (const [apply, s] of stateAt(t)) apply(s);
    return;
  }
  if (!active) {
    for (const [apply, s] of stateAt(want.t0 - 1e-4)) apply(s);
    await raf();
    const vt = document.startViewTransition(() => want.apply(want.to));
    active = { def: want, vt };
    await vt.ready;
  }
  const local = (t - want.t0) * 1000;
  for (const a of document.getAnimations()) {
    if (!a.effect?.pseudoElement?.startsWith('::view-transition')) continue;
    a.pause();
    a.effect.updateTiming({ duration: want.dur * 1000, easing: want.easing || 'cubic-bezier(0.16,1,0.3,1)' });
    a.currentTime = local;
  }
}

export async function seek(t) {
  master.seek(t, true);
  for (const h of frameHooks) h(t);
  await syncViewTransitions(t);
  await raf(); await raf();
}
