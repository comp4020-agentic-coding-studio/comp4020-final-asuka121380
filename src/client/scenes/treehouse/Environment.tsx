import { Environment as EnvMap } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TREEHOUSE_SCENE } from "../../../domain/treehouse.ts";
import type { FixedPiece } from "../../../domain/scene.ts";
import { Batched } from "../../scene/Batched.tsx";
import { PLATE } from "../../scene/geometry.ts";
import { plastic } from "../../scene/PartMesh.tsx";
import { setObstacles } from "../../scene/obstacles.ts";
import { Batch } from "../../scene/scenery.ts";
import { useLeavesHidden } from "../../state/leaves.ts";
import { HORIZON, skyMaterial, SUN_COLOUR, SUN_DIR } from "./sky.ts";
import { backdropTexture, CENTRE, groundGeometry, groundY, onPath, outerGroundGeometry, outside, PLOT, rng } from "./terrain.ts";

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

const BARK = "#5b3a26";
const BARK_DARK = "#48301f";
const BARK_LIGHT = "#6d4630";
const DECK = "#9a6a42";
const DECK_EDGE = "#7a5032";
const LEAVES = ["#4f8f3f", "#5d9c45", "#3f7a39", "#6aa64c"];
const AUTUMN = ["#d9a23a", "#e0832f", "#c9692a", "#e6b84a"];
const TRUNK = "#6a4a33";
const PINE = ["#2f5f3c", "#3a6d45"];
const STONE = ["#9a9890", "#8a8880", "#aaa79e"];
const FLOWERS = ["#f2c94c", "#e3a3b6", "#ffffff"];

/** World box of a fixed piece. */
function worldBox(f: FixedPiece): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  return { x0: f.x, x1: f.x + f.w, y0: f.y * PLATE, y1: (f.y + f.h) * PLATE, z0: f.z, z1: f.z + f.d };
}

/**
 * The trunk, roots and branches: each box filled solid, with bark ridges as
 * shallow vertical strips inside its faces, so the silhouette is exactly
 * the box. Platforms are timber decks with studs on top: the support
 * surface, drawn where it is.
 */
function treeBatch(): Batch {
  const b = new Batch();
  const r = rng(318);
  for (const f of TREEHOUSE_SCENE.fixed!.pieces) {
    const w = worldBox(f);
    const cx = (w.x0 + w.x1) / 2;
    const cz = (w.z0 + w.z1) / 2;
    const sx = w.x1 - w.x0;
    const sz = w.z1 - w.z0;
    const h = w.y1 - w.y0;
    if (f.kind === "deck") {
      // planks running across, with a darker rim, and studs on top
      b.box(DECK_EDGE, sx, h * 0.5, sz, cx, w.y0, cz);
      for (let i = 0; i < sx; i++) b.box(i % 2 ? DECK : "#a87850", 0.96, h * 0.5 - 0.01, sz - 0.04, w.x0 + i + 0.5, w.y0 + h * 0.5, cz);
      b.studs(DECK, w.x0, w.x1, w.z0, w.z1, w.y1);
      continue;
    }
    const colour = f.kind === "root" ? BARK_DARK : BARK;
    // the solid core, a hair inside the box
    b.box(colour, sx - 0.06, h, sz - 0.06, cx, w.y0, cz);
    // bark ridges on the four faces, inside the box's outline
    const ridges = (along: "x" | "z", at: number, from: number, to: number, out: number) => {
      for (let t = from + 0.5; t < to; t += 1) {
        if (r() < 0.35) continue;
        const shade = r() < 0.5 ? BARK_LIGHT : BARK_DARK;
        const y0 = w.y0 + r() * Math.min(1.5, h * 0.2);
        const hh = Math.max(0.4, h - (y0 - w.y0) - r() * Math.min(2, h * 0.3));
        if (along === "x") b.box(shade, 0.42, hh, 0.04, t, y0, at + out * 0.01);
        else b.box(shade, 0.04, hh, 0.42, at + out * 0.01, y0, t);
      }
    };
    ridges("x", w.z1 - 0.03, w.x0, w.x1, -1);
    ridges("x", w.z0 + 0.03, w.x0, w.x1, 1);
    ridges("z", w.x0 + 0.03, w.z0, w.z1, 1);
    ridges("z", w.x1 - 0.03, w.z0, w.z1, -1);
  }
  return b;
}

/**
 * Above the plot's ceiling the trunk carries on and divides into the limbs
 * that hold the canopy. They are part of the crown, so "Hide leaves" hides
 * them with it: all that stays is the trunk and the platforms the rules use.
 */
