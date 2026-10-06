import { Environment as EnvMap } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Batched, LANTERN } from "../../scene/Batched.tsx";
import { setObstacles } from "../../scene/obstacles.ts";
import { Batch, house, type HouseSpec } from "../../scene/scenery.ts";
import { HAZE, skyMaterial, SUN_COLOUR, SUN_DIR } from "./sky.ts";
import { backdropTexture, beachGeometry, landGeometry, landY, PROMENADE, sandY } from "./terrain.ts";
import { SEA_LEVEL, seaMaterial } from "./water.ts";

// The first scene's surroundings (ADR 0004): a row of colourful houses
// facing the sea, inspired by Los Angeles beachfronts at golden hour. It is
// art direction, not a map. Nothing here is in the build, the kit or the
// rules, and none of it is pickable.
//
// Along z, from inland to the sea:
//   z < −18     land rising gently inland, with houses and palms on it
//   z −16..0    back gardens and a lane
//   z 0..8      the houses and the plot (x 0–16), facing +z
//   z 8..10     small front gardens
//   z 10..14    the promenade, a concrete path with a cycle line
//   z 14..58    the beach, falling gently, with low dunes
//   z > 58      the sea, out to the horizon
// The default view looks from the beach, so the sea is behind the camera;
// views along the shore show both the houses and the water.

const WHITE = "#f6f3ec";

// A few near neighbours, each with its own silhouette, height, roof and
// entrance, in purposeful colours rather than beige and grey.
const NEIGHBOURS: HouseSpec[] = [
  {
    // left: two storeys, pink and white, flat roof, balcony over the door
    x: -15, z: 0, w: 12, d: 6, storeys: 2, y: 0.4, roofKind: "flat",
    wall: "#f5a3b7", base: "#e98aa1", trim: WHITE, roof: "#c9c3bd", door: "#ff7059",
    openings: [
      { face: "front", at: 2, kind: "door" },
      { face: "front", at: 6, kind: "window", wide: true, flowers: true },
      { face: "front", at: 1, kind: "window", wide: true, storey: 1 },
      { face: "front", at: 7, kind: "window", wide: true, storey: 1 },
      { face: "back", at: 3, kind: "window" },
      { face: "back", at: 7, kind: "door" },
      { face: "back", at: 3, kind: "window", storey: 1 },
      { face: "left", at: 2, kind: "window", storey: 1 },
      { face: "right", at: 2, kind: "window" },
    ],
    balcony: { storey: 1, from: 0, to: 12 },
  },
  {
    // further left: three storeys, turquoise with yellow trim, steep gable, high plinth
    x: -29, z: 1, w: 10, d: 6, storeys: 3, y: 1.2,
    wall: "#2fb8ae", base: "#1f8f88", trim: "#ffd23f", roof: "#f6f3ec", door: "#ffd23f",
    openings: [
      { face: "front", at: 4, kind: "door" },
      { face: "front", at: 1, kind: "window" },
      { face: "front", at: 7, kind: "window" },
      { face: "front", at: 1, kind: "window", wide: true, storey: 1 },
      { face: "front", at: 6, kind: "window", storey: 1 },
      { face: "front", at: 4, kind: "window", storey: 2 },
      { face: "back", at: 2, kind: "window", storey: 1 },
      { face: "back", at: 6, kind: "door" },
      { face: "left", at: 2, kind: "window", storey: 2 },
      { face: "right", at: 2, kind: "window", storey: 1 },
    ],
    canopy: true,
  },
  {
    // right: one storey, lavender, gable to the shore, coral roof
    x: 21, z: 0, turn: 1, w: 6, d: 8, storeys: 1, y: 0.8,
    wall: "#b9a2e6", base: "#9a84c9", trim: WHITE, roof: "#ff7a5c", door: "#ffd23f",
    openings: [
      { face: "right", at: 1, kind: "door" },
      { face: "right", at: 5, kind: "window", flowers: true },
      { face: "front", at: 2, kind: "window" },
      { face: "back", at: 2, kind: "window" },
      { face: "left", at: 3, kind: "window" },
    ],
    canopy: true,
  },
  {
    // further right: two storeys, sunny yellow, flat roof, wide glass to the sea
    x: 33, z: 0, w: 12, d: 6, storeys: 2, roofKind: "flat",
    wall: "#ffd23f", base: "#e4b520", trim: WHITE, roof: "#c9c3bd", door: "#2a6fd1",
    openings: [
      { face: "front", at: 8, kind: "door" },
      { face: "front", at: 2, kind: "window", wide: true },
      { face: "front", at: 1, kind: "window", wide: true, storey: 1 },
      { face: "front", at: 6, kind: "window", wide: true, storey: 1 },
      { face: "back", at: 4, kind: "door" },
      { face: "back", at: 8, kind: "window", storey: 1 },
      { face: "left", at: 2, kind: "window" },
      { face: "right", at: 2, kind: "window", storey: 1 },
    ],
    balcony: { storey: 1, from: 5, to: 12 },
  },
];

