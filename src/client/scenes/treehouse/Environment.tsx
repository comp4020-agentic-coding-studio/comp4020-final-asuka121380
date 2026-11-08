import { Environment as EnvMap } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TREEHOUSE_SCENE } from "../../../domain/treehouse.ts";
import { BatchedColoured } from "../../scene/Batched.tsx";
import { plastic } from "../../scene/PartMesh.tsx";
import { setObstacles } from "../../scene/obstacles.ts";
import { Batch } from "../../scene/scenery.ts";
import { useLeavesHidden } from "../../state/leaves.ts";
import { HORIZON, skyMaterial, SUN_COLOUR, SUN_DIR } from "./sky.ts";
import { backdropTexture, CENTRE, groundGeometry, groundY, onPath, outerGroundGeometry, outside, PLOT, rng } from "./terrain.ts";
import { AUTUMN, canopyBatch, LEAVES, treeBatch, worldBox } from "./tree.ts";

// Woodland Commons' surroundings (ADR 0016): one great tree in a forest
// clearing on a bright early-autumn afternoon.
//
// The tree is drawn from the scene's fixed structure, the same boxes the
// rules use (src/domain/treehouse.ts). Inside the plot every bark or
// platform surface is exactly one of those boxes, so what looks solid is
// solid and what looks like a platform carries parts, with nothing
// invisible. Bark texture is shallow relief inside each box. Above the
// plot's ceiling, the tree carries on into its crown, and its canopy hangs
// above, behind and beside the working area, never in front. The canopy is
// drawn on its own, so "Hide leaves" can hide exactly that.
//
// Nothing here is in the build or the kit, and none of it is pickable.

const TRUNK = "#6a4a33";
const PINE = ["#2f5f3c", "#3a6d45"];
const STONE = ["#9a9890", "#8a8880", "#aaa79e"];
const FLOWERS = ["#f2c94c", "#e3a3b6", "#ffffff"];

/** A broad deciduous tree at the forest edge, in the brick idiom: a trunk and stepped, slightly irregular canopy tiers. */
function broadTree(b: Batch, x: number, z: number, s: number, r: () => number, autumn = 0.28): THREE.Box3 {
  const one = new Batch();
  const y = groundY(x, z);
  const t = new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 3.2 * s, 8);
  t.translate(x, y + 1.6 * s, z);
  one.add(TRUNK, t);
  // early autumn: most trees green, some turning gold or orange all over
  const palette = r() < autumn ? AUTUMN : LEAVES;
  const tint = Math.floor(r() * palette.length);
  [3.8, 3.2, 2.0].forEach((w, i) => {
    const c = new THREE.CylinderGeometry((w / 2) * s, (w / 2 + 0.25) * s, 1.3 * s, 9);
    c.translate(x + (r() - 0.5) * 0.4 * s, y + (3.1 + i * 1.2 + 0.65) * s, z + (r() - 0.5) * 0.4 * s);
    one.add(palette[(tint + (i === 2 ? 1 : 0)) % palette.length], c);
  });
  b.merge(one);
  return one.bounds();
}

/** A conifer: a trunk and a stack of narrowing square tiers. */
function pine(b: Batch, x: number, z: number, s: number, seed: number): THREE.Box3 {
  const one = new Batch();
  const y = groundY(x, z);
  one.box(TRUNK, 0.5 * s, 1.6 * s, 0.5 * s, x, y, z);
  for (let i = 0; i < 5; i++) {
    const w = (3.2 - i * 0.6) * s;
    one.box(PINE[(i + seed) % 2], w, 1.1 * s, w, x, y + (1.4 + i * 1.0) * s, z);
  }
  b.merge(one);
  return one.bounds();
}

