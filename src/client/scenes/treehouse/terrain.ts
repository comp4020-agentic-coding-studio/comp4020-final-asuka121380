import * as THREE from "three";

// Woodland Commons' ground (ADR 0016): a forest clearing. The plot (x 0–32,
// z 0–28, at y = 0) is a grassy floor; round it the meadow carries on,
// level, to the forest edge, which closes in behind and to the sides and
// stays well back in front, so the view from the default camera is open.
// Gentle wooded rises lie farther off. None of it is buildable or pickable.

export const PLOT = { w: 32, d: 28 };
export const CENTRE = { x: PLOT.w / 2, z: PLOT.d / 2 };
/** The clearing's edge: an ellipse round the plot, wider in front. */
export const CLEARING = { back: 9, side: 13, front: 46 };

export const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export const hash = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** How far (x, z) is outside the clearing, in units of its radius (0 inside). */
export function outside(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - CENTRE.x) - CENTRE.x) / CLEARING.side;
  const dz = z < CENTRE.z ? Math.max(0, -z) / CLEARING.back : Math.max(0, z - PLOT.d) / CLEARING.front;
  return Math.hypot(dx, dz);
}

/** Height of the ground at (x, z). */
export function groundY(x: number, z: number): number {
  if (x > -1 && x < PLOT.w + 1 && z > -1 && z < PLOT.d + 1) return -0.04;
  const o = outside(x, z);
  const roll = Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.04) * 1.6 + Math.sin(x * 0.13 - z * 0.09) * 0.5;
  let y = smooth(0.6, 3, o) * (2 + roll);
  // wooded rises well behind and to the sides; the front falls away very gently
  y += smooth(-30, -160, z) * 9 + smooth(50, 180, Math.abs(x - CENTRE.x)) * 6;
  y -= smooth(PLOT.d + 10, PLOT.d + 120, z) * 1.0;
  return y;
}

const GRASS = new THREE.Color("#86b552");
const MEADOW = new THREE.Color("#9cc25c");
const FLOOR = new THREE.Color("#79a24c");
const LITTER = new THREE.Color("#b58a4a");
const PATH = new THREE.Color("#c8b58a");

/** Is (x, z) on the beaten path that runs from the front up to the tree? */
export const onPath = (x: number, z: number): boolean => z > PLOT.d + 1 && Math.abs(x - (CENTRE.x - 2 + Math.sin(z * 0.08) * 3)) < 1.6;

function shaded(geom: THREE.PlaneGeometry, colour: (x: number, z: number, y: number) => THREE.Color): THREE.BufferGeometry {
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundY(x, z);
    pos.setY(i, y);
    const c = colour(x, z, y);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geom.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geom.computeVertexNormals();
  return geom;
}

/** The clearing and the forest floor round it, finely divided near the plot. */
export function groundGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(520, 460, 260, 230);
  g.translate(CENTRE.x, -(-230 + 140), 0); // z from −320 to 140 once rotated
  const r = rng(21318);
  return shaded(g, (x, z) => {
    if (onPath(x, z)) return PATH.clone().multiplyScalar(0.94 + r() * 0.08);
    const o = outside(x, z);
    const c = GRASS.clone().lerp(MEADOW, 0.5 + 0.5 * Math.sin(x * 0.09) * Math.cos(z * 0.07));
    c.lerp(FLOOR, smooth(0.5, 1.4, o));
    // fallen leaves under the trees at the clearing's edge
    if (hash(Math.floor(x / 1.5), Math.floor(z / 1.5)) > 0.82 && o > 0.9) c.lerp(LITTER, 0.35);
    return c.multiplyScalar(0.95 + r() * 0.07);
  });
}

/** The same land, coarsely, out to the horizon, beyond the detailed part. */
export function outerGroundGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2400, 2400, 100, 100);
  g.rotateX(-Math.PI / 2);
  g.translate(CENTRE.x, 0, CENTRE.z);
  const pos = g.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const under = Math.abs(x - CENTRE.x) < 255 && z > -315 && z < 135;
    pos.setY(i, groundY(x, z) - (under ? 6 : 0.35));
    const c = FLOOR.clone().lerp(GRASS, 0.4 + 0.3 * Math.sin(x * 0.01) * Math.cos(z * 0.012));
    colours.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}

/** Distant woodland, painted once into a canvas round the horizon: cooler and paler with distance. */
export function backdropTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const rows: [string, number, number, number][] = [
    // quiet and hazy: close in tone to the horizon, so the near groves lead
    ["#c6d8d0", 0.44, 0.04, 3],
    ["#b0c7b8", 0.35, 0.06, 7],
    ["#99b49f", 0.27, 0.09, 11],
  ];
  for (const [colour, base, freq, seed] of rows) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    // a tree line: rounded crowns with the odd taller conifer
    for (let i = 0; i <= W; i += 3) {
      const crowns = Math.abs(Math.sin(i * freq + seed)) * 0.06 + Math.sin(i * freq * 0.21 + seed) * 0.05;
      const spire = Math.max(0, Math.sin(i * freq * 1.7 + seed * 3) - 0.92) * 1.2;
      ctx.lineTo(i, H - (base + crowns + spire) * H);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
