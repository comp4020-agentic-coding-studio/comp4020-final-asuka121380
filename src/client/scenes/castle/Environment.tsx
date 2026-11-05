import { Environment as EnvMap } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Batched } from "../../scene/Batched.tsx";
import { setObstacles } from "../../scene/obstacles.ts";
import { Batch } from "../../scene/scenery.ts";
import { HORIZON, skyMaterial, SUN_COLOUR, SUN_DIR } from "./sky.ts";
import { APRON, backdropTexture, CENTRE, FRONT, groundGeometry, groundY, mountainGeometry, outerGroundGeometry, PLOT, RIM, rng, ROAD_HALF, roadX } from "./terrain.ts";

// The castle scene's surroundings (ADR 0015): a bright medieval valley.
// Art direction, not a map. Nothing here is in the build, the kit or the
// rules, and none of it is pickable.
//
// Along z, from far behind to the viewer:
//   z < −250    mountains, peaks to the sides, a low saddle behind the plot
//   z −120..−8  low hills with sparse woodland and rocks
//   z −3..29    the paved courtyard (the plot, x 0–32, z 0–26) and its apron,
//               held by a low retaining wall behind and beside it
//   z > 29      open grass and the stone road out towards the viewer
// The default view looks from the road, so nothing tall stands in front:
// every tree, rock and ruin is beside or behind the courtyard (FRONT).

const WALL = "#a5a196";
const WALL_DARK = "#8f8b80";
const CAP = "#c4c0b4";
const TRUNK = "#6a4a33";
const LEAF = ["#3f7a3f", "#4f8f45", "#5f9e4c"];
const PINE = ["#2f5f3c", "#3a6d45"];
const STONE = ["#9a9890", "#8a8880", "#aaa79e"];

/** Is (x, z) in the open corridor between the default view and the courtyard? */
const inFront = (x: number, z: number, margin = 0): boolean => z > FRONT.z0 - margin && Math.abs(x - CENTRE.x) < FRONT.halfWidth + margin;

/** The low retaining wall round the back and sides of the apron, coursed like bricks, with a capping. */
function retainingWall(b: Batch): void {
  const x0 = -APRON;
  const x1 = PLOT.w + APRON;
  const z0 = -APRON;
  const z1 = FRONT.z0;
  const courses = 2;
  const ch = (RIM + 0.15) / courses;
  const run = (along: "x" | "z", from: number, to: number, at: number) => {
    for (let k = 0; k < courses; k++) {
      const off = k % 2 ? 1 : 0;
      for (let s = from - off; s < to; s += 2) {
        const a = Math.max(from, s);
        const e = Math.min(to, s + 2);
        if (e <= a) continue;
        const colour = (Math.floor(s) + k) % 3 === 0 ? WALL_DARK : WALL;
        if (along === "x") b.box(colour, e - a - 0.04, ch - 0.03, 0.9, (a + e) / 2, -0.05 + k * ch, at);
        else b.box(colour, 0.9, ch - 0.03, e - a - 0.04, at, -0.05 + k * ch, (a + e) / 2);
      }
    }
    if (along === "x") b.box(CAP, to - from + 0.2, 0.16, 1.1, (from + to) / 2, RIM + 0.1, at);
    else b.box(CAP, 1.1, 0.16, to - from + 0.2, at, RIM + 0.1, (from + to) / 2);
  };
  run("x", x0, x1, z0 - 0.45);
  // the side walls end in a step down before the front, where the grass meets the road level
  run("z", z0, z1 - 4, x0 - 0.45);
  run("z", z0, z1 - 4, x1 + 0.45);
  for (const x of [x0 - 0.45, x1 + 0.45]) b.box(WALL, 0.9, RIM * 0.45, 3.6, x, -0.05, z1 - 2.2);
}

/** A kerb of edging stones along the apron's front, and the start of the road. */
function roadAndKerb(b: Batch): void {
  for (let x = -APRON; x < PLOT.w + APRON; x += 1.5) {
    if (Math.abs(x + 0.75 - roadX(FRONT.z0)) < ROAD_HALF) continue;
    b.box(STONE[Math.floor(Math.abs(x) * 7) % 3], 1.42, 0.18, 0.5, x + 0.75, groundY(x, FRONT.z0) - 0.06, FRONT.z0 + 0.2);
  }
  // edging stones either side of the road, flush with the grass, all the way out
  for (let z = FRONT.z0 + 1; z < 230; z += 1.4) {
    const cx = roadX(z);
    for (const side of [-1, 1]) {
      const x = cx + side * (ROAD_HALF + 0.25);
      b.box(STONE[Math.floor(z) % 3], 0.5, 0.14, 1.3, x, groundY(x, z) - 0.06, z);
    }
  }
}