function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** A palm in the brick idiom: a slightly leaning trunk of round segments and a crown of fronds. */
function palm(b: Batch, x: number, z: number, y = 0, h = 9, lean = 0.6, seed = 1): void {
  const segs = Math.round(h / 1.1);
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const g = new THREE.CylinderGeometry(0.32 - t * 0.08, 0.36 - t * 0.08, 1.05, 10);
    g.translate(x + lean * t * t * 2.2, y + 0.55 + i * 1.1, z + lean * t * t * 0.6);
    b.add(i % 2 ? "#8a6a4c" : "#9a7856", g);
  }
  const tx = x + lean * 2.2;
  const tz = z + lean * 0.6;
  const ty = y + segs * 1.1;
  for (let k = 0; k < 8; k++) {
    const frond = new THREE.BoxGeometry(3.4, 0.12, 0.8);
    frond.translate(1.7, 0, 0);
    frond.rotateZ(-0.38 - (k % 2) * 0.15);
    frond.rotateY((k / 8) * Math.PI * 2 + seed);
    frond.translate(tx, ty, tz);
    b.add(k % 2 ? "#3f8f4e" : "#57a95b", frond);
  }
  const nut = new THREE.SphereGeometry(0.28, 8, 6);
  nut.translate(tx, ty - 0.3, tz);
  b.add("#6a4a2e", nut);
}

/** A small brick-built succulent: a few upright leaves. */
function agave(b: Batch, x: number, z: number, y = 0): void {
  for (let k = 0; k < 5; k++) {
    const leaf = new THREE.BoxGeometry(0.22, 1.0, 0.22);
    leaf.translate(0, 0.5, 0);
    leaf.rotateZ(0.5);
    leaf.rotateY((k / 5) * Math.PI * 2);
    leaf.translate(x, y, z);
    b.add("#6fae8f", leaf);
  }
}

/** A lifeguard hut on stilts, with a ramp down to the sand. */
function lifeguard(b: Batch, x: number, z: number, wall: string, trim: string): void {
  const y = sandY(x, z);
  for (const [dx, dz] of [[-1.4, -1.2], [1.4, -1.2], [-1.4, 1.2], [1.4, 1.2]]) b.box(WHITE, 0.3, 2.6, 0.3, x + dx, y, z + dz);
  b.box(trim, 4, 0.3, 3.2, x, y + 2.6, z);
  b.box(wall, 3.2, 2.2, 2.4, x, y + 2.9, z);
  b.box("#9fb7c6", 2.4, 0.9, 0.06, x, y + 3.9, z + 1.22);
  b.box(trim, 3.8, 0.25, 3, x, y + 5.1, z);
  const ramp = new THREE.BoxGeometry(1.2, 0.2, 5);
  ramp.rotateX(-0.5);
  ramp.translate(x, y + 1.3, z - 3.5);
  b.add(WHITE, ramp);
}

