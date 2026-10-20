import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { CustomEase } from 'gsap/CustomEase';
import lottie from 'lottie-web/build/player/lottie_svg';
import { createSector, mulberry32, HUBS } from './sector.js';
import { typingLottie } from './typing.js';

gsap.registerPlugin(SplitText, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, CustomEase);

const DURATION = 136;
const FPS = 30;
const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const NS = 'http://www.w3.org/2000/svg';

CustomEase.create('out', '0.23,1,0.32,1');
CustomEase.create('inout', '0.77,0,0.175,1');

const cues = [];
const cue = (t, k, extra = {}) => cues.push({ t: +t.toFixed(3), k, ...extra });

function springEase(name, cssValue) {
  const m = cssValue.match(/([\d.]+)ms\s+linear\(([^)]*)\)/);
  const dur = +m[1] / 1000;
  const vals = m[2].split(',').map((s) => parseFloat(s));
  const n = vals.length - 1;
  CustomEase.create(name, 'M0,0 ' + vals.map((v, i) => `L${(i / n).toFixed(4)},${v.toFixed(4)}`).join(' '));
  const cross = vals.findIndex((v) => v >= 1);
  return { dur, cross: (cross / n) * dur };
}

function rectIn(el) {
  let x = 0, y = 0;
  const w = el.offsetWidth, h = el.offsetHeight;
  for (let n = el; n && n.id !== 'root'; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

function catmull(p) {
  const f = (v) => v.toFixed(1);
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

function roughRing(r, seed, pad = 18) {
  const rnd = mulberry32(seed);
  const rx = r.w / 2 + pad, ry = r.h / 2 + pad * 0.9;
  const a0 = -Math.PI * 0.8 + (rnd() - 0.5) * 0.5;
  const pts = [];
  const N = 36;
  for (let i = 0; i <= N * 1.13; i++) {
    const a = a0 + (i / N) * Math.PI * 2;
    const k = 1 + (rnd() - 0.5) * 0.04 + (i / N) * 0.06;
    pts.push([r.cx + Math.cos(a) * rx * k, r.cy + Math.sin(a) * ry * k]);
  }
  return catmull(pts);
}

function roughLine(x1, y1, x2, y2, seed, wobble = 4) {
  const rnd = mulberry32(seed);
  const pts = [];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const steps = Math.max(3, Math.round(len / 60));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const j = i === 0 || i === steps ? 0 : (rnd() - 0.5) * wobble;
    pts.push([x1 + (x2 - x1) * f + nx * j, y1 + (y2 - y1) * f + ny * j]);
  }
  return catmull(pts);
}

function svgEl(parent, tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.appendChild(el);
  return el;
}

function div(parent, cls, html, style = '') {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  el.style.cssText = style;
  parent.appendChild(el);
  return el;
}

function proxy(set, initial = 0) {
  let v = initial;
  return { get v() { return v; }, set v(x) { v = x; set(x); } };
}

async function build() {
  await document.fonts.ready;
  const tl = gsap.timeline({ paused: true });
  const rootStyle = getComputedStyle(document.documentElement);
  const SEAT = springEase('seat', rootStyle.getPropertyValue('--spring-seat'));

  const sector = createSector($('#chart'));
  const state = { users: 1, chart: 0, reveal: 0 };

  const chart = proxy((x) => { state.chart = x; $('#chart').style.opacity = x; }, 0);
  const reveal = proxy((x) => { state.reveal = x; }, 0);
  const countEl = $('#count');
  const users = proxy((x) => { state.users = x; countEl.textContent = fmt(x); }, 1);
  let usersAt = 1;
  const grow = (to, t, d) => {
    tl.fromTo(users, { v: usersAt }, { v: to, duration: d, ease: 'power2.inOut', immediateRender: false }, t);
    cue(t, 'count', { d });
    usersAt = to;
  };

  const SRC = [''];
  const srcEl = $('#src');
  const srcIdx = proxy((x) => { srcEl.textContent = SRC[Math.round(x)] || ''; }, 0);
  const source = (text, t) => {
    SRC.push(text);
    tl.to(srcEl, { opacity: 0, duration: 0.25, ease: 'power2.in' }, t - 0.3);
    tl.set(srcIdx, { v: SRC.length - 1 }, t - 0.05);
    tl.to(srcEl, { opacity: 1, duration: 0.5, ease: 'out' }, t);
  };

  const seat = (el, t, dist = 280, slot = true) => {
    gsap.set(el, { x: dist, opacity: 0 });
    tl.to(el, { x: 0, duration: SEAT.dur, ease: 'seat' }, t);
    tl.to(el, { opacity: 1, duration: 0.22, ease: 'power1.out' }, t);
    if (slot) cue(t + SEAT.cross, 'slot');
  };
  const rise = (el, t, d = 0.8) => {
    gsap.set(el, { opacity: 0, y: 24, filter: 'blur(6px)' });
    tl.to(el, { opacity: 1, y: 0, filter: 'blur(0px)', duration: d, ease: 'out' }, t);
  };
  const reveal3 = (el, t, d = 0.6) => {
    gsap.set(el, { clipPath: 'inset(-20% 100% -20% 0%)' });
    tl.to(el, { clipPath: 'inset(-20% 0% -20% 0%)', duration: d, ease: 'power2.out' }, t);
  };
  const headline = (el, t) => {
    const sp = SplitText.create(el, { type: 'lines,words', mask: 'lines' });
    gsap.set(sp.words, { yPercent: 112 });
    tl.to(sp.words, { yPercent: 0, duration: 0.95, ease: 'out', stagger: Math.min(0.05, 0.4 / sp.words.length) }, t);
    cue(t, 'whoosh');
  };
  const pen = (svg, d, t, dur = 0.6) => {
    const p = svgEl(svg, 'path', { d, class: 'pen' });
    gsap.set(p, { drawSVG: '0%', opacity: 0 });
    tl.set(p, { opacity: 0.92 }, t);
    tl.to(p, { drawSVG: '100%', duration: dur, ease: 'power1.inOut' }, t);
    cue(t, 'pencil', { d: dur });
    return p;
  };
  const air = (svg, d, t, dur = 0.6, cls = 'air') => {
    const p = svgEl(svg, 'path', { d, class: cls });
    gsap.set(p, { drawSVG: '0%', opacity: 0 });
    tl.set(p, { opacity: 1 }, t);
    tl.to(p, { drawSVG: '100%', duration: dur, ease: 'inout' }, t);
    return p;
  };

  const SCENES = [[0, 8], [8, 18], [18, 32], [32, 42], [42, 54], [54, 66], [66, 80], [80, 92], [92, 102], [102, 112], [112, 122], [122, 136]];
  SCENES.forEach(([a, b], i) => {
    const el = $(`#s${i}`);
    gsap.set(el, { opacity: 0, visibility: 'hidden' });
    const tin = i === 0 ? 0 : a - 0.25;
    tl.set(el, { visibility: 'visible' }, tin);
    tl.fromTo(el, { opacity: 0, x: i === 0 ? 0 : 140, filter: i === 0 ? 'blur(0px)' : 'blur(8px)' },
      { opacity: 1, x: 0, filter: 'blur(0px)', duration: i === 0 ? 0.01 : 0.7, ease: 'out', immediateRender: false }, tin);
    if (i < SCENES.length - 1) {
      tl.to(el, { opacity: 0, x: -140, filter: 'blur(8px)', duration: 0.5, ease: 'power3.in' }, b - 0.45);
      tl.set(el, { visibility: 'hidden' }, b + 0.06);
      if (i > 0) cue(b - 0.45, 'seam');
    }
    cue(a, 'scene', { i });
  });

  // S0: one hello
  tl.fromTo(chart, { v: 0 }, { v: 0.3, duration: 1.8, ease: 'out', immediateRender: false }, 0.1);
  rise($('#composer'), 0.3, 0.7);
  const typedEl = $('#typed');
  const typed = proxy((x) => { typedEl.textContent = 'hi'.slice(0, Math.round(x)); }, 0);
  tl.fromTo(typed, { v: 0 }, { v: 1, duration: 0.01, immediateRender: false }, 1.05);
  tl.fromTo(typed, { v: 1 }, { v: 2, duration: 0.01, immediateRender: false }, 1.3);
  cue(1.05, 'key'); cue(1.3, 'key');
  tl.to('#caret', { opacity: 0, duration: 0.45, ease: 'steps(1)', repeat: 5, yoyo: true }, 0.4);
  headline($('#s0h'), 0.9);
  rise($('#s0sub'), 2.3, 0.9);
  tl.to('#sendbtn', { scale: 0.86, duration: 0.1, ease: 'power2.out' }, 1.82);
  tl.to('#sendbtn', { scale: 1, duration: 0.5, ease: 'seat' }, 1.92);
  tl.set(typed, { v: 0 }, 1.94);
  cue(1.88, 'send');
  const hi = $('#s0hi');
  gsap.set(hi, { opacity: 0, y: 60, scale: 0.94, filter: 'blur(4px)', transformOrigin: '100% 100%' });
  tl.to(hi, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.55, ease: 'out' }, 1.95);
  cue(1.98, 'pop');
  tl.to(hi, { motionPath: { path: [{ x: 0, y: 0 }, { x: 90, y: -250 }, { x: 150, y: -470 }], curviness: 1.25 }, scale: 0.25, duration: 0.6, ease: 'power2.in' }, 2.85);
  tl.to(hi, { opacity: 0, duration: 0.15 }, 3.3);
  cue(2.85, 'fly');
  seat($('#msg1'), 3.4, 220);
  const typingEl = $('#s0typing');
  gsap.set(typingEl, { opacity: 0, scale: 0.9, transformOrigin: '0% 100%' });
  tl.to(typingEl, { opacity: 1, scale: 1, duration: 0.45, ease: 'out' }, 3.75);
  tl.to(typingEl, { opacity: 0, duration: 0.2 }, 5.1);
  cue(3.75, 'typing', { d: 1.35 });
  const reply = $('#s0reply');
  gsap.set(reply, { opacity: 0, y: 20, scale: 0.94, filter: 'blur(4px)', transformOrigin: '0% 100%' });
  tl.to(reply, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.5, ease: 'out' }, 5.15);
  cue(5.18, 'pop');
  tl.to(reply, { motionPath: { path: [{ x: 0, y: 0 }, { x: 300, y: -140 }, { x: 600, y: -284 }], curviness: 1.1 }, scale: 0.3, duration: 0.6, ease: 'power2.in' }, 5.95);
  tl.to(reply, { opacity: 0, duration: 0.15 }, 6.4);
  cue(5.95, 'fly');
  seat($('#msg2'), 6.45, 220);
  const counterEl = $('#counter');
  seat(counterEl, 4.5, 200);

  // S1: one box
  headline($('#s1 .h'), 7.85);
  rise($('#s1 .sub'), 8.4);
  seat($('#srv1'), 8.6);
  rise($('#s1eq'), 9.3);
  rise($('#s1eqlbl'), 9.8);
  reveal3($('#s1plug'), 10.5, 0.8);
  const s1c = $('#s1conns'), s1r = $('#s1rps'), s1u = $('#s1cpu');
  const load1 = proxy((p) => {
    s1c.textContent = fmt(1 + p * 9999);
    s1r.textContent = fmt(2 + p * 9998);
    s1u.textContent = `${Math.round(2 + 95 * Math.pow(p, 1.7))}%`;
  }, 0);
  tl.fromTo(load1, { v: 0 }, { v: 1, duration: 3.4, ease: 'power2.inOut', immediateRender: false }, 10.7);
  grow(10000, 10.7, 3.4);
  const cpuField = $('#s1cpu').parentElement;
  pen($('#s1ov'), roughRing(rectIn(cpuField), 11, 10), 14.2, 0.65);
  cue(14.2, 'alarm');
  reveal3($('#s1pn'), 14.75, 0.7);
  rise($('#s1c10k'), 15.2);
  source('Little, Operations Research, 2011; Kegel, "The C10K problem", 1999', 8);

  // S2: get told
  headline($('#s2 .h'), 17.85);
  rise($('#s2 .sub'), 18.4);
  const lanes = $('#lanes');
  lanes.querySelectorAll('.bay, .lane-lbl').forEach((el, i) => rise(el, 18.5 + (i % 3) * 0.08, 0.6));
  const marks = $('#lanemarks');
  const X0 = 1040, X1 = 1800, P0 = 19.2, P1 = 24.2;
  const at = (x) => P0 + ((x - X0) / (X1 - X0)) * (P1 - P0);
  const pop = (el, x) => {
    gsap.set(el, { opacity: 0, scaleY: 0.2, transformOrigin: '50% 100%' });
    tl.to(el, { opacity: 1, scaleY: 1, duration: 0.18, ease: 'out' }, at(x));
  };
  for (let x = 1260, n = 0; x < 1790; x += 66, n++) {
    pop(div(marks, 'mark', '', `left:${x}px;top:270px;width:5px;height:40px`), x);
    pop(div(marks, n === 5 ? 'box-full' : 'box-empty', '', `left:${x + 12}px;top:282px`), x + 12);
    cue(at(x), 'poll');
  }
  const lp = [[1300, 1470], [1478, 1610], [1618, 1790]];
  lp.forEach(([a, b]) => {
    const bar = div(marks, 'mark', '', `left:${a}px;top:488px;width:${b - a}px;height:6px;opacity:.85`);
    gsap.set(bar, { scaleX: 0, transformOrigin: '0% 50%' });
    tl.to(bar, { scaleX: 1, duration: at(b) - at(a), ease: 'none' }, at(a));
    pop(div(marks, 'box-full', '', `left:${b - 6}px;top:478px`), b);
    cue(at(b), 'frame', { soft: 1 });
  });
  pop(div(marks, 'mark', '', 'left:1290px;top:660px;width:6px;height:70px;background:var(--buff)'), 1290);
  const t101 = div(marks, 'tag', 'HTTP/1.1 101 Switching Protocols', 'left:1306px;top:668px');
  pop(t101, 1300);
  const rw = mulberry32(6455);
  for (let x = 1330; x < 1790; x += 26 + rw() * 30) {
    const down = rw() > 0.45;
    pop(div(marks, 'mark', '', `left:${x}px;top:${down ? 694 : 714}px;width:12px;height:12px;border-radius:50%;background:${down ? 'var(--airway)' : 'var(--buff)'}`), x);
    if (rw() > 0.6) cue(at(x), 'frame', { soft: 1 });
  }
  const ph = $('#playhead');
  gsap.set(ph, { opacity: 0, x: 0 });
  tl.to(ph, { opacity: 0.8, duration: 0.3 }, P0 - 0.2);
  tl.to(ph, { x: X1 - X0, duration: P1 - P0, ease: 'none' }, P0);
  tl.to(ph, { opacity: 0, duration: 0.3 }, P1);
  rise($('#s2fact'), 22.4);
  tl.to(lanes, { x: -120, opacity: 0, filter: 'blur(6px)', duration: 0.5, ease: 'power3.in' }, 24.5);
  const phone = $('#phone');
  gsap.set(phone, { x: 360, opacity: 0 });
  tl.to(phone, { x: 0, opacity: 1, duration: 0.9, ease: 'out' }, 24.75);
  cue(24.75, 'whoosh');
  const feed = $('#feed');
  const msgs = [...feed.querySelectorAll('.m')];
  const tp = $('#s2tp');
  gsap.set(tp, { opacity: 0 });
  const s2ov = $('#s2ov');
  const arrivals = [];
  msgs.forEach((m, i) => {
    const ta = 25.9 + i * 0.9;
    arrivals.push(ta);
    const target = Math.max(0, m.offsetTop + m.offsetHeight + 70 - feed.clientHeight);
    tl.to(feed, { scrollTop: target, duration: 0.55, ease: 'out' }, ta);
    const dot = svgEl(s2ov, 'circle', { r: 10, cx: 0, cy: 0, fill: 'var(--airway)', stroke: '#EADCB4', 'stroke-width': 3 });
    gsap.set(dot, { x: 1960, y: 640 + (i % 3) * 30, opacity: 0 });
    tl.set(dot, { opacity: 1 }, ta - 0.4);
    tl.to(dot, { x: 1560, y: 760, duration: 0.4, ease: 'power2.in' }, ta - 0.4);
    tl.set(dot, { opacity: 0 }, ta);
    cue(ta - 0.4, 'frame');
    cue(ta, 'pop');
    if (m.classList.contains('them')) {
      tl.to(tp, { opacity: 1, duration: 0.15 }, ta - 0.75);
      tl.to(tp, { opacity: 0, duration: 0.1 }, ta - 0.08);
    }
  });
  grow(50000, 26, 5);
  source('RFC 6202 and RFC 6455, IETF, 2011', 18);

  // S3: scale up
  headline($('#s3 .h'), 31.85);
  rise($('#s3 .sub'), 32.4);
  seat($('#s3strip'), 32.6);
  const sock = $('#s3sock');
  const dots = $('#s3dots').getContext('2d');
  const COLS = 76, PITCH = 820 / COLS;
  const sockets = proxy((x) => {
    sock.textContent = fmt(x);
    const n = Math.floor(x / 1000);
    dots.clearRect(0, 0, 820, 420);
    for (let i = 0; i < n; i++) {
      const age = n - i;
      dots.fillStyle = age < 60 ? `rgba(181,36,127,${0.55 + 0.45 * (1 - age / 60)})` : 'rgba(234,220,180,.78)';
      dots.beginPath();
      dots.arc((i % COLS) * PITCH + PITCH / 2, Math.floor(i / COLS) * PITCH + PITCH / 2, 3.1, 0, Math.PI * 2);
      dots.fill();
    }
  }, 0);
  tl.fromTo(sockets, { v: 0 }, { v: 2277845, duration: 5, ease: 'power1.inOut', immediateRender: false }, 33.4);
  cue(33.4, 'count', { d: 5, big: 1 });
  grow(100000, 33.4, 5);
  rise($('#s3key'), 38.7);
  pen($('#s3ov'), roughRing(rectIn($('#s3strip')), 33, 22), 39.9, 0.8);
  reveal3($('#s3pn'), 40.6, 0.7);
  source('WhatsApp, "1 million is so 2011", January 2012; Phoenix Framework blog, November 2015', 32);

  // S4: split by job, a view transition
  headline($('#s4 .h'), 41.85);
  rise($('#s4 .sub'), 42.4);
  seat($('#s4 .r3'), 42.5);
  cue(43.6, 'morph');
  const s4ov = $('#s4ov');
  air(s4ov, 'M972,224 L972,784', 45.0, 0.9, 'air thin');
  [224, 364, 504, 644, 784].forEach((y, i) => {
    const c = svgEl(s4ov, 'circle', { cx: 972, cy: y, r: 9, fill: 'var(--airway)' });
    gsap.set(c, { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' });
    tl.to(c, { opacity: 1, scale: 1, duration: 0.3, ease: 'out' }, 45.1 + i * 0.12);
  });
  cue(45.0, 'bus');
  rise($('#s4fact'), 46.4);
  grow(250000, 45.2, 5);
  source('Slack Engineering, "Real-time Messaging", 2023, and "Migrating Millions of Concurrent Websockets to Envoy", 2021', 42);

  // S5: fan-out
  headline($('#s5 .h'), 53.85);
  rise($('#s5 .sub'), 54.4);
  ['#s5you', '#s5ga', '#s5gb', '#s5gc', '#s5gd'].forEach((s, i) => seat($(s), 54.6 + i * 0.12, 200, i % 2 === 0));
  const s5ov = $('#s5ov');
  air(s5ov, 'M1125,234 L1125,300', 55.3, 0.3, 'air thin');
  air(s5ov, 'M1125,364 L1125,420', 55.5, 0.3, 'air thin');
  air(s5ov, 'M1030,420 L1810,420', 55.6, 0.7);
  [1115, 1405, 1695].forEach((x, i) => air(s5ov, `M${x},420 L${x},560`, 55.9 + i * 0.1, 0.35, 'air thin'));
  cue(55.6, 'bus');
  const s5d = $('#s5dots').getContext('2d');
  const lit = [0, 0, 0];
  let s5alpha = 0;
  const drawS5 = () => {
    s5d.clearRect(0, 0, 820, 150);
    for (let g = 0; g < 3; g++) {
      for (let r = 0; r < 6; r++) for (let c = 0; c < 22; c++) {
        const i = r * 22 + c;
        const on = lit[g] > 0 && i / 132 < lit[g];
        s5d.fillStyle = on ? `rgba(181,36,127,${s5alpha})` : `rgba(234,220,180,${0.7 * s5alpha})`;
        s5d.beginPath();
        s5d.arc(g * 290 + 10 + c * 10.6, 10 + r * 22, on ? 4 : 3, 0, Math.PI * 2);
        s5d.fill();
      }
    }
  };
  const s5a = proxy((x) => { s5alpha = x; drawS5(); }, 0);
  tl.fromTo(s5a, { v: 0 }, { v: 1, duration: 0.6, ease: 'out', immediateRender: false }, 56.0);
  const litP = [0, 1, 2].map((g) => proxy((x) => { lit[g] = x; drawS5(); }, 0));
  const wave = (t0, copies) => {
    [1115, 1405, 1695].forEach((x, g) => {
      for (let c = 0; c < copies; c++) {
        const dot = svgEl(s5ov, 'circle', { r: 9, cx: 0, cy: 0, fill: 'var(--airway)', stroke: '#EADCB4', 'stroke-width': 3 });
        gsap.set(dot, { opacity: 0 });
        const t = t0 + c * 0.22;
        tl.set(dot, { opacity: 1 }, t);
        tl.to(dot, { motionPath: { path: `M1125,234 L1125,420 L${x},420 L${x},560` }, duration: 1.0, ease: 'inout' }, t);
        tl.set(dot, { opacity: 0 }, t + 1.0);
      }
      tl.fromTo(litP[g], { v: 0 }, { v: 1, duration: 0.5, ease: 'power1.out', immediateRender: false }, t0 + 1.0 + g * 0.05);
      tl.to(litP[g], { v: 0, duration: 0.01 }, t0 + 1.9);
    });
    cue(t0, 'fly'); cue(t0 + 1.0, 'fan', { n: copies });
  };
  wave(56.6, 1);
  wave(58.2, 3);
  seat($('#s5math').firstElementChild, 59.7, 220);
  const s5n = $('#s5n'), s5n2 = $('#s5n2');
  const nsq = proxy((x) => { s5n.textContent = fmt(x); s5n2.textContent = `${fmt(x * x)} deliveries`; }, 1000);
  tl.fromTo(nsq, { v: 1000 }, { v: 100000, duration: 1.6, ease: 'power3.in', immediateRender: false }, 60.5);
  cue(60.5, 'count', { d: 1.6 });
  const n2r = rectIn(s5n2);
  pen(s5ov, roughLine(n2r.x - 4, n2r.y + n2r.h + 10, n2r.x + 560, n2r.y + n2r.h + 6, 55, 5), 62.2, 0.5);
  reveal3($('#s5pn'), 62.6, 0.5);
  rise($('#s5redis'), 63.4);
  grow(400000, 56.6, 6);
  source('Discord, "Maxjourney", 2023; Redis Pub/Sub documentation', 54);

  // S6: write it down
  headline($('#s6 .h'), 65.85);
  rise($('#s6 .sub'), 66.4);
  const bitsEl = $('#bits');
  const EPOCH = 1288834974657;
  const ts = BigInt(Date.UTC(2026, 9, 12, 9, 41, 0) - EPOCH);
  const idBits = ((ts << 22n) | (37n << 12n) | 1n).toString(2).padStart(64, '0');
  const spans = [...idBits].map((b, i) => {
    const s = document.createElement('span');
    s.className = i === 0 ? 's' : i < 42 ? 't' : i < 52 ? 'mch' : 'q';
    bitsEl.appendChild(s);
    return s;
  });
  bitsEl.style.gap = '2.8px';
  spans.forEach((s) => { s.style.width = '10px'; });
  gsap.set(spans, { opacity: 0, y: 12 });
  tl.to(spans, { opacity: 1, y: 0, duration: 0.4, ease: 'out', stagger: 0.005 }, 66.6);
  const hash = (a, b) => (Math.imul(a * 73856093 ^ b * 19349663, 0x9e3779b1) >>> 0) & 1;
  const scr = proxy((p) => {
    spans.forEach((s, i) => {
      const settle = 0.3 + 0.65 * (i / 64);
      s.textContent = p >= settle ? idBits[i] : String(hash(Math.floor(p * 34), i));
    });
  }, 0);
  tl.fromTo(scr, { v: 0 }, { v: 1, duration: 1.9, ease: 'none', immediateRender: false }, 66.8);
  cue(66.8, 'scramble', { d: 1.9 });
  document.querySelectorAll('#s6 .bitlbl').forEach((el, i) => rise(el, 68.4 + i * 0.12, 0.6));
  seat($('#s6key'), 69.4);
  [...document.querySelectorAll('#s6hist .strip')].forEach((el, i) => seat(el, 70.6 + i * 0.6, 200));
  const broke = $('#s6hist .h1 .f:last-child');
  pen($('#s6ov'), roughRing(rectIn(broke), 66, 8), 71.3, 0.6);
  const b1 = $('#s6bar1'), b2 = $('#s6bar2');
  gsap.set([b1, b2], { scaleX: 0 });
  tl.to(b1, { scaleX: 1, duration: 0.7, ease: 'out' }, 73.9);
  rise($('#s6t1'), 74.1, 0.5);
  tl.to(b2, { scaleX: 1, duration: 0.5, ease: 'out' }, 74.8);
  rise($('#s6t2'), 74.9, 0.5);
  cue(73.9, 'bar'); cue(74.8, 'bar', { lo: 1 });
  grow(600000, 69, 6);
  source('Twitter, Snowflake README, 2010; Discord, "How Discord Stores Billions of Messages", 2017, and "Trillions of Messages", 2023', 66);

  // S7: hash ring and cache
  headline($('#s7 .h'), 79.85);
  rise($('#s7 .sub'), 80.4);
  const s7ov = $('#s7ov');
  const CX = 1410, CY = 470, R = 250;
  const square = `M${CX - 200},${CY - 200} L${CX + 200},${CY - 200} L${CX + 200},${CY + 200} L${CX - 200},${CY + 200} Z`;
  const circle = `M${CX},${CY - R} A${R},${R} 0 0,1 ${CX + R},${CY} A${R},${R} 0 0,1 ${CX},${CY + R} A${R},${R} 0 0,1 ${CX - R},${CY} A${R},${R} 0 0,1 ${CX},${CY - R} Z`;
  const ring = svgEl(s7ov, 'path', { d: square, fill: 'none', stroke: '#55625E', 'stroke-width': 12 });
  gsap.set(ring, { opacity: 0 });
  tl.to(ring, { opacity: 1, duration: 0.3 }, 80.6);
  tl.to(ring, { morphSVG: circle, duration: 0.95, ease: 'inout' }, 81.0);
  cue(81.0, 'morph', { soft: 1 });
  const P = (a, r) => [CX + r * Math.sin(a), CY - r * Math.cos(a)];
  const NODES = [0.3, 1.25, 2.2, 3.3, 4.2, 5.3];
  const lbls = $('#s7lbls');
  const nodeEls = NODES.map((a, i) => {
    const [x, y] = P(a, R);
    const g = svgEl(s7ov, 'rect', { x: x - 9, y: y - 22, width: 18, height: 44, rx: 3, fill: 'var(--blue)', transform: `rotate(${(a * 180) / Math.PI} ${x} ${y})` });
    gsap.set(g, { opacity: 0 });
    tl.to(g, { opacity: 1, duration: 0.3 }, 81.7 + i * 0.07);
    const [lx, ly] = P(a, R + 52);
    const l = div(lbls, 'ring-lbl', `n${i + 1}`, `left:${lx}px;top:${ly}px`);
    gsap.set(l, { opacity: 0 });
    tl.to(l, { opacity: 1, duration: 0.3 }, 81.8 + i * 0.07);
    return g;
  });
  const NEW = 2.75;
  const rk = mulberry32(7);
  const keys = Array.from({ length: 72 }, () => rk() * Math.PI * 2).map((a) => {
    const [x, y] = P(a, R - 34);
    const c = svgEl(s7ov, 'circle', { cx: x, cy: y, r: 7, fill: 'var(--buff)' });
    return { a, c };
  });
  gsap.set(keys.map((k) => k.c), { opacity: 0, scale: 0.3, transformOrigin: '50% 50%' });
  tl.to(keys.map((k) => k.c), { opacity: 0.9, scale: 1, duration: 0.35, ease: 'out', stagger: 0.006 }, 82.3);
  cue(82.3, 'sprinkle');
  const [nx, ny] = P(NEW, R);
  const n7 = svgEl(s7ov, 'rect', { x: nx - 10, y: ny - 26, width: 20, height: 52, rx: 3, fill: 'var(--salmon)', transform: `rotate(${(NEW * 180) / Math.PI} ${nx} ${ny})` });
  gsap.set(n7, { opacity: 0, scale: 1.8, transformOrigin: '50% 50%' });
  tl.to(n7, { opacity: 1, scale: 1, duration: SEAT.dur, ease: 'seat' }, 84.2);
  cue(84.2 + SEAT.cross * 0.5, 'slot');
  const [n7x, n7y] = P(NEW, R + 54);
  const n7l = div(lbls, 'ring-lbl', 'n7', `left:${n7x}px;top:${n7y}px;color:var(--salmon)`);
  gsap.set(n7l, { opacity: 0 });
  tl.to(n7l, { opacity: 1, duration: 0.3 }, 84.4);
  const moved = keys.filter((k) => k.a > 2.2 && k.a <= NEW).map((k) => k.c);
  tl.to(moved, { fill: '#EDB1A2', scale: 1.5, duration: 0.25, ease: 'out', stagger: 0.04 }, 84.7);
  tl.to(moved, { scale: 1, duration: 0.4, ease: 'out', stagger: 0.04 }, 84.95);
  cue(84.7, 'fan', { n: moved.length });
  const arcPts = [];
  for (let a = 2.2; a <= NEW + 0.001; a += 0.05) arcPts.push(P(a, R + 22));
  pen(s7ov, catmull(arcPts), 85.3, 0.5);
  const [ax, ay] = P((2.2 + NEW) / 2, R + 60);
  const s7note = div($('#s7'), 'pen-note', 'only this slice moves', 'left:1480px;top:788px');
  reveal3(s7note, 85.8, 0.6);
  const key = keys.reduce((b, k) => (Math.abs(k.a - 3.9) < Math.abs(b.a - 3.9) ? k : b));
  const kr = svgEl(s7ov, 'circle', { cx: key.c.getAttribute('cx'), cy: key.c.getAttribute('cy'), r: 15, fill: 'none', stroke: 'var(--airway)', 'stroke-width': 4 });
  gsap.set(kr, { opacity: 0 });
  tl.to(kr, { opacity: 1, duration: 0.25 }, 86.7);
  [4, 5, 0].forEach((ni, i) => {
    const [x, y] = P(NODES[ni], R);
    const c = svgEl(s7ov, 'circle', { cx: x, cy: y, r: 34, fill: 'none', stroke: 'var(--airway)', 'stroke-width': 5 });
    gsap.set(c, { drawSVG: '0%', opacity: 0 });
    tl.set(c, { opacity: 1 }, 86.9 + i * 0.18);
    tl.to(c, { drawSVG: '100%', duration: 0.4, ease: 'inout' }, 86.9 + i * 0.18);
    cue(86.9 + i * 0.18, 'tick', { p: i });
  });
  rise($('#s7quorum'), 87.4);
  const l1 = $('#s7b1'), l2 = $('#s7b2');
  rise($('#s7lease'), 88.3, 0.6);
  gsap.set([l1, l2], { scaleX: 0 });
  tl.to(l1, { scaleX: 1, duration: 0.7, ease: 'out' }, 88.6);
  tl.to(l2, { scaleX: 1, duration: 0.5, ease: 'out' }, 89.4);
  cue(88.6, 'bar'); cue(89.4, 'bar', { lo: 1 });
  grow(750000, 82.5, 6);
  source('Karger et al., MIT, 1997; DeCandia et al., SOSP 2007; Nishtala et al., NSDI 2013', 80);

  // S8: at least once, exactly once
  headline($('#s8 .h'), 91.85);
  rise($('#s8 .sub'), 92.4);
  seat($('#s8client'), 92.6, 200);
  const m1 = $('#s8m1'), m2 = $('#s8m2');
  seat(m1, 93.2, 200);
  tl.to(m1, { x: 392, y: -98, duration: 0.8, ease: 'inout' }, 93.95);
  cue(93.95, 'fly'); cue(94.7, 'slot');
  const s8ov = $('#s8ov');
  air(s8ov, 'M1384,236 C1360,300 1330,300 1304,236', 94.9, 0.35, 'air thin');
  pen(s8ov, roughLine(1320, 262, 1362, 302, 81, 2), 95.35, 0.18);
  pen(s8ov, roughLine(1362, 262, 1320, 302, 82, 2), 95.55, 0.18);
  reveal3($('#s8pn1'), 95.7, 0.5);
  seat(m2, 96.1, 200);
  tl.to(m2, { x: 392, y: -8, duration: 0.7, ease: 'inout' }, 96.75);
  cue(96.75, 'fly'); cue(97.45, 'slot');
  pen(s8ov, roughLine(1384, 304, 1838, 296, 83, 6), 97.7, 0.35);
  tl.to(m2, { opacity: 0.45, duration: 0.3 }, 98.0);
  reveal3($('#s8pn2'), 98.0, 0.5);
  const log = $('#s8log');
  const logEls = Array.from({ length: 10 }, (_, i) => div(log, 'strip buff sm', `<div class="f"><i>seq</i><b class="mono">${41 + i}</b></div>`, `left:${1010 + i * 80}px;top:538px;width:72px`));
  logEls.forEach((el) => { el.querySelector('.f').style.padding = '0 10px'; });
  gsap.set(logEls, { opacity: 0, x: 60 });
  tl.to(logEls, { opacity: 1, x: 0, duration: 0.5, ease: 'out', stagger: 0.03 }, 98.3);
  cue(98.3, 'sprinkle');
  const tri = '<svg width="18" height="14" viewBox="0 0 18 14" style="vertical-align:-1px;margin-right:8px"><path d="M9 0L18 14H0Z" fill="currentColor"/></svg>';
  const pl = $('#s8pl'), pp = $('#s8pp');
  pl.innerHTML = `laptop${tri}`; pp.innerHTML = `phone, offline${tri}`;
  pl.querySelector('svg').style.margin = '0 0 0 8px'; pp.querySelector('svg').style.margin = '0 0 0 8px';
  gsap.set([pl, pp], { xPercent: -100 });
  const colX = (i) => 1010 + i * 80 + 36 + 9;
  pl.style.left = `${colX(9)}px`; pp.style.left = `${colX(3)}px`;
  gsap.set([pl, pp], { opacity: 0 });
  tl.to([pl, pp], { opacity: 1, duration: 0.4, stagger: 0.15 }, 98.7);
  const ppText = proxy((x) => { pp.firstChild.textContent = x > 0.5 ? 'phone, back online' : 'phone, offline'; }, 0);
  tl.fromTo(ppText, { v: 0 }, { v: 1, duration: 0.01, immediateRender: false }, 99.4);
  tl.to(pp, { x: (9 - 3) * 80, duration: 1.2, ease: 'inout' }, 99.5);
  logEls.slice(4).forEach((el, i) => {
    tl.to(el, { backgroundColor: '#EDB1A2', duration: 0.15 }, 99.65 + i * 0.17);
    cue(99.65 + i * 0.17, 'tick', { p: i });
  });
  rise($('#s8fact'), 100.6);
  grow(850000, 93, 6);
  source('Stripe, "Designing robust and predictable APIs with idempotency", 2017; Apache Kafka documentation; Meta Engineering, 2014', 92);

  // S9: the bad day
  headline($('#s9 .h'), 101.85);
  rise($('#s9 .sub'), 102.4);
  const stack = $('#s9stack');
  const LAYERS = ['edge', 'api', 'service', 'cache', 'database'];
  const loadEls = [];
  LAYERS.forEach((name, i) => {
    const el = div(stack, 'strip blue sm', `<div class="f" style="width:220px"><i>layer</i><b>${name}</b></div><div class="f" style="width:240px"><i>on timeout</i><b>retries 3×</b></div><div class="f" style="flex:1"><i>load</i><b class="mono">1×</b></div>`, `left:1000px;top:${180 + i * 118}px;width:820px`);
    loadEls.push(el.querySelector('.mono'));
    seat(el, 102.6 + i * 0.1, 200, i % 2 === 0);
  });
  LAYERS.forEach((_, i) => {
    const target = 3 ** (i + 1);
    const lp2 = proxy((x) => {
      loadEls[i].textContent = `${Math.round(x)}×`;
      loadEls[i].style.color = x > 1.5 ? '#9E1B21' : '';
    }, 1);
    tl.fromTo(lp2, { v: 1 }, { v: target, duration: 0.3, ease: 'power1.out', immediateRender: false }, 104.0 + i * 0.32);
    tl.to(lp2, { v: 1, duration: 0.35, ease: 'power2.inOut' }, 106.9 + (4 - i) * 0.05);
    cue(104.0 + i * 0.32, 'tick', { p: i, alarm: 1 });
  });
  const dbRing = pen($('#s9ov'), roughRing(rectIn(loadEls[4].parentElement), 99, 8), 105.7, 0.55);
  cue(105.7, 'alarm');
  reveal3($('#s9pn'), 106.0, 0.5);
  tl.to([dbRing, '#s9pn'], { opacity: 0.2, duration: 0.4 }, 106.9);
  const fixTop = proxy((x) => { if (x > 0.5) loadEls[0].textContent = '≤1.1×'; }, 0);
  tl.fromTo(fixTop, { v: 0 }, { v: 1, duration: 0.01, immediateRender: false }, 107.4);
  cue(106.9, 'resolve');
  rise($('#s9fix'), 107.1);
  seat($('#s9push'), 108.4, 200);
  cue(108.9, 'push');
  grow(950000, 103, 6);
  source('Amazon Builders\' Library, "Timeouts, retries, and backoff with jitter"; Google SRE book, ch. 21; Apple APNs documentation', 102);

  // S10: one million
  tl.to(chart, { v: 0, duration: 0.4, ease: 'power2.in' }, 111.45);
  tl.fromTo(reveal, { v: 0 }, { v: 0.0001, duration: 0.01, immediateRender: false }, 111.95);
  tl.to(chart, { v: 1, duration: 1.0, ease: 'out' }, 112.0);
  tl.to(reveal, { v: 1, duration: 7.6, ease: 'none' }, 112.0);
  cue(112.0, 'rise', { d: 7.4 });
  const s10 = $('#s10');
  div(s10, '', '', 'position:absolute;left:0;bottom:0;width:1300px;height:620px;background:radial-gradient(80% 90% at 20% 100%, rgba(22,28,27,.88), rgba(22,28,27,0) 70%);z-index:-1');
  headline($('#s10 .h'), 113.2);
  rise($('#s10 .sub'), 113.9);
  const regions = $('#regions');
  const regionEls = HUBS.map((h) => div(regions, 'region', h.name));
  gsap.set(regionEls, { opacity: 0 });
  tl.to(regionEls, { opacity: 1, duration: 0.5, stagger: 0.2 }, 116.0);
  tl.fromTo(users, { v: usersAt }, { v: 1000000, duration: 5.3, ease: 'power2.inOut', immediateRender: false }, 114.0);
  usersAt = 1000000;
  cue(114.0, 'count', { d: 5.3 });
  cue(119.3, 'million');
  tl.to(chart, { v: 0.22, duration: 0.8, ease: 'power2.inOut' }, 121.5);
  source('Google SRE book, "Monitoring Distributed Systems"; Slack Engineering, 2023', 112);

  // S11: recap and sources
  headline($('#s11 .h'), 121.85);
  const RECAP = ['one box', 'open sockets', 'scale up first', 'split by job', 'pub/sub fan-out', 'sortable IDs', 'hash and cache', 'idempotent sends', 'retry budgets', 'regions, watch p99'];
  const recap = $('#recap');
  RECAP.forEach((label, i) => {
    const col = i < 5 ? 0 : 1, row = i % 5;
    const el = div(recap, `strip ${['blue', 'blue', 'blue', 'blue', 'blue', 'green', 'green', 'buff', 'salmon', 'buff'][i]} sm`,
      `<div class="f" style="width:64px"><i>step</i><b class="mono">${i + 1}</b></div><div class="f" style="flex:1"><i>answer</i><b>${label}</b></div>`,
      `left:${120 + col * 400}px;top:${430 + row * 80}px;width:380px`);
    seat(el, 122.7 + i * 0.2, 160, false);
    cue(122.7 + i * 0.2 + SEAT.cross, 'tick', { p: i % 5 });
  });
  const cred = $('#credits');
  rise(cred, 124.0, 0.8);
  rise($('#s11 .rail'), 124.0, 0.8);
  tl.to(cred, { scrollTop: cred.scrollHeight - cred.clientHeight, duration: 8.8, ease: 'none' }, 124.4);
  tl.to(['#s11 .left', '#recap', '#credits', '#s11 .rail', counterEl, srcEl], { opacity: 0, filter: 'blur(6px)', duration: 0.6, ease: 'power2.in' }, 133.3);
  tl.to(chart, { v: 0, duration: 1.2, ease: 'power2.inOut' }, 133.3);
  const end = $('#endcard');
  tl.to(end, { opacity: 1, duration: 0.01 }, 133.9);
  headline(end.querySelector('.h'), 133.9);
  rise(end.querySelector('.sub'), 134.5);
  cue(133.9, 'end');
  source('', 122);

  const lot0 = lottie.loadAnimation({ container: $('#lot0'), renderer: 'svg', loop: false, autoplay: false, animationData: typingLottie(132, 72) });
  const lot2 = lottie.loadAnimation({ container: $('#lot2'), renderer: 'svg', loop: false, autoplay: false, animationData: typingLottie(104, 56) });

  const VTS = [
    { t0: 7.0, d: 1.0, apply: (on) => { counterEl.classList.toggle('hud', on); counterEl.classList.toggle('big', !on); } },
    { t0: 43.6, d: 1.2, apply: (on) => $('#split').classList.toggle('spread', on) },
  ];
  let active = null;
  const vtAnims = () => document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement && a.effect.pseudoElement.startsWith('::view-transition'));
  const setVt = (ms) => vtAnims().forEach((a) => { a.pause(); a.currentTime = ms; });
  async function vtUpdate(t) {
    if (active) {
      if (t >= active.t0 && t < active.t0 + active.d) { setVt((t - active.t0) * 1000); return; }
      active.vt.skipTransition();
      await active.vt.finished.catch(() => {});
      active = null;
    }
    for (const def of VTS) {
      const inside = t >= def.t0 && t < def.t0 + def.d;
      if (inside && document.startViewTransition) {
        def.apply(false);
        const vt = document.startViewTransition(() => def.apply(true));
        await vt.ready.catch(() => {});
        active = { ...def, vt };
        setVt((t - def.t0) * 1000);
      } else {
        def.apply(t >= def.t0);
      }
    }
  }

  const lotFrame = (anim, t, a, b) => { if (t >= a && t <= b) anim.goToAndStop(((t - a) * 30) % 30, true); };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

  function sideRender(t) {
    lotFrame(lot0, t, 3.6, 5.3);
    lotFrame(lot2, t, 25, 31);
    if (state.chart > 0.003) sector.render(t, state.users, state.reveal);
    if (t > 115 && t < 122.2) {
      HUBS.forEach((h, i) => {
        const p = sector.project(h.pos);
        regionEls[i].style.left = `${p.x}px`;
        regionEls[i].style.top = `${p.y}px`;
      });
    }
  }

  window.__seek = async (t) => {
    tl.seek(t);
    await vtUpdate(t);
    sideRender(t);
    await raf();
  };
  window.__cues = cues.sort((a, b) => a.t - b.t);
  window.__duration = DURATION;
  window.__fps = FPS;
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
  await window.__seek(0);
  window.__ready = true;
  if (!window.__RENDER__) startPlayback();
}

function startPlayback() {
  const root = document.getElementById('root');
  const fit = () => {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    document.documentElement.style.cssText += ';width:100vw;height:100vh;background:#111';
    document.body.style.cssText = 'width:100vw;height:100vh;overflow:hidden;display:grid;place-items:center;background:#111';
    root.style.transform = `scale(${s})`;
    root.style.transformOrigin = 'center';
    root.style.flex = 'none';
  };
  fit();
  addEventListener('resize', fit);
  const audio = document.getElementById('track');
  const btn = document.createElement('button');
  btn.textContent = 'Play the film';
  btn.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99;font:700 28px/1 SofiaC,sans-serif;padding:22px 40px;border:0;border-radius:40px;background:#B5247F;color:#EADCB4;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.5)';
  document.body.appendChild(btn);
  btn.addEventListener('click', () => {
    btn.remove();
    const t0 = performance.now();
    if (audio) audio.play();
    let busy = false;
    const loop = async () => {
      const t = audio ? audio.currentTime : (performance.now() - t0) / 1000;
      if (!busy && t <= window.__duration) { busy = true; await window.__seek(t); busy = false; }
      if (t <= window.__duration) requestAnimationFrame(loop);
    };
    loop();
  });
}

build();
