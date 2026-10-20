// Three.js scene: a million people as points on the map's ground plane,
// message "comets" arcing between them, and (finale) the architecture rising
// above them in layers. All state lives in W, which GSAP tweens on the master
// timeline; render(t) is a pure function of W and t.
import * as THREE from 'three';
import { rng } from './core.js';

export const N_USERS = 1_000_000;
const PAPER = 0xe8ebe7, INK = 0x15181c, RED = 0xda291c, BLUE = 0x0039a6, GREEN = 0x00933c, AMBER = 0xfccc0a;

export const W = {
  reveal: 0.02, camDist: 0.7, camPolar: 0.0001, camAz: 0, tx: 0, ty: 0, tz: 0,
  pointAlpha: 0.75, arcs: 0, layers: 0, online: 0, me: 1, flow: 0, shiftX: 0, vis: 0, labels: 0,
};

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(1920, 1080, false);
  renderer.setClearColor(PAPER, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.01, 4000);
  const R = rng(20261013);
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // ---------------------------------------------------- a million people
  // Towns with pareto-ish sizes + a thin rural spread. Person 0 sits at the origin:
  // that is the "hey" from the cold open.
  const towns = [{ x: 0, z: 0, s: 4.5, w: 2 }];
  for (let i = 0; i < 46; i++) {
    const a = R() * Math.PI * 2, r = 8 + Math.pow(R(), 0.7) * 66;
    towns.push({ x: Math.cos(a) * r, z: Math.sin(a) * r * 0.82, s: 1.6 + R() * 4.6, w: Math.pow(R(), 2.2) * 2 + 0.08 });
  }
  const cum = []; let tot = 0; for (const t of towns) cum.push(tot += t.w);
  const pos = new Float32Array(N_USERS * 3), rand = new Float32Array(N_USERS), dist = new Float32Array(N_USERS);
  for (let i = 1; i < N_USERS; i++) {
    let x, z;
    if (R() < 0.16) { const a = R() * 6.2832, r = Math.sqrt(R()) * 82; x = Math.cos(a) * r; z = Math.sin(a) * r * 0.8; }
    else {
      const k = R() * tot; let j = 0; while (cum[j] < k) j++;
      const t = towns[j]; x = t.x + gauss() * t.s; z = t.z + gauss() * t.s;
    }
    pos[i * 3] = x; pos[i * 3 + 2] = z; rand[i] = R(); dist[i] = Math.hypot(x, z);
  }
  rand[0] = 0;
  const sorted = Float32Array.from(dist).sort();
  const maxDist = sorted[N_USERS - 1];
  // exact count of people within radius r (what the on-screen counter shows)
  const countWithin = r => { let lo = 0, hi = N_USERS; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= r) lo = m + 1; else hi = m; } return lo; };

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  const uniforms = {
    uReveal: { value: 0 }, uAlpha: { value: 0.5 }, uOnline: { value: 0 }, uScale: { value: 1080 / (2 * Math.tan((32 * Math.PI) / 360)) },
    uInk: { value: new THREE.Color(INK) }, uBlue: { value: new THREE.Color(BLUE) },
  };
  const people = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aRand; uniform float uReveal, uScale, uOnline; varying float vA; varying float vOn;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = length(position.xz);
        vA = 1.0 - smoothstep(uReveal * 0.9 - 0.05, uReveal + 0.01, d);
        vOn = step(aRand, uOnline);
        gl_PointSize = clamp(0.16 * uScale / -mv.z, 1.0, 9.0) * (1.0 + vOn * 0.4);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uInk, uBlue; uniform float uAlpha; varying float vA; varying float vOn;
      void main() {
        vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard;
        gl_FragColor = vec4(mix(uInk, uBlue, vOn), vA * uAlpha * (1.0 + vOn * 1.5));
      }`,
  }));
  scene.add(people);

  // "me": the first person, drawn as a red station marker
  const meGeo = new THREE.BufferGeometry(); meGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.01, 0]), 3));
  const meU = { uScale: uniforms.uScale, uMe: { value: 1 } };
  const me = new THREE.Points(meGeo, new THREE.ShaderMaterial({
    uniforms: meU, transparent: true, depthTest: false,
    vertexShader: `uniform float uScale; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(0.5*uScale/-mv.z, 16.0, 120.0); }`,
    fragmentShader: `uniform float uMe; void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard;
      vec3 col = d > .36 ? vec3(0.082,0.094,0.11) : (d > .22 ? vec3(0.973,0.976,0.965) : vec3(0.855,0.161,0.11));
      gl_FragColor = vec4(col, uMe); }`,
  }));
  me.renderOrder = 10;
  scene.add(me);

  // ------------------------------------------------------ message comets
  const ARCS = 520, SAMPLES = 40;
  const ap = new Float32Array(ARCS * SAMPLES * 3), au = new Float32Array(ARCS * SAMPLES), ao = new Float32Array(ARCS * SAMPLES);
  const pick = () => { const i = Math.floor(R() * N_USERS); return [pos[i * 3], pos[i * 3 + 2]]; };
  for (let a = 0; a < ARCS; a++) {
    const [x0, z0] = a < 6 ? [0, 0] : pick(); let [x1, z1] = pick();
    if (R() < 0.6) { x1 = x0 + gauss() * 14; z1 = z0 + gauss() * 14; }
    const len = Math.hypot(x1 - x0, z1 - z0), h = 1 + len * 0.32, off = R(), speed = 0.35 + R() * 0.45;
    for (let s = 0; s < SAMPLES; s++) {
      const u = s / (SAMPLES - 1), k = a * SAMPLES + s;
      ap[k * 3] = x0 + (x1 - x0) * u; ap[k * 3 + 1] = Math.sin(Math.PI * u) * h; ap[k * 3 + 2] = z0 + (z1 - z0) * u;
      au[k] = u; ao[k] = off + speed * 1000; // speed packed into the integer part
    }
  }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
  ag.setAttribute('aU', new THREE.BufferAttribute(au, 1));
  ag.setAttribute('aO', new THREE.BufferAttribute(ao, 1));
  const arcU = { uTime: { value: 0 }, uArcs: { value: 0 }, uScale: uniforms.uScale };
  const arcs = new THREE.Points(ag, new THREE.ShaderMaterial({
    uniforms: arcU, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aU, aO; uniform float uTime, uScale; varying float vA;
      void main() {
        float speed = floor(aO) / 1000.0, off = fract(aO);
        float head = fract(uTime * speed + off) * 1.4;  // 0..1.4: travel, then rest
        float tail = head - aU;
        vA = (tail >= 0.0 && tail < 0.22) ? 1.0 - tail / 0.22 : 0.0;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(0.4 * uScale / -mv.z, 2.6, 12.0) * (0.45 + 0.55 * vA);
      }`,
    fragmentShader: `uniform float uArcs; varying float vA; void main(){ vec2 c=gl_PointCoord-.5; if(dot(c,c)>.25||vA<=0.0) discard; gl_FragColor=vec4(0.855,0.161,0.11, vA*uArcs); }`,
  }));
  scene.add(arcs);

  // ------------------------------------------------ architecture layers
  // Ground: people. Then gateways (blue), chat service (ink), the log (amber),
  // storage partitions (green). Same colours as the 2D map.
  const arch = new THREE.Group(); scene.add(arch);
  const flat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true });
  const mats = [];
  const LAYER = { gw: 9, svc: 16, log: 22, db: 28 };
  const ring = (n, r, y, phase = 0) => [...Array(n)].map((_, i) => new THREE.Vector3(Math.cos(phase + i / n * 6.2832) * r, y, Math.sin(phase + i / n * 6.2832) * r * 0.85));
  const gws = ring(8, 30, LAYER.gw, 0.2), svcs = ring(4, 14, LAYER.svc, 0.6), dbs = ring(6, 16, LAYER.db, 0.1);
  const logC = new THREE.Vector3(0, LAYER.log, 0);
  function station(p, color, r = 1.8, h = 0.7) {
    const m1 = flat(0xf8f9f6), m2 = flat(color); mats.push(m1, m2);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), m2);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, h + 0.25, 48), m1);
    disc.position.copy(p); top.position.copy(p); arch.add(disc, top);
  }
  gws.forEach(p => station(p, BLUE)); svcs.forEach(p => station(p, INK, 2.2)); dbs.forEach(p => station(p, GREEN, 2.4, 1.6));
  const logMat = flat(AMBER); mats.push(logMat);
  const log = new THREE.Mesh(new THREE.TorusGeometry(7, 0.55, 16, 96), logMat); log.rotation.x = Math.PI / 2; log.position.copy(logC); arch.add(log);
  const tube = (a, b, color, r = 0.16) => {
    const mid = a.clone().lerp(b, 0.5); mid.y += 0.6;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const m = flat(color); mats.push(m);
    arch.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, r, 8), m));
    return curve;
  };
  const bigTowns = towns.slice(0, 24);
  const routes = [];
  bigTowns.forEach(t => {
    const g0 = gws.reduce((best, gp) => (Math.hypot(gp.x - t.x, gp.z - t.z) < Math.hypot(best.x - t.x, best.z - t.z) ? gp : best));
    routes.push(tube(new THREE.Vector3(t.x, 0, t.z), g0, BLUE, 0.1));
  });
  gws.forEach((p, i) => tube(p, svcs[i % 4], INK, 0.14));
  svcs.forEach(p => tube(p, logC.clone().add(new THREE.Vector3(p.x, 0, p.z).setLength(7)), AMBER, 0.2));
  dbs.forEach(p => tube(logC.clone().add(new THREE.Vector3(p.x, 0, p.z).setLength(7)), p, GREEN, 0.2));

  // red messages riding the layers: town -> gateway -> service -> log -> storage
  const FLOW = 90;
  const flowMat = flat(RED); mats.push(flowMat);
  const flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 16, 12), flowMat, FLOW); arch.add(flow);
  const paths = [...Array(FLOW)].map(() => {
    const t = bigTowns[Math.floor(R() * bigTowns.length)];
    const g0 = gws.reduce((best, gp) => (Math.hypot(gp.x - t.x, gp.z - t.z) < Math.hypot(best.x - t.x, best.z - t.z) ? gp : best));
    const s = svcs[gws.indexOf(g0) % 4], d = dbs[Math.floor(R() * 6)];
    const lp = logC.clone().add(new THREE.Vector3(s.x, 0, s.z).setLength(7));
    return { pts: [new THREE.Vector3(t.x, 0, t.z), g0, s, lp, d], off: R(), speed: 0.12 + R() * 0.1 };
  });
  const tmp = new THREE.Object3D();

  // DOM labels projected from 3D anchors
  const labelEl = document.getElementById('labels3d');
  const logRing = ring(16, 7, LAYER.log);
  const labels = [
    ['1,000,000 people, 200,000 online', [new THREE.Vector3(34, 0, 50)], '#15181c'],
    ['Gateways hold the open connections', gws, '#0039a6'],
    ['The chat service routes each message', svcs, '#15181c'],
    ['The log makes it durable', logRing, '#fccc0a'],
    ['Storage partitions keep it forever', dbs, '#00933c'],
  ].map(([text, pts, c]) => {
    const el = document.createElement('div'); el.className = 'l3'; el.innerHTML = `<i style="background:${c}"></i>${text}`;
    labelEl.appendChild(el); return { el, pts, w: 0 };
  });

  const v = new THREE.Vector3();
  function render(t) {
    if (W.vis <= 0.001) { labels.forEach(l => (l.el.style.opacity = 0)); return; }
    if (W.shiftX) camera.setViewOffset(1920, 1080, W.shiftX, 0, 1920, 1080); else camera.clearViewOffset();
    const sp = Math.sin(W.camPolar), cp = Math.cos(W.camPolar);
    camera.position.set(W.tx + W.camDist * sp * Math.sin(W.camAz), W.ty + W.camDist * cp, W.tz + W.camDist * sp * Math.cos(W.camAz));
    camera.up.set(0, cp > 0.999 ? 0 : 1, cp > 0.999 ? -1 : 0);
    camera.lookAt(W.tx, W.ty, W.tz);
    // fewer pixels per person as the camera pulls back: keep the density readable
    uniforms.uReveal.value = W.reveal; uniforms.uAlpha.value = W.pointAlpha * Math.min(1, Math.max(0.22, 22 / W.camDist)); uniforms.uOnline.value = W.online;
    meU.uMe.value = W.me; arcU.uTime.value = t; arcU.uArcs.value = W.arcs;
    arch.visible = W.layers > 0.001;
    if (arch.visible) {
      arch.scale.set(1, Math.max(0.001, W.layers), 1);
      mats.forEach(m => (m.opacity = Math.min(1, W.layers * 1.5)));
      paths.forEach((p, i) => {
        const u = ((t * p.speed + p.off) % 1) * 4, k = Math.min(3, Math.floor(u)), f = u - k;
        tmp.position.copy(p.pts[k]).lerp(p.pts[k + 1], f);
        tmp.scale.setScalar(W.flow);
        tmp.updateMatrix(); flow.setMatrixAt(i, tmp.matrix);
      });
      flow.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
    labels.forEach(l => {
      if (!l.w) l.w = l.el.offsetWidth;
      let bx = -1e9, by = 0;
      for (const p of l.pts) {
        v.copy(p); v.y *= W.layers; v.project(camera);
        const sx = ((v.x + 1) / 2) * 1920, sy = ((1 - v.y) / 2) * 1080;
        if (sx > bx) { bx = sx; by = sy; }
      }
      l.x = Math.min(bx + 34, 1920 - 60 - l.w); l.y = by - 14;
    });
    // keep labels at least one line apart, top to bottom
    [...labels].sort((a, b) => a.y - b.y).reduce((prev, l) => { if (l.y < prev + 40) l.y = prev + 40; return l.y; }, -1e9);
    labels.forEach(l => { l.el.style.transform = `translate(${l.x}px, ${l.y}px)`; l.el.style.opacity = W.labels; });
  }
  return { render, countWithin, maxDist, canvas };
}