/**
 * A middle-distance house: a box with front windows and a parapet or a
 * pitched roof, its front facing +z in the frame `m`. `sink` carries the
 * walls down into a slope, so no corner floats where the ground falls away.
 */
function simpleHouse(b: Batch, m: THREE.Matrix4, w: number, h: number, wall: string, trim: string, flat: boolean, sink = 0): THREE.Box3 {
  const d = 7;
  const one = new Batch();
  one.box(wall, w, h + sink, d, 0, -sink, d / 2);
  for (let s = 0; s < Math.floor(h / 3.4); s++) {
    for (let wx = -w / 2 + 1.4; wx <= w / 2 - 2.2; wx += 3) {
      one.box("#5e7f96", 2, 1.6, 0.1, wx + 1, 1 + s * 3.4, d + 0.02);
      one.box(trim, 2.3, 0.2, 0.3, wx + 1, 0.85 + s * 3.4, d + 0.1);
    }
  }
  if (flat) {
    one.box(trim, w + 0.3, 0.6, d + 0.3, 0, h, d / 2);
  } else {
    const s = new THREE.Shape();
    s.moveTo(-0.3, 0);
    s.lineTo(d + 0.3, 0);
    s.lineTo(d / 2, d * 0.42);
    s.closePath();
    const r = new THREE.ExtrudeGeometry(s, { depth: w + 0.4, bevelEnabled: false });
    r.rotateY(-Math.PI / 2);
    r.translate((w + 0.4) / 2, h, 0);
    one.add(trim, r);
  }
  const placed = new Batch();
  for (const { colour, geometry } of one.build()) placed.add(colour, geometry, m);
  b.merge(placed);
  return placed.bounds();
}

const SHORE_COLOURS: [string, string][] = [
  ["#ff8f73", WHITE],
  ["#7fd3e6", WHITE],
  ["#ffe08a", "#ff7059"],
  [WHITE, "#2fb8ae"],
  ["#f5a3b7", WHITE],
  ["#b9a2e6", WHITE],
  ["#9fd9a3", WHITE],
  ["#ffd23f", WHITE],
];

