import * as THREE from 'three';

export const USERS = 1_000_000;

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const HUBS = [
  { name: 'us-east', pos: new THREE.Vector3(-26, 0, -4), share: 0.42 },
  { name: 'eu-west', pos: new THREE.Vector3(3, 0, -15), share: 0.33 },
  { name: 'ap-south', pos: new THREE.Vector3(29, 0, 9), share: 0.25 },
];

const RAMP = [1.3, 2.1, 3.2, 4.8];
const RAMP_P = [0.72, 0.2, 0.065, 0.015];

function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

function buildUsers() {
  const rnd = mulberry32(20261012);
  const cities = HUBS.map((hub) => Array.from({ length: 36 }, (_, i) => {
    const r = i === 0 ? 0 : 2 + rnd() * 13;
    const a = rnd() * Math.PI * 2;
    return { x: hub.pos.x + Math.cos(a) * r, z: hub.pos.z + Math.sin(a) * r * 0.8, s: 0.6 + rnd() * 2.2, w: 1 / (1 + r * 0.25) };
  }));
  const cityCdf = cities.map((list) => {
    const total = list.reduce((s, c) => s + c.w, 0);
    let acc = 0;
    return list.map((c) => (acc += c.w / total));
  });
  const pos = new Float32Array(USERS * 3);
  const size = new Float32Array(USERS);
  for (let i = 0; i < USERS; i++) {
    let h = 0;
    const r = rnd();
    if (r > HUBS[0].share) h = r > HUBS[0].share + HUBS[1].share ? 2 : 1;
    const cr = rnd();
    const cdf = cityCdf[h];
    let c = 0;
    while (c < cdf.length - 1 && cdf[c] < cr) c++;
    const city = cities[h][c];
    pos[i * 3] = city.x + gauss(rnd) * city.s;
    pos[i * 3 + 1] = 0;
    pos[i * 3 + 2] = city.z + gauss(rnd) * city.s * 0.8;
    const m = rnd();
    let k = 0;
    let acc = RAMP_P[0];
    while (m > acc && k < 3) acc += RAMP_P[++k];
    size[i] = RAMP[k];
  }
  pos[0] = HUBS[0].pos.x + 1.5;
  pos[2] = HUBS[0].pos.z + 1;
  size[0] = RAMP[3];
  return { pos, size };
}

function ribbon(points, width, color, opacity) {
  const verts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = new THREE.Vector3().subVectors(b, a).normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(width / 2);
    const a1 = a.clone().add(n), a2 = a.clone().sub(n), b1 = b.clone().add(n), b2 = b.clone().sub(n);
    verts.push(a1.x, 0.01, a1.z, a2.x, 0.01, a2.z, b1.x, 0.01, b1.z, b1.x, 0.01, b1.z, a2.x, 0.01, a2.z, b2.x, 0.01, b2.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
}

function arc(a, b, lift) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const d = new THREE.Vector3().subVectors(b, a);
  mid.add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(lift));
  return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(48);
}

export function createSector(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(1920, 1080, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1920 / 1080, 0.05, 600);

  const grid = [];
  for (let v = -80; v <= 80; v += 4) grid.push(v, 0, -60, v, 0, 60, -80, 0, v * 0.75, 80, 0, v * 0.75);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x55625e, transparent: true, opacity: 0.32 })));

  const rings = [];
  for (const hub of HUBS) {
    for (const r of [5, 10, 15]) {
      for (let i = 0; i < 96; i++) {
        const a0 = (i / 96) * Math.PI * 2, a1 = ((i + 1) / 96) * Math.PI * 2;
        if (i % 4 === 3) continue;
        rings.push(hub.pos.x + Math.cos(a0) * r, 0.005, hub.pos.z + Math.sin(a0) * r, hub.pos.x + Math.cos(a1) * r, 0.005, hub.pos.z + Math.sin(a1) * r);
      }
    }
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(rings, 3));
  scene.add(new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ color: 0x8a9692, transparent: true, opacity: 0.4 })));

  const airways = new THREE.Group();
  const pairs = [[0, 1, 0.12], [1, 2, -0.14], [0, 2, 0.22]];
  const airMat = new THREE.MeshBasicMaterial({ color: 0xb5247f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  for (const [a, b, lift] of pairs) { const m = ribbon(arc(HUBS[a].pos, HUBS[b].pos, lift), 0.3, 0xb5247f, 0.9); m.material = airMat; airways.add(m); }
  scene.add(airways);

  const { pos, size } = buildUsers();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 1 }, uColor: { value: new THREE.Color(0xeadcb4) } },
    vertexShader: `
      attribute float aSize; uniform float uScale; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_Position = projectionMatrix * mv;
        float s = aSize * uScale * clamp(28.0 / -mv.z, 0.6, 1.7);
        gl_PointSize = max(s, 1.0);
        vA = 0.35 + 0.16 * aSize;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = length(c);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, vA * smoothstep(0.5, 0.32, d));
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const ambientTarget = new THREE.Vector3();
  const finalTarget = new THREE.Vector3(1, 0, -3);
  const youPos = new THREE.Vector3(pos[0], 0, pos[2]);
  const v = new THREE.Vector3();

  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));

  function place(t, reveal) {
    if (reveal <= 0) {
      ambientTarget.set(-34 + t * 0.42, 0, -2 + Math.sin(t * 0.05) * 3);
      camera.position.set(ambientTarget.x + 4, 62, ambientTarget.z + 30);
      camera.lookAt(ambientTarget);
      return;
    }
    const k = smooth(reveal);
    const target = v.copy(youPos).lerp(finalTarget, k);
    const dist = 16 + 85 * k;
    const elev = 0.95 + 0.1 * k;
    const yaw = -0.35 + 0.5 * k;
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(elev) * dist,
      Math.sin(elev) * dist,
      target.z + Math.cos(yaw) * Math.cos(elev) * dist,
    );
    camera.lookAt(target);
  }

  return {
    render(t, users, reveal) {
      geo.setDrawRange(0, Math.max(1, Math.min(USERS, Math.round(users))));
      mat.uniforms.uScale.value = 0.7 + 0.3 * reveal;
      airMat.opacity = 0.3 + 0.6 * reveal;
      place(t, reveal);
      renderer.render(scene, camera);
    },
    project(vec) {
      const p = vec.clone().project(camera);
      return { x: (p.x * 0.5 + 0.5) * 1920, y: (-p.y * 0.5 + 0.5) * 1080, visible: p.z < 1 };
    },
  };
}