/** A broad, round-topped tree in the brick idiom: a trunk and three stepped canopy tiers. */
function broadTree(b: Batch, x: number, z: number, s: number, seed: number): THREE.Box3 {
  const one = new Batch();
  const y = groundY(x, z);
  const t = new THREE.CylinderGeometry(0.35 * s, 0.45 * s, 2.4 * s, 10);
  t.translate(x, y + 1.2 * s, z);
  one.add(TRUNK, t);
  const tiers = [3.6, 3.0, 1.8];
  tiers.forEach((w, i) => {
    const c = new THREE.CylinderGeometry((w / 2) * s, (w / 2 + 0.2) * s, 1.25 * s, 12);
    c.translate(x, y + (2.4 + i * 1.2 + 0.62) * s, z);
    one.add(LEAF[(i + seed) % LEAF.length], c);
  });
  b.merge(one);
  return one.bounds();
}

/** A conifer: a trunk and a stack of narrowing square tiers. */
function pine(b: Batch, x: number, z: number, s: number, seed: number): THREE.Box3 {
  const one = new Batch();
  const y = groundY(x, z);
  one.box(TRUNK, 0.5 * s, 1.4 * s, 0.5 * s, x, y, z);
  for (let i = 0; i < 4; i++) {
    const w = (3 - i * 0.65) * s;
    one.box(PINE[(i + seed) % 2], w, 1.1 * s, w, x, y + (1.2 + i * 1.0) * s, z);
  }
  b.merge(one);
  return one.bounds();
}

/** A low cluster of grey boulders. */
function rocks(b: Batch, x: number, z: number, s: number, r: () => number): void {
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const dx = (r() - 0.5) * 3 * s;
    const dz = (r() - 0.5) * 3 * s;
    const g = new THREE.DodecahedronGeometry((0.6 + r() * 0.8) * s, 0);
    g.scale(1, 0.6 + r() * 0.3, 1);
    g.rotateY(r() * 3);
    g.translate(x + dx, groundY(x + dx, z + dz) + 0.2 * s, z + dz);
    b.add(STONE[i % 3], g);
  }
}

/**
 * A low ruin: the stump of an old wall in coursed blocks, broken off at
 * uneven heights, with a fallen block beside it. Never taller than ~2.4.
 */
function ruin(b: Batch, x: number, z: number, len: number, rotY: number, r: () => number): THREE.Box3 {
  const one = new Batch();
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, groundY(x, z) - 0.1, z);
  for (let i = 0; i < len; i += 2) {
    const courses = 1 + Math.floor(r() * 4) - (i === 0 || i >= len - 2 ? 0 : 1);
    for (let k = 0; k < Math.max(1, courses); k++) {
      const off = k % 2 ? 1 : 0;
      one.box(STONE[(i + k) % 3], 1.94, 0.58, 1, i + off - len / 2, k * 0.6, 0, m);
    }
  }
  one.box(STONE[1], 1.9, 0.56, 1, len / 2 - 1, 0, 1.8, new THREE.Matrix4().makeRotationY(0.5).premultiply(m));
  b.merge(one);
  return one.bounds();
}

function nearBatch(boxes: THREE.Box3[]): Batch {
  const b = new Batch();
  retainingWall(b);
  roadAndKerb(b);
  const r = rng(1120);
  // low ruins beside and behind the courtyard, outside the plot, never in front
  boxes.push(ruin(b, -13, 4, 8, 0.3, r));
  boxes.push(ruin(b, 47, 12, 6, -1.2, r));
  boxes.push(ruin(b, 22, -16, 10, 0.08, r));
  rocks(b, -10, 16, 1, r);
  rocks(b, 43, 2, 1.2, r);
  rocks(b, 6, -12, 0.9, r);
  return b;
}

