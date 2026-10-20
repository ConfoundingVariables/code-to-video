// The film, scene by scene, on one master timeline (120 BPM: 1 bar = 2 s).
// Positions/sizes are constants (no layout reads at tween time) so every frame
// is reproducible in any order.
import { gsap, SplitText, master as M, cue, section, viewTransitions, frameHooks, rng } from './core.js';
import { W } from './world.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const fmt = n => Math.round(n).toLocaleString('en-US');

function scene(id, t0, t1, html) {
  const el = document.createElement('section');
  el.className = 'scene'; el.id = id; el.innerHTML = html;
  $('#scenes').appendChild(el);
  M.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'settle' }, t0);
  M.to(el, { autoAlpha: 0, duration: 0.45, ease: 'leave' }, t1 - 0.45);
  return el;
}

// masked line/word rise — the house text entrance
function rise(el, t, { stagger = 0.045, dur = 0.8, type = 'words' } = {}) {
  const st = SplitText.create(el, { type: 'lines,words,chars', mask: 'lines' });
  M.from(st[type], { yPercent: 110, duration: dur, stagger, ease: 'arrive' }, t);
  return st;
}
function sign(scene, t, title, bullet, color) {
  const s = document.createElement('div'); s.className = 'sign';
  s.innerHTML = (bullet ? `<div class="bullet ${color}">${bullet}</div>` : '') + `<div class="h1 line-clip">${title}</div>`;
  scene.appendChild(s);
  if (bullet) { // anticipation (dip) -> pop with a little overshoot, then the title follows through
    const b = $('.bullet', s);
    M.fromTo(b, { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.55, ease: 'back.out(2.2)' }, t);
    cue(t, 'click');
  }
  rise($('.h1', s), t + (bullet ? 0.12 : 0), { stagger: 0.05 });
  return s;
}
function say(scene, t, html, cls = 'caption', css = '') {
  const el = document.createElement('p'); el.className = `say ${cls}`; el.innerHTML = html;
  el.style.cssText = 'margin:0;' + css; scene.appendChild(el);
  rise(el, t, { stagger: 0.025, dur: 0.7 });
  return el;
}
function svg(scene, inner, cls = 'map') {
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', cls); s.setAttribute('viewBox', '0 0 1920 1080');
  s.innerHTML = `<defs><pattern id="hazard-${scene.id}" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="28" height="28" fill="#fccc0a"/><rect width="14" height="28" fill="#15181c"/></pattern></defs>` + inner;
  scene.appendChild(s); return s;
}
// rounded-corner polyline: transit-map routing with 45° / 90° bends
function route(pts, r = 26) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.5) { d += ` L${cx},${cy}`; continue; }
    d += ` L${cx - ((cx - px) / l1) * rr},${cy - ((cy - py) / l1) * rr} Q${cx},${cy} ${cx + ((nx - cx) / l2) * rr},${cy + ((ny - cy) / l2) * rr}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L${lx},${ly}`;
}
const diag = (x0, y0, xd, y1, x1) => route([[x0, y0], [xd, y0], [xd + Math.abs(y1 - y0), y1], [x1, y1]]);
const ortho = (x0, y0, xm, y1, x1) => route([[x0, y0], [xm, y0], [xm, y1], [x1, y1]]);

// a message dot travelling a path: arcs follow the track, slow-in/slow-out,
// stretch along the direction of travel at speed, squash on arrival.
function travel(dot, path, t, dur, { from = 0, to = 1, ease = 'move', arrive = true } = {}) {
  M.set(dot, { autoAlpha: 1 }, t);
  M.to(dot, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], autoRotate: true, start: from, end: to }, duration: dur, ease, immediateRender: false }, t);
  M.fromTo(dot, { scaleX: 1, scaleY: 1 }, { scaleX: 1.7, scaleY: 0.75, duration: dur / 2, ease: 'sine.in', immediateRender: false }, t);
  M.to(dot, { scaleX: 1, scaleY: 1, duration: dur / 2, ease: 'sine.out' }, t + dur / 2);
  if (arrive) M.fromTo(dot, { scaleX: 0.8, scaleY: 1.25 }, { scaleX: 1, scaleY: 1, duration: 0.18, ease: 'back.out(3)', immediateRender: false }, t + dur);
}
function dotEl(s, cls = 'dot', r = 11) {
  const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', r); c.setAttribute('class', cls);
  c.setAttribute('cx', 0); c.setAttribute('cy', 0); s.appendChild(c); gsap.set(c, { autoAlpha: 0, transformOrigin: '50% 50%' }); return c;
}
function draw(el, t, dur = 0.9, ease = 'move') {
  M.fromTo(el, { drawSVG: '0%' }, { drawSVG: '100%', duration: dur, ease }, t);
}
const pulse = (el, t, s = 1.25) => M.fromTo(el, { scale: 1 }, { scale: s, duration: 0.14, ease: 'settle', yoyo: true, repeat: 1, transformOrigin: '50% 50%', immediateRender: false }, t);

// ------------------------------------------------------------------ layout
const PEOPLE = [...Array(9)].map((_, i) => [330, 304 + i * 64]);
const SERVER = { x: 1190, y: 440, w: 300, h: 240 }; // shared by scenes 3, 4 and the VT start of 5