function crownLimbs(b: Batch): void {
  const stem = TREEHOUSE_SCENE.fixed!.pieces.find((f) => f.id === "trunk-stem")!;
  const top = (stem.y + stem.h) * PLATE;
  const sx = (stem.x + stem.x + stem.w) / 2;
  const sz = (stem.z + stem.z + stem.d) / 2;
  b.box(BARK, stem.w - 0.06, 3, stem.d - 0.06, sx, top, sz);
  const limb = (dx: number, dz: number, len: number, rise: number, thick: number) => {
    const g = new THREE.BoxGeometry(thick, len, thick);
    g.translate(0, len / 2, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(dz * rise, 0, -dx * rise)).setPosition(sx, top + 2, sz);
    b.add(BARK, g, m);
  };
  limb(-1, 0, 12, 0.75, 2.2);
  limb(1, 0, 12, 0.7, 2.2);
  limb(0, -1, 11, 0.6, 2);
  limb(-0.6, -0.8, 10, 0.9, 1.6);
  limb(0.7, -0.7, 10, 0.95, 1.6);
  limb(0, 0, 9, 0, 2.4);
}

/** A rounded clump of leaves: a few overlapping low-poly blobs. */
function clump(b: Batch, x: number, y: number, z: number, s: number, r: () => number, autumn: number): void {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry((1.6 + r() * 1.4) * s, 0);
    g.scale(1, 0.7 + r() * 0.2, 1);
    g.translate(x + (r() - 0.5) * 3.2 * s, y + (r() - 0.5) * 1.4 * s, z + (r() - 0.5) * 3.2 * s);
    const gold = r() < autumn;
    b.add(gold ? AUTUMN[Math.floor(r() * AUTUMN.length)] : LEAVES[Math.floor(r() * LEAVES.length)], g);
  }
}

/**
 * The great tree's canopy: clumps in a broad dome over the crown, high above
 * the plot's ceiling, and a sparse fringe that hangs behind and to the
 * sides. Nothing hangs in front of the working area, and nothing reaches
 * down into the plot, at any height.
 */
function canopyBatch(): Batch {
  const b = new Batch();
  const r = rng(21318);
  crownLimbs(b);
  const stem = TREEHOUSE_SCENE.fixed!.pieces.find((f) => f.id === "trunk-stem")!;
  const top = (stem.y + stem.h) * PLATE + 2;
  const cx = stem.x + stem.w / 2;
  const cz = stem.z + stem.d / 2;
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 17;
    const x = cx + Math.cos(a) * d * 1.15;
    let z = cz + Math.sin(a) * d * 0.8 - 2;
    // pull anything in front of the trunk back behind its front face
    if (z > cz + 4) z = cz + 4 - r() * 3;
    const y = top + 6 + (1 - d / 17) * 6 + r() * 2;
    clump(b, x, y, z, 1.25, r, 0.22);
  }
  // the dome's skirt, hanging a little lower behind and to the sides of
  // the crown, joined to it; never in front of the trunk
  for (let i = 0; i < 18; i++) {
    const a = Math.PI + (i / 17) * Math.PI; // from the left, round the back, to the right
    const x = cx + Math.cos(a) * (15 + r() * 4);
    const z = cz + Math.sin(a) * (9 + r() * 3) - 1;
    clump(b, x, top + 1 + r() * 3, z, 1.1, r, 0.3);
  }
  return b;
}

/** A broad deciduous tree at the forest edge, in the brick idiom: a trunk and stepped, slightly irregular canopy tiers. */
function broadTree(b: Batch, x: number, z: number, s: number, r: () => number): THREE.Box3 {
  const one = new Batch();
  const y = groundY(x, z);
  const t = new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 3.2 * s, 8);
  t.translate(x, y + 1.6 * s, z);
  one.add(TRUNK, t);
  // early autumn: most trees green, some turning gold or orange all over
  const palette = r() < 0.28 ? AUTUMN : LEAVES;
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

function nearBatch(boxes: THREE.Box3[]): Batch {
  const b = new Batch();
  const r = rng(6294836);
  details(b, r);
  // the forest edge: a ring of trees round the clearing, close behind and
  // beside it, far back in front; denser the farther out
  for (let i = 0; i < 200; i++) {
    const x = CENTRE.x + (r() - 0.5) * 260;
    const z = -150 + r() * 260;
    const o = outside(x, z);
    if (o < 1.1) continue;
    // a loose edge: sparse near the clearing, closer together farther in
    if (r() < 0.6 - Math.min(0.4, (o - 1.1) * 0.2)) continue;
    // keep the front corridor open: only far off to the sides in front
    if (z > PLOT.d + 2 && Math.abs(x - CENTRE.x) < 34 + (z - PLOT.d) * 0.6) continue;
    const s = 1.1 + r() * 0.9;
    const box = r() < 0.6 ? broadTree(b, x, z, s, r) : pine(b, x, z, s, i);
    if (o < 1.8) boxes.push(box);
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
      <Batched batch={batch} />
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
      <Batched batch={scenery.tree} />
      <Canopy />
      <Batched batch={scenery.near} shadows={false} />
    </group>
  );
}