function farBatch(boxes: THREE.Box3[]): Batch {
  const b = new Batch();
  const r = rng(6372694);
  // sparse woodland on the hills behind and to the sides, thinning near the
  // plot, and none in the open corridor in front
  for (let i = 0; i < 120; i++) {
    const x = CENTRE.x + (r() - 0.5) * 420;
    const z = -8 - r() * 170 + (r() < 0.3 ? 120 : 0);
    if (inFront(x, z, 8)) continue;
    // keep a clear margin round the courtyard and its wall
    if (x > -APRON - 10 && x < PLOT.w + APRON + 10 && z > -APRON - 10 && z < FRONT.z0 + 6) continue;
    // fewer trees straight behind the courtyard, so the skyline there stays quiet
    if (Math.abs(x - CENTRE.x) < 40 && z > -80 && r() < 0.85) continue;
    // and a thinner scatter on the near slopes, so the woodland reads as sparse
    if (z > -50 && r() < 0.5) continue;
    const near = z > -40 && Math.abs(x - CENTRE.x) < 70;
    const s = 0.8 + r() * 0.6;
    const box = r() < 0.55 ? broadTree(b, x, z, s, i) : pine(b, x, z, s, i);
    if (near) boxes.push(box);
  }
  for (let i = 0; i < 18; i++) {
    const x = CENTRE.x + (r() - 0.5) * 360;
    const z = -10 - r() * 140;
    if (inFront(x, z, 4)) continue;
    rocks(b, x, z, 1 + r() * 1.5, r);
  }
  // a small hamlet far down the valley, off to one side, quiet at that distance
  for (let i = 0; i < 6; i++) {
    const x = -120 - i * 9 - r() * 4;
    const z = -40 - (i % 3) * 8;
    const y = groundY(x, z);
    b.box("#e8e0cf", 5, 3, 4, x, y - 0.5, z);
    const roof = new THREE.ConeGeometry(4, 2.4, 4);
    roof.rotateY(Math.PI / 4);
    roof.scale(1, 1, 0.8);
    roof.translate(x, y + 2.5 + 1.2, z);
    b.add(i % 2 ? "#a2482f" : "#7a5236", roof);
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

const ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

function Ground() {
  const valley = useMemo(groundGeometry, []);
  const outer = useMemo(outerGroundGeometry, []);
  const mountains = useMemo(mountainGeometry, []);
  return (
    <>
      <mesh geometry={outer} material={ground} raycast={() => null} />
      <mesh geometry={valley} material={ground} receiveShadow raycast={() => null} />
      <mesh geometry={mountains} material={ground} raycast={() => null} />
    </>
  );
}

function Backdrop() {
  const texture = useMemo(backdropTexture, []);
  return (
    <mesh position={[CENTRE.x, -10, CENTRE.z]} raycast={() => null} renderOrder={-1}>
      <cylinderGeometry args={[600, 600, 150, 64, 1, true]} />
      <meshBasicMaterial map={texture} transparent side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

function Sun() {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(CENTRE.x, 0, CENTRE.z);
    return o;
  }, []);
  const position = useMemo(() => SUN_DIR.clone().multiplyScalar(90).add(target.position), [target]);
  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={position}
        target={target}
        intensity={3.0}
        color={SUN_COLOUR}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
        shadow-radius={3}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={10}
        shadow-camera-far={200}
      />
    </>
  );
}

export function CastleEnvironment() {
  const skyForLight = useMemo(skyMaterial, []);
  const scenery = useMemo(() => {
    const boxes: THREE.Box3[] = [];
    const near = nearBatch(boxes);
    const far = farBatch(boxes);
    return { near: () => near, far: () => far, boxes };
  }, []);
  useEffect(() => setObstacles(scenery.boxes), [scenery]);
  return (
    <group>
      <color attach="background" args={[HORIZON]} />
      <EnvMap frames={1} resolution={128} environmentIntensity={0.4}>
        <mesh material={skyForLight} scale={100}>
          <sphereGeometry args={[1, 32, 16]} />
        </mesh>
      </EnvMap>
      {/* a generous sky fill, so the faces turned from the sun stay readable */}
      <hemisphereLight args={["#e6f0fb", "#c9d6a8", 0.95]} />
      <Sun />
      <Sky />
      <Backdrop />
      <Ground />
      <Batched batch={scenery.near} />
      <Batched batch={scenery.far} shadows={false} />
    </group>
  );
}