/** Small things at the clearing's edge: rocks, ferns, a few flowers, a stepping-stone path. */
function details(b: Batch, r: () => number): void {
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const x = CENTRE.x + Math.cos(a) * (PLOT.w / 2 + 4 + r() * 8);
    const z = CENTRE.z + Math.sin(a) * (PLOT.d / 2 + 3 + r() * 6);
    if (z > PLOT.d + 2 && Math.abs(x - CENTRE.x) < 22) continue; // the open front
    if (x > -1 && x < PLOT.w + 1 && z > -1 && z < PLOT.d + 1) continue;
    const y = groundY(x, z);
    if (r() < 0.4) {
      const g = new THREE.DodecahedronGeometry(0.5 + r() * 0.6, 0);
      g.scale(1, 0.6, 1);
      g.translate(x, y + 0.15, z);
      b.add(STONE[i % 3], g);
    } else {
      // a fern: a few flat, tilted leaves
      for (let k = 0; k < 5; k++) {
        const g = new THREE.BoxGeometry(0.25, 0.06, 1.4);
        g.translate(0, 0, 0.7);
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.5, (k / 5) * Math.PI * 2, 0)).setPosition(x, y + 0.1, z);
        b.add(LEAVES[k % 4], g, m);
      }
    }
  }
  // the path up to the tree from the front: low, flat stepping stones along
  // its middle, flush with the grass, so the way in reads at a glance
  for (let z = PLOT.d + 2.2; z < PLOT.d + 60; z += 1.7 + r() * 0.6) {
    const x = CENTRE.x - 2 + Math.sin(z * 0.08) * 3 + (r() - 0.5) * 0.6;
    const g = new THREE.CylinderGeometry(0.55 + r() * 0.2, 0.62 + r() * 0.2, 0.08, 7);
    g.scale(1.15, 1, 0.85);
    g.rotateY(r() * Math.PI);
    g.translate(x, groundY(x, z) + 0.03, z);
    b.add(STONE[Math.floor(r() * 3)], g);
  }
  // wildflowers in the meadow in front, low and sparse
  for (let i = 0; i < 70; i++) {
    const x = CENTRE.x + (r() - 0.5) * 70;
    const z = PLOT.d + 2 + r() * 34;
    if (onPath(x, z)) continue;
    const g = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 6);
    g.translate(x, groundY(x, z) + 0.12, z);
    b.add(FLOWERS[i % 3], g);
  }
}

/**
 * The forest edge, composed rather than scattered: groves of different
 * density and mix close in behind and to the sides, each with its own
 * share of autumn colour, a few large trees anchor the back, and single
 * trees stand out in the meadow at the clearing's edge. The front corridor
 * stays open at every height, out to the horizon.
 */
const GROVES: { x: number; z: number; rx: number; rz: number; n: number; pines: number; autumn: number; scale: number }[] = [
  // behind the tree: a dense, tall, mostly broadleaf wood
  { x: 16, z: -26, rx: 30, rz: 12, n: 34, pines: 0.25, autumn: 0.25, scale: 1.5 },
  { x: -14, z: -14, rx: 14, rz: 10, n: 16, pines: 0.55, autumn: 0.15, scale: 1.25 },
  { x: 46, z: -14, rx: 14, rz: 10, n: 16, pines: 0.4, autumn: 0.45, scale: 1.3 },
  // the sides: looser groves, stepping forward and thinning out
  { x: -26, z: 8, rx: 9, rz: 12, n: 12, pines: 0.7, autumn: 0.1, scale: 1.2 },
  { x: 58, z: 6, rx: 9, rz: 12, n: 12, pines: 0.3, autumn: 0.5, scale: 1.2 },
  { x: -34, z: 32, rx: 8, rz: 9, n: 7, pines: 0.5, autumn: 0.3, scale: 1.05 },
  { x: 66, z: 34, rx: 8, rz: 9, n: 7, pines: 0.6, autumn: 0.2, scale: 1.05 },
  // farther off behind: a quiet mass that leads into the painted tree line
  { x: 16, z: -70, rx: 70, rz: 18, n: 30, pines: 0.5, autumn: 0.2, scale: 1.7 },
];
/** Single trees at the clearing's edge, for a less even outline. */
const SINGLES: [number, number, number, "broad" | "pine"][] = [
  [-6, -4, 1.0, "broad"],
  [38, -5, 1.1, "pine"],
  [-12, 22, 0.95, "broad"],
  [45, 20, 1.0, "broad"],
];

function nearBatch(boxes: THREE.Box3[]): Batch {
  const b = new Batch();
  const r = rng(6294836);
  details(b, r);
  const plant = (x: number, z: number, s: number, kind: "broad" | "pine", autumn: number, seed: number) => {
    const o = outside(x, z);
    if (o < 1.1) return; // the clearing stays open round the tree
    // keep the front corridor open: only far off to the sides in front
    if (z > PLOT.d + 2 && Math.abs(x - CENTRE.x) < 34 + (z - PLOT.d) * 0.6) return;
    const box = kind === "pine" ? pine(b, x, z, s, seed) : broadTree(b, x, z, s, r, autumn);
    if (o < 1.8) boxes.push(box);
  };
  GROVES.forEach((g, gi) => {
    for (let i = 0; i < g.n; i++) {
      // denser towards each grove's middle
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.7);
      const x = g.x + Math.cos(a) * d * g.rx;
      const z = g.z + Math.sin(a) * d * g.rz;
      const s = g.scale * (0.75 + r() * 0.5) * (d < 0.3 && r() < 0.3 ? 1.35 : 1);
      plant(x, z, s, r() < g.pines ? "pine" : "broad", g.autumn, gi + i);
    }
  });
  SINGLES.forEach(([x, z, s, kind], i) => plant(x, z, s, kind, 0.4, i));
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
  const near = useMemo(groundGeometry, []);
  const outer = useMemo(outerGroundGeometry, []);
  return (
    <>
      <mesh geometry={outer} material={ground} raycast={() => null} />
      <mesh geometry={near} material={ground} receiveShadow raycast={() => null} />
    </>
  );
}