function nearBatch(boxes: THREE.Box3[]): Batch {
  const b = new Batch();
  for (const s of NEIGHBOURS) {
    const h = house(s);
    boxes.push(h.bounds());
    b.merge(h);
  }

  // front gardens: low white walls and succulents; the plot's front stays open
  for (const [x0, x1] of [[-31, -19], [-16, -2], [19, 31], [32, 46]]) {
    b.box(WHITE, x1 - x0, 0.6, 0.4, (x0 + x1) / 2, 0, 9.6);
    for (let x = x0 + 1.5; x < x1 - 1; x += 3.5) agave(b, x, 8.8);
  }
  // low planted edges either side of the plot
  b.box("#5f9e57", 1.2, 0.8, 8, -1.4, 0, 4);
  b.box("#5f9e57", 1.2, 0.8, 8, 17.4, 0, 4);

  // the promenade: concrete with a dashed yellow line, a low wall to the sand
  const { z0, z1 } = PROMENADE;
  b.box("#ebe5da", 800, 0.08, z1 - z0, 0, -0.06, (z0 + z1) / 2);
  for (let x = -400; x < 400; x += 4) b.box("#f2c230", 2, 0.02, 0.2, x, 0.02, (z0 + z1) / 2);
  b.box("#d9d2c3", 800, 0.5, 0.5, 0, -0.1, z1 + 0.25);
  // benches facing the sea, never in front of the plot
  for (const x of [-38, -22, 30, 52]) {
    b.box("#6fbcd8", 3, 0.2, 0.8, x, 0.55, z1 - 0.9);
    b.box("#6fbcd8", 3, 0.7, 0.2, x, 0.7, z1 - 1.3);
    for (const dx of [-1.2, 1.2]) b.box("#55595e", 0.2, 0.55, 0.6, x + dx, 0, z1 - 0.9);
  }
  // street lamps along the promenade
  for (const x of [-46, -10.5, 26.5, 60]) {
    b.box("#3b3d40", 0.18, 4.8, 0.18, x, 0, z0 + 0.3);
    b.box(LANTERN, 0.5, 0.6, 0.5, x, 4.8, z0 + 0.3);
  }

  // palms on the promenade's edge and behind the houses, clear of the plot
  // (their crowns are near enough for the camera to meet, so they're solid to it)
  const palms: [number, number, number, number, number][] = [
    [-20, 12.4, 10, 0.7, 0.3],
    [-36, 12.6, 8, -0.5, 1.2],
    [33, 12.4, 9, 0.6, 2.1],
    [50, 12.6, 11, -0.4, 0.8],
    [-21, -10, 12, 0.5, 1.7],
    [27, -10, 10, -0.6, 0.4],
  ];
  for (const [x, z, h, lean, seed] of palms) {
    const one = new Batch();
    palm(one, x, z, 0, h, lean, seed);
    boxes.push(one.bounds());
    b.merge(one);
  }

  // back gardens: low walls, and a lane behind them
  for (const [x0, x1] of [[-31, -19], [-16, -2], [-1, 17], [19, 31], [32, 46]]) b.box("#efe7d8", x1 - x0, 1.2, 0.3, (x0 + x1) / 2, 0, -12);
  b.box("#cfc6b6", 800, 0.06, 4, 0, -0.04, -15);

  // lifeguard huts down the beach, one each side
  lifeguard(b, -40, 32, "#7fd3e6", WHITE);
  lifeguard(b, 66, 34, "#ffd23f", "#ff7059");
  return b;
}

function shoreBatch(boxes: THREE.Box3[]): Batch {
  const b = new Batch();
  const r = rng(4020);
  // more beach houses along the shore each way, simpler as they recede
  for (const side of [-1, 1]) {
    let x = side < 0 ? -36 : 50;
    for (let i = 0; i < 14; i++) {
      const w = 9 + Math.round(r() * 5);
      const h = 4 + Math.round(r() * 3) * 3.4;
      const [wall, trim] = SHORE_COLOURS[(i * 3 + (side > 0 ? 1 : 0)) % SHORE_COLOURS.length];
      const cx = side < 0 ? x - w / 2 : x + w / 2;
      boxes.push(simpleHouse(b, new THREE.Matrix4().makeTranslation(cx, 0, 0), w, h, wall, trim, r() > 0.35));
      if (i % 3 === 1) palm(b, cx + (side < 0 ? -w / 2 - 1.5 : w / 2 + 1.5), 11.8, 0, 8 + r() * 4, (r() - 0.5) * 1.4, i);
      x += side * (w + 2 + r() * 2);
    }
  }
  // a pier far down the beach, out into the sea
  for (let z = 14; z < 150; z += 6) {
    for (const dx of [-3, 3]) {
      const g = new THREE.CylinderGeometry(0.4, 0.4, 6, 8);
      g.translate(-170 + dx, sandY(-170, z) - 1 + 3, z);
      b.add("#8b7a66", g);
    }
  }
  b.box("#b49a7c", 8, 0.6, 140, -170, 2.4, 82);
  // the town climbing the hill inland: streets of houses along the slope,
  // all turned to the sea, each on a pale terrace with a garden hedge
  for (const [z, gap] of [[-34, 0], [-52, 4], [-74, 2], [-100, 6], [-132, 3], [-170, 5]] as const) {
    let x = -250 + r() * 10;
    while (x < 250) {
      const w = 7 + Math.round(r() * 4);
      const cx = x + w / 2;
      x += w + gap + 1 + r() * 4;
      // keep the view over the plot clear, and leave the odd empty lot
      if ((Math.abs(cx - 8) < 24 && z > -60) || r() < 0.12) continue;
      const y = landY(cx, z);
      const [wall, trim] = SHORE_COLOURS[Math.floor(r() * SHORE_COLOURS.length)];
      b.box("#efe2c4", w + 3, 2.4, 10, cx, y - 2.2, z + 4);
      b.box("#6f9a52", w + 3, 0.9, 0.6, cx, y - 0.2, z + 9);
      // half have a coral tiled roof, the rest a flat roof behind a parapet
      const tiled = r() > 0.5;
      const h = r() > 0.6 ? 6.8 : 3.4;
      const m = new THREE.Matrix4().makeTranslation(cx, y, z);
      boxes.push(simpleHouse(b, m, w, h, wall, tiled ? "#ff7a5c" : trim, !tiled, 2));
    }
  }
  for (let i = 0; i < 60; i++) {
    const x = -280 + r() * 560;
    const z = -24 - r() * 170;
    if (Math.abs(x - 8) < 22 && z > -40) continue;
    palm(b, x, z, landY(x, z), 8 + r() * 6, (r() - 0.5) * 1.4, i);
  }
  return b;
}