export function buildScenes(world) {
  // ambient layer: the faint map grid of the paper drifts the whole film
  const stage = $('#stage');
  stage.style.backgroundImage = 'radial-gradient(circle, rgb(21 24 28 / 0.09) 1.6px, transparent 2px)';
  stage.style.backgroundSize = '48px 48px';
  M.fromTo(stage, { backgroundPosition: '0px 0px' }, { backgroundPosition: '-480px -240px', duration: 144, ease: 'none' }, 0);

  const gl = $('#gl');
  frameHooks.push(() => { gl.style.opacity = W.vis; });
  W.vis = 0;

  // ================================================================ S0 0–12
  section(0, 'Dm9', 0.12, { drums: false });
  const s0 = scene('s0', 0, 12.2, `
    <div class="thread"><div class="thread-inner">
      <div class="bubble">We launch in five minutes.</div>
      <div class="bubble me">How many sign-ups so far?<span class="meta">Read</span></div>
      <div class="bubble">Ninety-one. One server is plenty.</div>
      <div class="bubble me" id="last"><span class="txt">Famous last words.</span><span class="meta">Sent</span></div>
    </div></div>
    <div class="thread-rail"></div>
    <div class="bubble me typing" style="position:absolute;left:1141px;top:800px;animation:none"><i></i><i></i><i></i></div>
    <div id="count" class="h2" style="position:absolute;left:120px;bottom:96px"><span class="num" id="countN">1</span> <span id="countL">person</span></div>
    <div id="title" style="position:absolute;left:120px;top:300px">
      <div class="display line-clip" id="titleA">A million</div>
      <div class="display line-clip" id="titleB">hellos</div>
      <p class="body" id="titleSub" style="margin:36px 0 0;color:var(--ink-2)">How a chat app scales, from first principles</p>
    </div>`);
  const thread = $('.thread', s0), bubbles = $$('.bubble', thread), typing = $('.typing', s0);
  // scroll the thread so each new bubble lands at the bottom; the CSS view()
  // timeline does the reveal, the rail on the right is a scroll() timeline
  const bottoms = bubbles.map(b => b.offsetTop + b.offsetHeight + 40 - 740);
  const sends = [0.5, 1.7, 2.9, 4.9];
  sends.forEach((t, i) => {
    M.to(thread, { scrollTop: bottoms[i], duration: 0.55, ease: 'settle' }, t);
    cue(t + 0.05, i % 2 ? 'send' : 'msg', { gain: 0.9 });
  });
  M.set(thread, { scrollTop: 0 }, 0);
  // typing indicator: secondary action, three dots in a staggered wave
  M.to(thread, { scrollTop: bottoms[2] + 100, duration: 0.45, ease: 'settle' }, 3.5);
  M.fromTo(typing, { autoAlpha: 0, scale: 0.95, y: 10 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.3 }, 3.6);
  M.to($$('i', typing), { y: -10, duration: 0.22, ease: 'sine.inOut', yoyo: true, repeat: 5, stagger: 0.09 }, 3.65);
  M.to(typing, { autoAlpha: 0, duration: 0.15, ease: 'leave' }, 4.85);
  [3.7, 3.95, 4.1, 4.35, 4.55].forEach(t => cue(t, 'type'));
  // anticipation on send: the text dips, then the bubble releases
  M.fromTo($('#last .txt'), { scale: 1 }, { scale: 0.94, duration: 0.12, ease: 'settle', transformOrigin: '100% 100%', yoyo: true, repeat: 1, immediateRender: false }, 4.75);
  M.to($('#last .meta'), { text: 'Delivered', duration: 0.01 }, 5.4);
  // the hello leaves the thread: the world pulls back to a million people
  M.to([thread, $('.thread-rail', s0)], { scale: 0.92, filter: 'blur(8px)', autoAlpha: 0, duration: 0.9, ease: 'settle', transformOrigin: '80% 90%' }, 5.7);
  M.to(W, { vis: 1, duration: 0.6, ease: 'settle' }, 5.8);
  M.fromTo(W, { camDist: 0.7, camPolar: 0.0001, reveal: 0.02, arcs: 0, pointAlpha: 0.75 },
    { camDist: 215, camPolar: 0.92, reveal: world.maxDist + 1, duration: 4.4, ease: 'power3.inOut' }, 6.0);
  M.fromTo(W, { shiftX: 0 }, { shiftX: -440, duration: 1.6, ease: 'move', immediateRender: false }, 9.2);
  M.to(W, { arcs: 1, duration: 1.4, ease: 'settle' }, 7.6);
  M.to(W, { me: 0, duration: 0.8 }, 9.2);
  M.fromTo('#count', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 6.1);
  const countN = $('#countN', s0), countL = $('#countL', s0);
  frameHooks.push(t => {
    if (t < 5.9 || t > 12.5) return;
    const n = world.countWithin(W.reveal);
    countN.textContent = fmt(Math.max(1, n)); countL.textContent = n > 1 ? 'people' : 'person';
  });
  for (let k = 0; k < 26; k++) cue(6.1 + 4.2 * Math.pow(k / 26, 1.6), 'tick', { gain: 0.6 + 0.4 * (k / 26) });
  cue(6.0, 'riser', { dur: 4.0, gain: 0.8 });
  section(8, 'Bbmaj7', 0.3, { drums: false });
  M.to('#count', { autoAlpha: 0, duration: 0.4, ease: 'leave' }, 11.0);
  rise($('#titleA'), 9.75, { type: 'chars', stagger: 0.03, dur: 0.9 });
  rise($('#titleB'), 9.95, { type: 'chars', stagger: 0.03, dur: 0.9 });
  rise($('#titleSub'), 10.5, { stagger: 0.04 });
  cue(10.0, 'impact', { gain: 0.8 });
  M.to(W, { vis: 0, duration: 0.6, ease: 'leave' }, 11.6);

  // ================================================================ S1 12–26
  section(12, 'Dm9', 0.42);
  const s1 = scene('s1', 12, 26, '');
  sign(s1, 12.4, 'What a chat app has to do');
  const ST = [[420, 'Send'], [960, 'Store'], [1500, 'Deliver']];
  const m1 = svg(s1, `
    <path id="l1" class="track red" d="M260,520 H1660"/>
    ${ST.map(([x, n], i) => `<g class="st" id="st${i}"><circle class="station big" cx="${x}" cy="520" r="30"/>
       <text class="lg mid" x="${x}" y="450">${n}</text></g>`).join('')}`);
  draw($('#l1', m1), 12.8, 1.3);
  ST.forEach((_, i) => {
    const t = 12.95 + i * 0.36;
    M.from($(`#st${i}`, m1), { scale: 0.95, autoAlpha: 0, transformOrigin: '50% 80%', duration: 0.45 }, t);
    cue(t, 'click', { gain: 0.6 });
  });
  const props = [
    ['It should feel instant.', 'A packet from California to the Netherlands and back already takes 150 ms. [1]'],
    ['Once acknowledged, never lost.', 'A crashed disk or server can’t take a message with it. [3]'],
    ['Same order for everyone, live.', 'Everyone in a chat sees the same order of messages, as it happens.'],
  ];
  props.forEach(([a, b], i) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${ST[i][0] - 230}px;top:600px;width:460px;text-align:center`;
    el.innerHTML = `<div class="body" style="font-weight:600">${a}</div><div class="small" style="margin-top:12px">${b}</div>`;
    s1.appendChild(el);
  });
  const d1 = dotEl(m1, 'dot', 14);
  const p1 = $('#l1', m1);
  // the message stops at each station: follow-through on the stop, then the property appears
  [[0, 0.115], [0.115, 0.5], [0.5, 0.885]].forEach(([a, b], i) => {
    const t = 14.6 + i * 1.6;
    travel(d1, p1, t, 0.9, { from: a, to: b });
    pulse($(`#st${i} circle`, m1), t + 0.9, 1.18);
    cue(t + 0.9, 'msg');
    rise($$('.body', s1)[i], t + 0.95, { stagger: 0.04 });
    M.from($$('.small', s1)[i], { autoAlpha: 0, y: 12, duration: 0.6 }, t + 1.2);
  });
  say(s1, 21.4, 'Everything else in this film is about doing those three things for a million people at once.', 'body');
  cue(25.5, 'whoosh', { dur: 0.8 });

  // ================================================================ S2 26–42
  section(26, 'Fmaj9', 0.55);
  const rows = [
    ['', '1,000,000', 'people use it each day'],
    ['× 50', '50,000,000', 'messages a day'],
    ['÷ 86,400 s', '≈ 580', 'messages a second, on average'],
    ['× 3', '≈ 1,740', 'a second at the evening peak'],
    ['× 200 B', '10 GB', 'of new messages a day'],
    ['× 3 copies × 365', '≈ 11 TB', 'stored a year'],
    ['× 20% online', '200,000', 'connections open at once', 'key'],
  ];
  const s2 = scene('s2', 26, 42, `
    <div class="ledger"><div class="ledger-inner">
      ${rows.map(([op, v, s, k]) => `<div class="row ${k || ''}" style="grid-template-columns:440px 1fr"><span class="op">${op}</span><span class="val"><span class="v">${v}</span><small>${s}</small></span></div>`).join('')}
    </div></div>
    <div class="ledger-rail"></div>
    <div class="ledger-stops"><span>Traffic</span><span>Storage</span><span>Connections</span></div>`);
  sign(s2, 26.4, 'Do the arithmetic first');
  const ledger = $('.ledger', s2), rowEls = $$('.row', s2);
  // each row is scrolled to the reading line; CSS view() timelines reveal rows,
  // the rail is a scroll() timeline over the same container
  const readAt = r => r.offsetTop + r.offsetHeight / 2 - 330;
  M.set(ledger, { scrollTop: readAt(rowEls[0]) - 300 }, 26);
  rowEls.forEach((r, i) => {
    const t = 27.2 + i * 1.62;
    M.to(ledger, { scrollTop: readAt(r), duration: 0.9, ease: 'move' }, t);
    const v = $('.v', r);
    M.to(v, { scrambleText: { text: v.textContent, chars: '0123456789', speed: 0.6, revealDelay: 0.25 }, duration: 0.8, ease: 'none' }, t + 0.25);
    cue(t + 0.3, 'tick', { gain: 0.8 }); cue(t + 0.62, 'tick', { gain: 0.5 }); cue(t + 0.95, 'msg', { gain: 0.8 });
  });
  M.to(ledger, { scrollTop: ledger.scrollHeight - 700, duration: 1.0, ease: 'move' }, 38.6);
  M.from($$('.ledger-stops span', s2), { autoAlpha: 0, x: -10, stagger: 0.06, duration: 0.5 }, 26.8);
  say(s2, 39.3, 'Bytes are easy. Holding 200,000 lines open at once is the real problem.', 'body', 'left:1480px;top:690px;bottom:auto;max-width:330px;font-size:34px');
  cue(39.3, 'chime');
  cue(41.5, 'whoosh', { dur: 0.8 });

  // ========================================================== S3+S4 42–70
  section(42, 'Gm9', 0.6);
  const s3 = scene('s3', 42, 70, '');
  const legs = PEOPLE.map(([x, y], i) => diag(x, y, 600, 560 + (i - 4) * 18, SERVER.x));
  const m3 = svg(s3, `
    ${legs.map((d, i) => `<path class="track ghost leg" id="g${i}" d="${d}" style="stroke-width:10"/>`).join('')}
    ${legs.map((d, i) => `<path class="track blue ws" id="w${i}" d="${d}" style="stroke-width:10"/>`).join('')}
    ${PEOPLE.map(([x, y]) => `<circle class="station person" cx="${x}" cy="${y}" r="17"/>`).join('')}
    <g id="srv"><rect class="station big" id="srvBox" x="${SERVER.x}" y="${SERVER.y}" width="${SERVER.w}" height="${SERVER.h}" rx="44"/>
      <rect id="srvPlate" x="${SERVER.x + 46}" y="${SERVER.y + 66}" width="208" height="108" rx="16" fill="#f8f9f6"/>
      <text class="lg mid" id="srvT" x="${SERVER.x + 150}" y="${SERVER.y + 112}">Server</text>
      <text class="sub mid" id="srvS" x="${SERVER.x + 150}" y="${SERVER.y + 152}">app + database</text></g>
    <text class="sub" x="230" y="262">Each circle stands for about 22,000 people</text>`);
  const sign3 = sign(s3, 42.4, 'One server, asked over and over', '1', '');
  M.from($$('.person', m3), { scale: 0.95, autoAlpha: 0, stagger: 0.04, transformOrigin: '50% 50%', duration: 0.4 }, 42.6);
  M.from($('#srv', m3), { scale: 0.95, autoAlpha: 0, transformOrigin: '50% 50%', duration: 0.6 }, 43.0);
  $$('.leg', m3).forEach((p, i) => draw(p, 43.2 + i * 0.04, 0.8));
  gsap.set($$('.ws', m3), { drawSVG: '0%' });
  // polling: every client asks "anything new?" on a timer; nearly all answers are empty
  const R = rng(42);
  const polls = [];
  for (let k = 0; k < 64; k++) {
    const i = k % 9, p = $(`#g${i}`, m3), dot = dotEl(m3, 'dot hollow', 9);
    const t = 44.2 + (k / 64) * 1.6 + R() * 0.3, per = 1.25 - Math.min(0.55, k * 0.012);
    const reps = Math.max(1, Math.floor((53.6 - t) / per));
    const tl = gsap.timeline({ repeat: reps - 1 });
    const full = R() < 0.06;
    tl.set(dot, { autoAlpha: 1, attr: { class: 'dot hollow' } })
      .to(dot, { motionPath: { path: p, align: p, alignOrigin: [0.5, 0.5], start: 0, end: 1 }, duration: per * 0.46, ease: 'move' })
      .set(dot, { attr: { class: full ? 'dot' : 'dot hollow' } })
      .to(dot, { motionPath: { path: p, align: p, alignOrigin: [0.5, 0.5], start: 1, end: 0 }, duration: per * 0.46, ease: 'move' })
      .set(dot, { autoAlpha: 0 });
    M.add(tl, t); polls.push(dot);
    if (k < 24) for (let r = 0; r < Math.min(reps, 3); r++) cue(t + r * per + per * 0.46, 'tick', { gain: 0.25 });
  }
  const rate = document.createElement('div');
  rate.style.cssText = 'position:absolute;left:1190px;top:730px;width:700px';
  rate.innerHTML = `<div class="h2" style="font-size:60px"><span class="num" id="rq">0</span> <span id="rqL">requests a second</span></div>
    <div class="small" id="rqS" style="margin-top:10px">200,000 people asking every 2 seconds. Only about 1,740 of those requests carry a message.</div>`;
  s3.appendChild(rate);
  M.from(rate, { autoAlpha: 0, y: 16, duration: 0.5 }, 45.4);
  const rq = $('#rq', rate), RQ = { v: 0 };
  M.to(RQ, { v: 100000, duration: 4.5, ease: 'power2.in' }, 45.4);
  frameHooks.push(() => (rq.textContent = fmt(RQ.v)));
  const say3 = say(s3, 48.6, 'Polling asks “anything new?” 100,000 times a second. The answer is almost always no.');
  // overload: congestion hatch, the station shudders (exaggeration), timeouts
  section(50, 'Ebmaj7#11', 0.72);
  M.set('#srvBox', { fill: 'url(#hazard-s3)' }, 51.0);
  M.fromTo('#srv', { x: 0 }, { x: 7, duration: 0.05, ease: 'none', yoyo: true, repeat: 23, immediateRender: false }, 51.0);
  cue(51.0, 'error', { dur: 1.2, gain: 1 }); cue(51.0, 'impact', { gain: 0.5 });
  M.to(say3, { autoAlpha: 0, duration: 0.3, ease: 'leave' }, 53.3);

  // --- S4: keep the line open (same map, new line colour)
  section(56, 'Dm9', 0.5);
  M.to(sign3, { autoAlpha: 0, duration: 0.3, ease: 'leave' }, 55.3);
  M.to(polls, { autoAlpha: 0, duration: 0.2 }, 53.8);
  M.set('#srvBox', { fill: '#f8f9f6' }, 54.4);
  M.to(rate, { autoAlpha: 0, duration: 0.3, ease: 'leave' }, 54.4);
  const sign4 = sign(s3, 55.7, 'Keep the line open', '2', 'blue');
  const hs = document.createElement('div');
  hs.style.cssText = 'position:absolute;left:1190px;top:250px;width:560px';
  hs.innerHTML = `<div class="label">GET /chat  Upgrade: websocket</div><div class="label" style="color:var(--blue);margin-top:8px">101 Switching Protocols</div>
    <div class="small" style="margin-top:8px">One handshake, then the connection stays open both ways. [4]</div>`;
  s3.appendChild(hs);
  M.from($$('.label, .small', hs), { autoAlpha: 0, y: 10, stagger: 0.12, duration: 0.5 }, 56.3);
  $$('.ws', m3).forEach((p, i) => { draw(p, 56.6 + i * 0.07, 0.7, 'settle'); cue(56.6 + i * 0.07 + 0.6, 'click', { gain: 0.35 }); });
  M.to($$('.leg', m3), { autoAlpha: 0, duration: 0.4 }, 57.6);
  // only real messages move now, pushed by the server
  for (let k = 0; k < 14; k++) {
    const i = Math.floor(R() * 9), t = 58.2 + k * 0.42 + R() * 0.2;
    if (t > 65.2) break;
    const dot = dotEl(m3, 'dot', 10);
    travel(dot, $(`#w${i}`, m3), t, 0.7, { from: 1, to: 0 });
    M.set(dot, { autoAlpha: 0 }, t + 0.9);
    cue(t + 0.7, 'msg');
  }
  const rate2 = document.createElement('div');
  rate2.style.cssText = 'position:absolute;left:1190px;top:730px;width:700px';
  rate2.innerHTML = `<div class="h2" style="font-size:60px"><span class="num">1,740</span> messages a second</div><div class="small" style="margin-top:10px">Instead of 100,000 questions, only real messages travel.</div>`;
  s3.appendChild(rate2);
  M.from(rate2, { autoAlpha: 0, y: 16, duration: 0.5 }, 58.0);
  M.to(rate2, { autoAlpha: 0, duration: 0.3, ease: 'leave' }, 60.6);
  const wa = document.createElement('div');
  wa.style.cssText = 'position:absolute;left:1190px;top:720px;width:640px';
  wa.innerHTML = `<div class="h1"><span class="num" id="wa">0,000,000</span></div>
    <div class="small" style="margin-top:12px">Open connections on one WhatsApp server in 2012. Every one costs memory, so one box only goes so far. [6]</div>`;
  s3.appendChild(wa);
  M.from(wa, { autoAlpha: 0, y: 16, duration: 0.6 }, 61.0);
  M.to('#wa', { scrambleText: { text: '2,277,845', chars: '0123456789', revealDelay: 0.3 }, duration: 1.2, ease: 'none' }, 61.0);
  cue(61.0, 'chime');
  // and then it fails: one server is one outage
  section(64, 'Gm9', 0.45, { drums: false });
  M.to(wa, { autoAlpha: 0, duration: 0.35, ease: 'leave' }, 65.4);
  M.set(['#srvBox', '#srvPlate'], { fill: '#15181c' }, 66.0);
  M.set(['#srvT', '#srvS'], { fill: '#e8ebe7' }, 66.0);
  M.to($$('.ws', m3), { stroke: '#c6ccc6', duration: 0.25, stagger: 0.05, ease: 'settle' }, 66.1);
  cue(66.0, 'impact', { gain: 1 }); cue(66.05, 'glitch', { dur: 0.4 });
  const say4 = say(s3, 66.6, 'But one server is one outage. When it goes, everyone goes.');
  M.to([sign4, hs], { autoAlpha: 0, duration: 0.35, ease: 'leave' }, 69.0);
  M.to(say4, { autoAlpha: 0, duration: 0.3, ease: 'leave' }, 69.2);
  cue(69.6, 'whoosh', { dur: 0.7 });

  // =============================================================== S5 70–88
  section(70, 'Bbmaj7', 0.68);
  const s5 = scene('s5', 70, 88, '');
  const LB = { x: 620, y: 470, w: 160, h: 180 };
  const GW = [0, 1, 2, 3].map(k => ({ x: 960, y: 280 + k * 150, w: 190, h: 110 }));
  const SVC = { B: { x: 1380, y: 480, w: 200, h: 160 }, C: { x: 1380, y: 300, w: 200, h: 160 } };
  const DB = { B: { x: 1680, y: 480, w: 170, h: 160 }, C: { x: 1680, y: 300, w: 170, h: 160 } };
  const ROUTER = { x: 1380, y: 690, w: 200, h: 150 };
  const cy = b => b.y + b.h / 2;
  const toLB = PEOPLE.map(([x, y], i) => diag(x, y, 380, 560 + (i - 4) * 14, LB.x));
  const lbGw = GW.map((g, k) => diag(LB.x + LB.w, 560 + (k - 1.5) * 18, LB.x + LB.w + 4, cy(g), g.x));
  const gwSvcB = GW.map((g, k) => ortho(g.x + g.w, cy(g), 1260 + k * 8, cy(SVC.B) + (k - 1.5) * 16, SVC.B.x));
  const gwSvcC = GW.map((g, k) => ortho(g.x + g.w, cy(g) - 14, 1205 + k * 12, cy(SVC.C) + (k - 1.5) * 16, SVC.C.x));
  const routerGw = GW.map((g, k) => ortho(ROUTER.x, cy(ROUTER) + (k - 1.5) * 16, 1335 - k * 12, cy(g) + 14, g.x + g.w));
  const m5 = svg(s5, `
    ${legs.map((d, i) => `<path class="track ghost old" d="${d}" style="stroke-width:10"/>`).join('')}
    ${toLB.map((d, i) => `<path class="track blue thin nl" id="pl${i}" d="${d}"/>`).join('')}
    ${lbGw.map((d, k) => `<path class="track blue thin nl" id="lg${k}" d="${d}"/>`).join('')}
    ${gwSvcB.map((d, k) => `<path class="track ink thin nlB" id="gs${k}" d="${d}"/>`).join('')}
    ${gwSvcC.map((d, k) => `<path class="track ink thin nlC" id="gc${k}" d="${d}"/>`).join('')}
    ${routerGw.map((d, k) => `<path class="track violet thin nlC" id="rg${k}" d="${d}"/>`).join('')}
    <path class="track green thin nlB" id="sdB" d="M${SVC.B.x + SVC.B.w},${cy(SVC.B)} H${DB.B.x}"/>
    <path class="track green thin nlC" id="sdC" d="M${SVC.C.x + SVC.C.w},${cy(SVC.C)} H${DB.C.x}"/>
    <path class="track violet thin nlC" id="sr" d="M${SVC.C.x + 100},${SVC.C.y + SVC.C.h} V${ROUTER.y}"/>
    ${PEOPLE.map(([x, y], i) => `<circle class="station" cx="${x}" cy="${y}" r="17" ${i === 1 || i === 7 ? 'style="stroke:#da291c"' : ''}/>`).join('')}
    <text x="290" y="${PEOPLE[1][1] + 10}" class="end">Alice</text>
    <text x="290" y="${PEOPLE[7][1] + 10}" class="end">Bob</text>`);
  const vt = document.createElement('div'); vt.className = 'vt-map'; s5.appendChild(vt);
  const node = (name, label, sub, cls = '') => {
    const n = document.createElement('div'); n.className = `node ${cls}`; n.style.viewTransitionName = name;
    n.innerHTML = `<div>${label}${sub ? `<span class="sub">${sub}</span>` : ''}</div>`; vt.appendChild(n); return n;
  };
  const nLB = node('lb', 'Load balancer', '', 'blue');
  const nGW = GW.map((_, k) => node(`gw${k}`, `Gateway ${k + 1}`, '50,000 connections', 'blue'));
  const nSVC = node('svc', 'Chat service', 'stateless');
  const nDB = node('db', 'Database', '', 'green');
  const nR = node('router', 'Pub/sub', 'who is on which gateway');
  nR.style.borderColor = 'var(--violet)';
  const place = (n, b, show = true) => Object.assign(n.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', display: show ? 'grid' : 'none' });
  const gw0A = nGW[0].innerHTML, gw0B = gw0A;
  function layout(state) {
    const A = state === 'A';
    place(nLB, LB, !A); nGW.forEach((n, k) => place(n, k === 0 && A ? SERVER : GW[k], k === 0 || !A));
    nGW[0].innerHTML = A ? '<div>Server<span class="sub" style="color:var(--rule)">offline</span></div>' : gw0B;
    nGW[0].style.background = A ? 'var(--ink)' : ''; nGW[0].style.color = A ? 'var(--paper)' : '';
    nGW[0].style.borderColor = A ? 'var(--ink)' : '';
    place(nSVC, state === 'C' ? SVC.C : SVC.B, !A); place(nDB, state === 'C' ? DB.C : DB.B, !A); place(nR, ROUTER, state === 'C');
  }
  layout('A');
  viewTransitions.push({ t0: 71.0, dur: 1.3, from: 'A', to: 'B', apply: layout });
  viewTransitions.push({ t0: 79.2, dur: 1.0, from: 'B', to: 'C', apply: layout });
  cue(71.0, 'whoosh', { dur: 1.0 }); cue(72.1, 'impact', { gain: 0.35 });
  cue(79.2, 'whoosh', { dur: 0.8, gain: 0.7 });
  M.to($$('.old', m5), { drawSVG: '0%', duration: 0.5, ease: 'settle' }, 70.4);
  gsap.set($$('.nl,.nlB,.nlC', m5), { drawSVG: '0%' });
  $$('.nl', m5).forEach((p, i) => draw(p, 72.2 + i * 0.03, 0.7, 'settle'));
  $$('.nlB', m5).forEach((p, i) => draw(p, 72.6 + i * 0.05, 0.6, 'settle'));
  const sign5 = sign(s5, 70.6, 'Many doors, and a map of who is where', '3', 'blue');
  // Alice -> LB -> gateway 1 -> service ... and then: where is Bob?
  const dA = dotEl(m5, 'dot', 12);
  travel(dA, $('#pl1', m5), 73.8, 0.8); travel(dA, $('#lg0', m5), 74.6, 0.5); travel(dA, $('#gs0', m5), 75.1, 0.7);
  cue(73.8, 'send'); cue(75.8, 'msg');
  M.to(dA, { autoAlpha: 0, duration: 0.2 }, 78.9);
  const q = document.createElement('div'); q.className = 'h1';
  q.style.cssText = 'position:absolute;left:1600px;top:300px;color:var(--red)'; q.textContent = 'Bob?';
  s5.appendChild(q);
  M.fromTo(q, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' }, 76.0);
  M.to(q, { autoAlpha: 0, duration: 0.25, ease: 'leave' }, 78.9);
  cue(76.0, 'error', { dur: 0.25, gain: 0.5 });
  const say5 = say(s5, 76.3, 'Bob holds an open line to gateway 3. Nothing on Alice’s side knows that.');
  M.to(say5, { autoAlpha: 0, duration: 0.3, ease: 'leave' }, 78.9);
  M.to($$('.nlB', m5), { autoAlpha: 0, duration: 0.3 }, 78.9);
  $$('.nlC', m5).forEach((p, i) => draw(p, 80.2 + i * 0.05, 0.6, 'settle'));
  const reg = document.createElement('div');
  reg.style.cssText = `position:absolute;left:${ROUTER.x + ROUTER.w + 40}px;top:${ROUTER.y + 6}px`;
  reg.innerHTML = `<div class="label">Alice → gateway 1</div><div class="label" style="margin-top:12px;color:var(--violet)">Bob → gateway 3</div>`;
  s5.appendChild(reg);
  M.from($$('.label', reg), { autoAlpha: 0, x: -12, stagger: 0.12, duration: 0.5 }, 80.6);
  // second message, now routed: service -> pub/sub -> gateway 3 -> Bob
  const dB = dotEl(m5, 'dot', 12);
  travel(dB, $('#pl1', m5), 81.4, 0.7); travel(dB, $('#lg0', m5), 82.1, 0.45); travel(dB, $('#gc0', m5), 82.55, 0.6);
  travel(dB, $('#sr', m5), 83.15, 0.45); travel(dB, $('#rg2', m5), 83.6, 0.6);
  travel(dB, $('#lg2', m5), 84.2, 0.5, { from: 1, to: 0 }); travel(dB, $('#pl7', m5), 84.7, 0.75, { from: 1, to: 0 });
  cue(81.4, 'send'); cue(83.15, 'click'); cue(85.45, 'chime');
  pulse($$('circle.station', m5)[7], 85.45, 1.4);
  say(s5, 82.0, 'A registry knows who is on which gateway, and pub/sub carries the message there. Slack shards this with consistent hashing. [8] [9] [10]', 'caption', 'max-width:36em');
  M.to(sign5, { autoAlpha: 0, duration: 0.3, ease: 'leave' }, 87.4);
  cue(87.6, 'whoosh', { dur: 0.7 });

  // =============================================================== S6 88–104
  section(88, 'Gm9', 0.7);
  const s6 = scene('s6', 88, 104, '');
  sign(s6, 88.4, 'Give every message a place, and an order', '4', 'green');
  const BX = 160, BW = 22, BG = 3, BY = 330;
  const bitCls = i => (i === 0 ? '#c6ccc6' : i <= 41 ? '#15181c' : i <= 51 ? '#0039a6' : '#da291c');
  const m6 = svg(s6, `
    <g id="bits">${[...Array(64)].map((_, i) => `<rect class="bit" x="${BX + i * (BW + BG)}" y="${BY}" width="${BW}" height="70" rx="4" fill="${bitCls(i)}"/>`).join('')}
      <text x="${BX + 25}" y="${BY + 120}">41 bits of time</text><text class="sub" x="${BX + 25}" y="${BY + 156}">milliseconds since Nov 2010</text>
      <text x="${BX + 42 * 25}" y="${BY + 120}" style="fill:#0039a6">10 bits</text><text class="sub" x="${BX + 42 * 25}" y="${BY + 156}">which machine</text>
      <text x="${BX + 52 * 25}" y="${BY + 120}" style="fill:#da291c">12 bits</text><text class="sub" x="${BX + 52 * 25}" y="${BY + 156}">sequence in that ms</text></g>
    <g id="parts"></g>`);
  const idEl = document.createElement('div'); idEl.className = 'h2';
  idEl.style.cssText = 'position:absolute;left:160px;top:240px'; idEl.innerHTML = 'Message ID <span class="num" id="sfid">0000000000000000000</span>';
  s6.appendChild(idEl);
  M.from($$('.bit', m6), { scaleY: 0.2, autoAlpha: 0, transformOrigin: '50% 100%', duration: 0.5, stagger: 0.007, ease: 'settle' }, 89.0);
  M.from($$('#bits text', m6), { autoAlpha: 0, y: 10, stagger: 0.08, duration: 0.5 }, 89.6);
  M.from(idEl, { autoAlpha: 0, duration: 0.4 }, 89.0);
  M.to('#sfid', { scrambleText: { text: '1847293058561028096', chars: '0123456789', revealDelay: 0.4 }, duration: 1.4, ease: 'none' }, 89.1);
  for (let k = 0; k < 8; k++) cue(89.0 + k * 0.06, 'tick', { gain: 0.4 });
  const say6a = say(s6, 90.8, 'Snowflake IDs sort by time and need no coordination: any machine can mint one. Order inside a chat comes for free. [15]');
  M.to([$('#bits', m6), idEl, say6a], { autoAlpha: 0, y: -20, duration: 0.45, ease: 'leave' }, 95.0);
  // partitions: (channel, 10-day bucket) -> one partition on one node
  section(96, 'Am7', 0.74);
  const parts = $('#parts', m6), chans = ['launch', 'general', 'random'], NODES = 6;
  let ph = `<text class="sub" x="160" y="330">Channel</text><text class="sub" x="380" y="330">time  →</text>`;
  chans.forEach((c, r) => (ph += `<text x="160" y="${400 + r * 110}">#${c}</text><line x1="380" x2="1240" y1="${390 + r * 110}" y2="${390 + r * 110}" stroke="#c6ccc6" stroke-width="3"/>`));
  for (let b = 1; b < 4; b++) ph += `<line class="bk" x1="${380 + b * 215}" x2="${380 + b * 215}" y1="340" y2="640" stroke="#4b525a" stroke-width="2" stroke-dasharray="6 8"/>`;
  for (let n = 0; n < NODES; n++) ph += `<g class="sn"><circle class="station big" cx="1560" cy="${300 + n * 92}" r="30" style="stroke:#00933c"/><text class="sub" x="1612" y="${308 + n * 92}">node ${n + 1}</text></g>`;
  parts.innerHTML = ph;
  M.from($$('#parts > text, #parts > line', m6), { autoAlpha: 0, duration: 0.5, stagger: 0.03 }, 95.6);
  M.from($$('.sn', m6), { autoAlpha: 0, x: 16, duration: 0.5, stagger: 0.05 }, 95.9);
  const Rp = rng(96);
  for (let r = 0; r < 3; r++) for (let b = 0; b < 4; b++) {
    const node = (r * 4 + b * 5) % NODES, nx = 1560, ny = 300 + node * 92;
    for (let m = 0; m < 4; m++) {
      const c = dotEl(parts, 'dot', 9), x = 400 + b * 215 + m * 46 + Rp() * 10, y = 390 + r * 110;
      const t = 96.2 + b * 0.35 + r * 0.08 + m * 0.05;
      M.fromTo(c, { attr: { cx: x, cy: y }, autoAlpha: 0, scale: 0.95 }, { autoAlpha: 1, scale: 1, duration: 0.25, immediateRender: false }, t);
      // whole bucket moves together: one partition, one node
      const tm = 98.4 + (r * 4 + b) * 0.09;
      M.to(c, { attr: { cx: nx + (m - 1.5) * 9, cy: ny }, duration: 0.8, ease: 'move' }, tm);
      M.to(c, { autoAlpha: 0, duration: 0.2 }, tm + 0.8);
      if (m === 0) { cue(t, 'msg', { gain: 0.5 }); if (r === 0) cue(tm + 0.8, 'click', { gain: 0.5 }); }
    }
  }
  $$('.sn circle', m6).forEach((c, n) => pulse(c, 99.2 + n * 0.08, 1.2));
  const disc = document.createElement('div');
  disc.style.cssText = 'position:absolute;left:120px;bottom:96px;width:1600px';
  disc.innerHTML = `<div class="body"><b>Key = (channel, 10-day bucket).</b> One chat’s recent history lives together, so loading it is one fast read. [11]</div>
    <div class="caption" style="margin-top:14px">Discord stores trillions of messages this way: 177 Cassandra nodes became 72 ScyllaDB nodes, and p99 reads fell from 40–125 ms to about 15 ms. [12]</div>`;
  s6.appendChild(disc);
  rise($('.body', disc), 99.4, { stagger: 0.025 });
  M.from($('.caption', disc), { autoAlpha: 0, y: 12, duration: 0.6 }, 100.6);
  cue(103.6, 'whoosh', { dur: 0.6 });

  // ============================================================== S7 104–120
  section(104, 'Bbmaj7', 0.8);
  const s7 = scene('s7', 104, 120, '');
  sign(s7, 104.4, 'Write it down first, then deliver', '5', 'amber');
  const RX = 1560, RY = [330, 450, 570, 690, 810], names = ['Maya', 'Jon', 'Priya', 'Sam', 'Lee'];
  const SL = 14, LX = 470, LW = 44;
  const fan = RY.map(y => ortho(1110, 560, 1260, y, RX - 24));
  const pushD = route([[1110, 560], [1290, 560], [1290, 930], [RX - 120, 930]]);
  const m7 = svg(s7, `
    <path class="track red thin" id="in7" d="M270,560 H${LX - 10}"/>
    <rect x="${LX - 12}" y="520" width="${SL * LW + 24}" height="80" rx="16" fill="none" stroke="#fccc0a" stroke-width="10"/>
    ${[...Array(SL)].map((_, i) => `<rect class="slot" x="${LX + i * LW + 4}" y="534" width="${LW - 8}" height="52" rx="6" fill="${i < 9 ? '#15181c' : '#f8f9f6'}" stroke="#c6ccc6" stroke-width="2"/>`).join('')}
    <text x="${LX}" y="500">The log</text><text class="sub" x="${LX + 120}" y="500">append-only, replicated</text>
    ${fan.map((d, i) => `<path class="track blue thin fan" id="f${i}" d="${d}" ${i === 4 ? 'stroke-dasharray="4 14"' : ''}/>`).join('')}
    <path class="track ink thin" id="push" d="${pushD}"/><path class="track ink thin" id="push2" d="M${RX},895 V832" stroke-dasharray="4 14"/>
    <circle class="station big" cx="230" cy="560" r="34" style="stroke:#da291c"/><text x="230" y="640" class="mid">Alice</text>
    ${RY.map((y, i) => `<g class="rcp" id="r${i}"><circle class="station" cx="${RX}" cy="${y}" r="22"/><circle class="pres" cx="${RX + 22}" cy="${y - 20}" r="10" fill="${i === 4 ? '#c6ccc6' : '#b933ad'}" stroke="#e8ebe7" stroke-width="4"/>
      <text x="${RX + 50}" y="${y + 10}">${names[i]}</text><text class="sub st7" x="${RX + 150}" y="${y + 9}">${i === 4 ? 'offline' : ''}</text></g>`).join('')}
    <g id="pushN"><rect class="station" x="${RX - 120}" y="895" width="240" height="70" rx="35"/><text class="mid" x="${RX}" y="941" style="font-size:26px">Push: APNs / FCM</text></g>`);
  M.from($$('.rcp', m7), { autoAlpha: 0, x: 14, stagger: 0.06, duration: 0.5 }, 104.9);
  M.from($$('.slot', m7), { autoAlpha: 0, stagger: 0.02, duration: 0.3 }, 105.0);
  gsap.set($$('.fan, #push, #push2', m7), { drawSVG: '0%' });
  $$('.fan', m7).forEach((p, i) => draw(p, 105.4 + i * 0.05, 0.6, 'settle'));
  draw($('#push', m7), 105.8, 0.5); draw($('#push2', m7), 106.2, 0.3);
  M.from('#pushN', { autoAlpha: 0, scale: 0.95, transformOrigin: '50% 50%', duration: 0.4 }, 106.0);
  const status = document.createElement('div');
  status.style.cssText = 'position:absolute;left:150px;top:680px;width:300px';
  status.innerHTML = `<div class="bubble me" style="animation:none;max-width:300px;font-size:28px">Famous last words.<span class="meta" id="st">Sending</span></div>`;
  s7.appendChild(status);
  M.from(status, { autoAlpha: 0, y: 14, scale: 0.95, duration: 0.45 }, 106.2);
  const dm = dotEl(m7, 'dot', 13);
  travel(dm, $('#in7', m7), 107.0, 0.6); cue(107.0, 'send');
  M.to(dm, { autoAlpha: 0, duration: 0.05 }, 107.65);
  M.set($$('.slot', m7)[9], { fill: '#da291c' }, 107.6);
  pulse($$('.slot', m7)[9], 107.6, 1.25); cue(107.6, 'click');
  M.to('#st', { text: 'Sent', duration: 0.01 }, 108.0); cue(108.0, 'msg', { freq: 1760 });
  // fan-out: one copy per recipient; the offline one goes through push
  RY.forEach((y, i) => {
    const c = dotEl(m7, 'dot', 11), t = 108.6 + i * 0.12;
    if (i < 4) travel(c, $(`#f${i}`, m7), t, 0.8);
    if (i < 4) { cue(t + 0.8, 'msg'); pulse($(`#r${i} circle`, m7), t + 0.8, 1.3); M.to(c, { autoAlpha: 0, duration: 0.15 }, t + 1.0); }
    else { travel(c, $('#push', m7), t, 1.1); travel(c, $('#push2', m7), t + 1.25, 0.4); cue(t + 1.1, 'click'); cue(t + 1.65, 'chime', { gain: 0.6 }); M.to(c, { autoAlpha: 0, duration: 0.2 }, t + 1.8); }
  });
  M.to('#st', { text: 'Delivered', duration: 0.01 }, 109.6);
  const say7 = say(s7, 109.8, 'Append to a replicated log, then say “sent”. Delivery can retry; the message can’t vanish. At peak: 1,740 × 10 recipients = 17,400 deliveries a second. [16] [17]');
  M.to(say7, { autoAlpha: 0, duration: 0.3, ease: 'leave' }, 113.4);
  // presence: heartbeats on the beat; Priya's stop, and after a grace period she reads offline
  section(112, 'Csus', 0.82);
  for (let b = 0; b < 14; b++) {
    const t = 112.0 + b * 0.5;
    $$('.pres', m7).forEach((p, i) => { if (i === 4 || (i === 2 && t > 114.6)) return; pulse(p, t + i * 0.03, 1.35); });
  }
  M.to($$('.pres', m7)[2], { fill: '#c6ccc6', duration: 0.3 }, 116.6);
  M.to($$('.st7', m7)[2], { text: 'offline', duration: 0.01 }, 116.6);
  cue(116.6, 'glitch', { dur: 0.15, gain: 0.5 });
  say(s7, 113.6, 'Presence is a heartbeat every few seconds. Miss a few, and after a grace period you read as offline. [18]');
  cue(119.5, 'riser', { dur: 1.2, gain: 0.7 });

  // ============================================================== S8 120–134
  section(120, 'Dm9', 0.9);
  const s8 = scene('s8', 120, 134, `
    <div style="position:absolute;left:120px;top:270px;width:760px">
      <div class="h1 line-clip r8">Measure.</div><div class="h1 line-clip r8">Find the bottleneck.</div>
      <div class="h1 line-clip r8">Remove it.</div><div class="h1 line-clip r8" style="color:var(--red)">Repeat.</div>
    </div>`);
  sign(s8, 120.3, 'The whole map');
  M.to(W, { vis: 1, duration: 0.8, ease: 'settle' }, 120.0);
  M.set(W, { me: 0, reveal: world.maxDist + 1, arcs: 0.5, pointAlpha: 0.75, camPolar: 1.2, camDist: 175, ty: 13, camAz: -0.45, shiftX: -120 }, 119.9);
  M.to(W, { camAz: 0.4, camDist: 140, duration: 14, ease: 'sine.inOut' }, 120.0);
  M.to(W, { labels: 1, duration: 0.6, ease: 'settle' }, 122.6);
  M.to(W, { labels: 0, duration: 0.4, ease: 'leave' }, 126.6);
  M.to(W, { shiftX: -420, duration: 1.4, ease: 'move' }, 126.8);
  M.to(W, { layers: 1, duration: 2.4, ease: 'arrive' }, 120.6);
  M.to(W, { online: 0.2, duration: 1.6, ease: 'settle' }, 121.4);
  M.to(W, { flow: 1, duration: 0.8, ease: 'settle' }, 122.4);
  $$('.r8', s8).forEach((r, i) => { rise(r, 127.6 + i * 0.8, { stagger: 0.05 }); cue(127.6 + i * 0.8, 'click', { gain: 0.6 }); });
  section(128, 'Fmaj9', 0.9);
  cue(128.0, 'impact', { gain: 0.6 });
  say(s8, 131.0, 'That is how one server becomes a million hellos.', 'body');
  M.to(W, { vis: 0, duration: 0.6, ease: 'leave' }, 133.4);

  // ============================================================= S9 134–144
  section(134, 'Dsus', 0.22, { drums: false, arp: false });
  const SRC = [
    ['Latency numbers every programmer should know', 'J. Dean, P. Norvig, c. 2012'], ['System Design Interview, ch. 12: chat', 'Alex Xu, 2020'],
    ['Designing Data-Intensive Applications', 'Martin Kleppmann, 2017'], ['RFC 6455: The WebSocket Protocol', 'IETF, 2011'],
    ['The C10K problem', 'Dan Kegel, 1999'], ['1 million is so 2011', 'WhatsApp, 2012'],
    ['How Discord scaled Elixir to 5,000,000 concurrent users', 'Discord, 2017'], ['Real-time messaging', 'Slack Engineering, 2023'],
    ['Redis Pub/Sub', 'Redis docs'], ['Consistent hashing and random trees', 'Karger et al., STOC 1997'],
    ['How Discord stores billions of messages', 'Discord, 2017'], ['How Discord stores trillions of messages', 'Discord, 2023'],
    ['Dynamo: Amazon’s highly available key-value store', 'DeCandia et al., SOSP 2007'], ['Cassandra: a decentralized structured storage system', 'Lakshman, Malik, 2010'],
    ['Announcing Snowflake', 'Twitter Engineering, 2010'], ['Kafka: a distributed messaging system for log processing', 'Kreps, Narkhede, Rao, 2011'],
    ['Building mobile-first infrastructure for Messenger', 'Facebook Engineering, 2014'], ['Now you see me, now you don’t: real-time presence', 'LinkedIn Engineering, 2018'],
    ['User notifications (APNs)', 'Apple developer docs'], ['Site Reliability Engineering, ch. 19–21: load balancing', 'Google, 2016'],
  ];
  const s9 = scene('s9', 134, 144.2, `
    <div class="credits">${SRC.map(([a, b], i) => `<p><b>[${i + 1}] ${a}</b><br>${b}</p>`).join('')}</div>
    <p class="small" style="position:absolute;left:120px;bottom:80px;margin:0;max-width:1680px">Animated in one HTML file with GSAP 3, Three.js, scroll-driven CSS and View Transitions. Rendered frame by frame in headless Chromium, encoded with ffmpeg. Soundtrack synthesized in Python from the same timeline.</p>`);
  sign(s9, 134.3, 'Sources');
  M.from($$('.credits p', s9), { autoAlpha: 0, y: 12, stagger: 0.04, duration: 0.5 }, 134.7);
  M.from($('p.small', s9), { autoAlpha: 0, duration: 0.8 }, 136.0);
  cue(134.0, 'chime', { gain: 0.8 });
  return 144.2;
}
