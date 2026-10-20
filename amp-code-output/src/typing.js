const INK = [0.102, 0.118, 0.114, 1];
const ease = { i: { x: [0.33], y: [1] }, o: { x: [0.67], y: [0] } };

function dot(index, x) {
  const off = index * 4;
  const keys = (rest, peak) => [
    { t: 0, s: [rest], ...ease },
    { t: off, s: [rest], ...ease },
    { t: off + 7, s: [peak], ...ease },
    { t: off + 14, s: [rest], ...ease },
    { t: 30, s: [rest] },
  ];
  return {
    ddd: 0, ind: index + 1, ty: 4, nm: `dot${index}`, sr: 1, ip: 0, op: 30, st: 0, bm: 0,
    ks: {
      o: { a: 1, k: keys(42, 92) },
      r: { a: 0, k: 0 },
      p: { s: true, x: { a: 0, k: x }, y: { a: 1, k: keys(36, 26) } },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    shapes: [{
      ty: 'gr', nm: 'g',
      it: [
        { ty: 'el', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [15, 15] } },
        { ty: 'fl', c: { a: 0, k: INK }, o: { a: 0, k: 100 }, r: 1 },
        { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
      ],
    }],
  };
}

export function typingLottie(w, h) {
  const gap = 24;
  const cx = w / 2;
  return {
    v: '5.7.4', fr: 30, ip: 0, op: 30, w, h, nm: 'typing', ddd: 0, assets: [],
    layers: [dot(0, cx - gap), dot(1, cx), dot(2, cx + gap)].map((l) => {
      l.ks.p.y.k = l.ks.p.y.k.map((k) => ({ ...k, s: [k.s[0] - 36 + h / 2] }));
      return l;
    }),
  };
}
