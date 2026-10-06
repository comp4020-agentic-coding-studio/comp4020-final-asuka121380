import * as THREE from "three";
import { SEA_LEVEL, SHORE_Z } from "./water.ts";

// The ground of the beach scene: a level coastal strip with the plot in it,
// the beach falling gently to the water with a few low dunes, and land
// rising gently inland. The plot itself (x 0–16, z 0–8) stays at y = 0;
// none of this is buildable, and it is all appearance (ADR 0004).

export const PROMENADE = { z0: 10, z1: 14 };
const BEACH_TOP = 14.6;

const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// Low dunes, kept away from the stretch of beach in front of the plot, so
// the foreground stays open.
const DUNES: [number, number, number, number][] = [
  [-46, 21, 9, 1.0],
  [-26, 24, 6, 0.7],
  [-64, 27, 11, 1.1],
  [40, 22, 7, 0.8],
  [58, 25, 10, 1.1],
  [84, 21, 8, 0.9],
  [-92, 22, 9, 0.9],
  [116, 26, 12, 1.0],
];

/** Height of the sand at (x, z), for z past the promenade. */
export function sandY(x: number, z: number): number {
  const t = (z - BEACH_TOP) / (SHORE_Z - BEACH_TOP);
  let y = t <= 0 ? -0.05 : -0.05 + (SEA_LEVEL + 0.05) * Math.pow(Math.min(t, 1), 1.25);
  if (z > SHORE_Z) y = SEA_LEVEL - (z - SHORE_Z) * 0.08;
  for (const [dx, dz, r, h] of DUNES) {
    const d2 = ((x - dx) ** 2) / (r * r * 2.2) + ((z - dz) ** 2) / (r * r * 0.6);
    y += h * Math.exp(-d2) * (1 - smooth(SHORE_Z - 14, SHORE_Z, z));
  }
  // faint wind ripples
  y += 0.04 * Math.sin(x * 0.7 + z * 0.3) * Math.sin(z * 1.3);
  return y;
}

/** Height of the land at (x, z), for z behind the promenade. */
export function landY(x: number, z: number): number {
  const inland = smooth(-22, -160, z);
  const roll = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) * 2.5 + Math.sin(x * 0.047 - z * 0.031) * 1.2;
  return inland * (9 + roll) + smooth(-90, -300, z) * 14;
}

function shaded(geom: THREE.PlaneGeometry, height: (x: number, z: number) => number, colour: (x: number, z: number, y: number) => THREE.Color): THREE.BufferGeometry {
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    const c = colour(x, z, y);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geom.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geom.computeVertexNormals();
  return geom;
}

const DRY = new THREE.Color("#f8e4b8");
const WET = new THREE.Color("#dcb985");
const PALE = new THREE.Color("#fbe8c4");

export function beachGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(900, 90, 300, 60);
  g.translate(0, -(BEACH_TOP - 1 + 45), 0); // z from 13.6 to 103.6 once rotated
  const r = rng(7);
  return shaded(g, sandY, (x, z, y) => {
    const wet = smooth(SHORE_Z - 6, SHORE_Z, z);
    const c = DRY.clone().lerp(WET, wet);
    if (y > 0.2) c.lerp(PALE, Math.min(1, (y - 0.2) / 0.8)); // dune tops dry pale
    return c.multiplyScalar(0.97 + r() * 0.05);
  });
}

const STRIP = new THREE.Color("#ead6ae");
const GRASS = new THREE.Color("#a7b061");
const GOLD = new THREE.Color("#d8b56c");
const SCRUB = new THREE.Color("#7f9653");

export function landGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(900, 440, 180, 110);
  g.translate(0, 440 / 2 - 10, 0); // z from −430 to 10 once rotated
  const r = rng(11);
  // a hair below the plot's top (y = 0), so the two never fight for the same pixels
  return shaded(g, (x, z) => (z > -18 ? -0.04 : landY(x, z) - 0.04), (x, z, y) => {
    if (z > -18) return STRIP.clone().multiplyScalar(0.98 + r() * 0.03);
    const c = GRASS.clone().lerp(GOLD, Math.min(1, y / 10));
    if (Math.sin(x * 0.13) * Math.cos(z * 0.11) > 0.45) c.lerp(SCRUB, 0.6);
    return c.multiplyScalar(0.94 + r() * 0.08);
  });
}

/**
 * The far hills, painted once into a canvas: three ridges fading into the
 * haze, inland only (the sea side stays open to the horizon). Self-made, so
 * there's no image licence to track.
 */
export function backdropTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const ridges: [string, number, number, number][] = [
    ["#c9a6c8", 0.35, 0.012, 7],
    ["#b493b8", 0.52, 0.02, 3],
    ["#9c86ad", 0.68, 0.031, 11],
  ];
  for (const [colour, base, freq, seed] of ridges) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i <= W; i += 4) {
      const u = i / W; // 0..1 round the circle, 0.5 = inland (−z)
      const inland = Math.max(0, Math.cos((u - 0.5) * Math.PI * 2));
      const shape = Math.sin(i * freq + seed) * 0.5 + Math.sin(i * freq * 2.3 + seed * 2) * 0.3 + Math.sin(i * freq * 5.1) * 0.1;
      const h = inland ** 0.6 * (base + shape * 0.18);
      ctx.lineTo(i, H - h * H);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