function Sky() {
  const material = useMemo(skyMaterial, []);
  return (
    <mesh material={material} raycast={() => null} renderOrder={-2} frustumCulled={false}>
      <sphereGeometry args={[800, 48, 24]} />
    </mesh>
  );
}

function Sea() {
  const material = useMemo(seaMaterial, []);
  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, SEA_LEVEL, 0]} material={material} raycast={() => null} receiveShadow={false}>
      <circleGeometry args={[760, 64]} />
    </mesh>
  );
}

const ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

function Ground() {
  const beach = useMemo(beachGeometry, []);
  const land = useMemo(landGeometry, []);
  return (
    <>
      <mesh geometry={beach} material={ground} receiveShadow raycast={() => null} />
      <mesh geometry={land} material={ground} receiveShadow raycast={() => null} />
    </>
  );
}

function Backdrop() {
  const texture = useMemo(backdropTexture, []);
  return (
    <mesh position={[8, -20, 4]} raycast={() => null} renderOrder={-1}>
      <cylinderGeometry args={[560, 560, 140, 64, 1, true]} />
      <meshBasicMaterial map={texture} transparent side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

/** The sun, from the same direction the sky shows it; its shadows cover the plot and the near houses. */
function Sun() {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(8, 0, 4);
    return o;
  }, []);
  const position = useMemo(() => SUN_DIR.clone().multiplyScalar(90).add(target.position), [target]);
  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={position}
        target={target}
        intensity={3.4}
        color={SUN_COLOUR}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
        shadow-radius={3}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={10}
        shadow-camera-far={190}
      />
    </>
  );
}

export function BeachEnvironment() {
  const skyForLight = useMemo(skyMaterial, []);
  // the scenery is built once; its houses' boxes keep the camera out of them
  const scenery = useMemo(() => {
    const boxes: THREE.Box3[] = [];
    const near = nearBatch(boxes);
    const shore = shoreBatch(boxes);
    return { near: () => near, shore: () => shore, boxes };
  }, []);
  useEffect(() => setObstacles(scenery.boxes), [scenery]);
  return (
    <group>
      <color attach="background" args={[HAZE]} />
      <fog attach="fog" args={[HAZE, 140, 620]} />
      {/* fill and reflections come from the same sky the player sees */}
      <EnvMap frames={1} resolution={128} environmentIntensity={0.35}>
        <mesh material={skyForLight} scale={100}>
          <sphereGeometry args={[1, 32, 16]} />
        </mesh>
      </EnvMap>
      <hemisphereLight args={["#e3e8f4", "#f1dcbc", 0.75]} />
      <Sun />
      <Sky />
      <Backdrop />
      <Sea />
      <Ground />
      <Batched batch={scenery.near} />
      <Batched batch={scenery.shore} shadows={false} />
    </group>
  );
}
