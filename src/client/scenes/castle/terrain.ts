import * as THREE from "three";

// The castle scene's ground (ADR 0015): a valley floor with the paved
// courtyard (the plot, x 0–32, z 0–26, at y = 0) set slightly into it. A
// stone apron runs round the plot; behind and beside it the grass stands a
// little higher, held by a low retaining wall, and in front it is level
// with the road, which runs out towards the viewer. Low hills rise behind,
// and mountains stand far off. None of it is buildable or pickable.

export const PLOT = { w: 32, d: 26 };
export const CENTRE = { x: PLOT.w / 2, z: PLOT.d / 2 };
/** Width of the paved apron round the plot. */
export const APRON = 3;
/** How far the grass behind and beside the courtyard stands above it. */
export const RIM = 0.9;
/** The front corridor: from the plot's front edge outwards, nothing tall stands in it. */
export const FRONT = { z0: PLOT.d + APRON, halfWidth: 46 };

export const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const hash = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The road's centre line, x as a function of z, for z past the apron. */
export function roadX(z: number): number {
  return CENTRE.x + 7 * Math.sin((z - FRONT.z0) / 46) * smooth(FRONT.z0, FRONT.z0 + 40, z);
}
export const ROAD_HALF = 3.2;

const inApron = (x: number, z: number): boolean => x > -APRON && x < PLOT.w + APRON && z > -APRON && z < PLOT.d + APRON;

/** Height of the ground at (x, z). */
export function groundY(x: number, z: number): number {
  if (inApron(x, z)) return -0.04;
  const side = Math.max(0, Math.abs(x - CENTRE.x) - (CENTRE.x + APRON));
  const back = Math.max(0, -APRON - z);
  // the rim: up quickly beyond the retaining wall, behind and beside only
  const out = Math.max(side, back);
  const frontFade = 1 - smooth(FRONT.z0 - 1, FRONT.z0 + 8, z);
  let y = RIM * smooth(0, 0.6, out) * frontFade;
  // the low hills behind, and rising ground well off to the sides
  const roll = Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.031) * 2.2 + Math.sin(x * 0.11 - z * 0.07) * 0.8;
  y += smooth(-8, -110, z) * (7 + roll) + smooth(-80, -260, z) * 10;
  y += smooth(48, 150, Math.abs(x - CENTRE.x)) * (5 + roll * 0.6) * (1 - smooth(60, 160, z) * 0.6);
  // in front: a very gentle fall away from the courtyard, so the view stays open
  y -= smooth(FRONT.z0 + 4, FRONT.z0 + 90, z) * 1.2;
  return y;
}

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

const GRASS = new THREE.Color("#7fb04f");
const MEADOW = new THREE.Color("#93bd57");
const HILL = new THREE.Color("#5f9446");
const SCRUB = new THREE.Color("#6b8f45");
const PAVING = new THREE.Color("#b9b6ad");
const ROAD = new THREE.Color("#a9a49a");
const VERGE = new THREE.Color("#9aa36a");

/** The valley floor and hills; the near part finely divided so the courtyard's edges stay crisp. */
export function groundGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(900, 760, 450, 380);
  g.translate(CENTRE.x, -(-380 + 260), 0); // z from −500 to 260 once rotated
  const r = rng(31120);
  return shaded(g, (x, z, y) => {
    if (inApron(x, z)) {
      // flagstones of the apron, each a slightly different grey
      const v = hash(Math.floor((x + 40) / 2), Math.floor((z + 40) / 2));
      return PAVING.clone().multiplyScalar(0.92 + v * 0.1);
    }
    const toRoad = Math.abs(x - roadX(z));
    if (z > FRONT.z0 - 0.5 && toRoad < ROAD_HALF) {
      const v = hash(Math.floor((x - roadX(z)) / 1.6 + 10), Math.floor(z / 1.3));
      return ROAD.clone().multiplyScalar(0.9 + v * 0.14);
    }
    if (z > FRONT.z0 - 0.5 && toRoad < ROAD_HALF + 1.2) return VERGE.clone().multiplyScalar(0.96 + r() * 0.05);
    const c = GRASS.clone().lerp(MEADOW, 0.5 + 0.5 * Math.sin(x * 0.07) * Math.cos(z * 0.05));
    c.lerp(HILL, Math.min(1, Math.max(0, y - 1) / 9));
    if (Math.sin(x * 0.17 + 1) * Math.cos(z * 0.13) > 0.55 && y > 1.5) c.lerp(SCRUB, 0.5);
    return c.multiplyScalar(0.95 + r() * 0.07);
  });
}

/**
 * The same land, coarsely, out to the horizon on every side, beyond the
 * detailed valley.
 */
export function outerGroundGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2400, 2400, 120, 120);
  g.rotateX(-Math.PI / 2);
  g.translate(CENTRE.x, 0, CENTRE.z);
  const pos = g.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // under the detailed valley it sits well below, out of sight; past it, it carries the land on
    const under = Math.abs(x - CENTRE.x) < 440 && z > -490 && z < 250;
    pos.setY(i, groundY(x, z) - (under ? 6 : 0.35));
    const c = GRASS.clone().lerp(MEADOW, 0.5 + 0.5 * Math.sin(x * 0.01) * Math.cos(z * 0.012));
    colours.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}

// ---- the mountains --------------------------------------------------------------

const ROCK = new THREE.Color("#8796a8");
const ROCK_DARK = new THREE.Color("#6f7f92");
const SNOW = new THREE.Color("#f4f7fb");
const FOOT = new THREE.Color("#6f9a6a");

/**
 * A range far behind the valley. The peaks stand off to either side; the
 * skyline directly behind the courtyard is a lower, quiet saddle, so the
 * castle's silhouette reads against the sky.
 */
export function mountainHeight(x: number, z: number): number {
  const u = x - CENTRE.x;
  const ridge = Math.exp(-(((z + 330) / 70) ** 2));
  const peaks =
    Math.max(0, Math.sin(u * 0.012 + 0.6)) * 70 +
    Math.max(0, Math.sin(u * 0.027 + 2.1)) * 36 +
    Math.max(0, Math.sin(u * 0.061 + 4.0)) * 14 +
    Math.sin(u * 0.13 + z * 0.05) * 4;
  const saddle = 0.42 + 0.58 * smooth(30, 150, Math.abs(u));
  return Math.max(0, ridge * (28 + peaks) * saddle);
}

export function mountainGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1100, 260, 220, 52);
  g.rotateX(-Math.PI / 2);
  g.translate(CENTRE.x, 0, -330);
  const pos = g.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = mountainHeight(x, z);
    const y = groundY(x, z) + h - 2;
    pos.setY(i, y);
    const snowLine = 58 + Math.sin(x * 0.09) * 6;
    const c = FOOT.clone().lerp(ROCK, smooth(4, 26, h)).lerp(ROCK_DARK, 0.4 * hash(Math.floor(x / 9), Math.floor(z / 9)));
    c.lerp(SNOW, smooth(snowLine - 6, snowLine + 4, h));
    colours.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}

/** The farthest ridges, painted once into a canvas behind the range, pale with distance. */
export function backdropTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const ridges: [string, number, number, number][] = [
    ["#c5d6e6", 0.42, 0.011, 5],
    ["#aebfd3", 0.3, 0.019, 9],
  ];
  for (const [colour, base, freq, seed] of ridges) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i <= W; i += 4) {
      const shape = Math.sin(i * freq + seed) * 0.5 + Math.sin(i * freq * 2.3 + seed * 2) * 0.3 + Math.sin(i * freq * 5.1) * 0.1;
      ctx.lineTo(i, H - (base + shape * 0.16) * H);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