function Backdrop() {
  const texture = useMemo(backdropTexture, []);
  return (
    <mesh position={[CENTRE.x, -8, CENTRE.z]} raycast={() => null} renderOrder={-1}>
      <cylinderGeometry args={[520, 520, 140, 64, 1, true]} />
      <meshBasicMaterial map={texture} transparent side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

function Sun() {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(CENTRE.x, 8, CENTRE.z);
    return o;
  }, []);
  const position = useMemo(() => SUN_DIR.clone().multiplyScalar(110).add(target.position), [target]);
  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={position}
        target={target}
        intensity={2.9}
        color={SUN_COLOUR}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
        shadow-radius={3}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={55}
        shadow-camera-bottom={-45}
        shadow-camera-near={10}
        shadow-camera-far={260}
      />
    </>
  );
}

/** The canopy, as one instanced-per-colour batch that "Hide leaves" toggles for this viewer only. */
function Canopy() {
  const hidden = useLeavesHidden();
  const group = useRef<THREE.Group>(null);
  const batch = useMemo(() => {
    const b = canopyBatch();
    return () => b;
  }, []);
  // `?debug` lets the browser tests read whether this viewer's canopy is drawn
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("debug")) return;
    (window as unknown as { __canopyVisible: () => boolean }).__canopyVisible = () => !!group.current?.visible;
  }, []);
  return (
    <group ref={group} visible={!hidden} name="canopy">
      <BatchedColoured batch={batch} />
    </group>
  );
}

// Grass tufts on the plot's edge, instanced: many small blades, one draw call.
function Tufts() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const r = rng(77);
    const out: [number, number][] = [];
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const x = CENTRE.x + Math.cos(a) * (PLOT.w / 2 + 1 + r() * 10);
      const z = CENTRE.z + Math.sin(a) * (PLOT.d / 2 + 1 + r() * 10);
      if (x > -0.5 && x < PLOT.w + 0.5 && z > -0.5 && z < PLOT.d + 0.5) continue;
      if (onPath(x, z)) continue;
      out.push([x, z]);
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z], i) => {
      q.setFromEuler(new THREE.Euler(0, (x * 13 + z * 7) % 6.28, 0));
      m.compose(new THREE.Vector3(x, groundY(x, z), z), q, new THREE.Vector3(1, 0.7 + ((x * z) % 1) * 0.6, 1));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, plastic("#7aa84a"), spots.length]} receiveShadow raycast={() => null}>
      <coneGeometry args={[0.3, 0.7, 4]} />
    </instancedMesh>
  );
}

/** The trunk's two boxes, in world units. */
function trunkBoxes(): THREE.Box3[] {
  return TREEHOUSE_SCENE.fixed!.pieces
    .filter((f) => f.kind === "trunk")
    .map((f) => {
      const w = worldBox(f);
      return new THREE.Box3(new THREE.Vector3(w.x0, w.y0, w.z0), new THREE.Vector3(w.x1, w.y1 + (f.id === "trunk-stem" ? 3 : 0), w.z1));
    });
}

export function WoodlandEnvironment() {
  const skyForLight = useMemo(skyMaterial, []);
  const scenery = useMemo(() => {
    const boxes: THREE.Box3[] = [];
    const tree = treeBatch();
    const near = nearBatch(boxes);
    return { tree: () => tree, near: () => near, boxes };
  }, []);
  // the camera is kept out of the trunk, as out of the forest edge's trees
  useEffect(() => setObstacles([...scenery.boxes, ...trunkBoxes()]), [scenery]);
  return (
    <group>
      <color attach="background" args={[HORIZON]} />
      <EnvMap frames={1} resolution={128} environmentIntensity={0.4}>
        <mesh material={skyForLight} scale={100}>
          <sphereGeometry args={[1, 32, 16]} />
        </mesh>
      </EnvMap>
      {/* a generous sky fill, so the shade under the canopy stays readable */}
      <hemisphereLight args={["#e8f1fb", "#b9c98e", 1.0]} />
      <Sun />
      <Sky />
      <Backdrop />
      <Ground />
      <Tufts />
      <BatchedColoured batch={scenery.tree} />
      <Canopy />
      <BatchedColoured batch={scenery.near} shadows={false} />
    </group>
  );
}
