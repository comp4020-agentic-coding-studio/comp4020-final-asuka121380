import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Placement } from "../../domain/rules.ts";
import { scene } from "../state/store.ts";
import { PLATE } from "./geometry.ts";
import { PartMesh, plastic } from "./PartMesh.tsx";

// Fixed scenery: the long base, the path and kerb in front, a low hedge
// behind and a neighbour either side. Built in the same brick language as the
// player's parts but never part of the build, the kit or the rules, and never
// pickable. Layout along z (towards the viewer):
//
//   z −3..−1  hedge strip        z 0..8  buildings (plot x 0..16)
//   z  8..11  pedestrian path    z 11..12 kerb, then the base's edge

const BASE = { x0: -24, x1: 42, z0: -3, z1: 12, thickness: 1.6 };
const GROUND = "#cbbf9f";
const PLOT = "#b3b6b5";
const PATH = "#efebe3";
const KERB = "#8d9093";
const BASE_EDGE = "#8a8174";
const GLASS = "#cfe6f2";
const TRIM = "#f2f1ec";

/** Running-bond courses of 2×4 bricks, ends filled with 2×2s. */
function walls(x0: number, z0: number, w: number, d: number, courses: number, colour: (c: number) => string): Placement[] {
  const out: Placement[] = [];
  for (let c = 0; c < courses; c++) {
    for (let z = z0; z < z0 + d; z += 2) {
      let x = x0;
      if ((c + (z - z0) / 2) % 2 === 1) {
        out.push({ partId: "brick-2x2", x, y: c * 3, z, rot: 0, colour: colour(c) });
        x += 2;
      }
      while (x + 4 <= x0 + w) {
        out.push({ partId: "brick-2x4", x, y: c * 3, z, rot: 0, colour: colour(c) });
        x += 4;
      }
      if (x + 2 <= x0 + w) out.push({ partId: "brick-2x2", x, y: c * 3, z, rot: 0, colour: colour(c) });
    }
  }
  return out;
}

// Left: a two-storey flat-fronted house with a white parapet.
const left: Placement[] = [
  ...walls(-11, 1, 10, 4, 9, (c) => (c === 0 ? "stone" : "sand")),
  ...[1, 3].flatMap((z): Placement[] => [
    { partId: "plate-2x8", x: -11, y: 27, z, rot: 0, colour: "white" },
    { partId: "plate-2x2", x: -3, y: 27, z, rot: 0, colour: "white" },
  ]),
  { partId: "door-1x4x6", x: -9, y: 0, z: 5, rot: 0, colour: "forest" },
];

// Right: a single storey with a roof falling to the street.
const right: Placement[] = [
  ...walls(18, 1, 8, 4, 7, (c) => (c === 0 ? "stone" : "rose")),
  ...[0, 2, 4, 6].flatMap((dx): Placement[] => [
    { partId: "slope-2x2", x: 18 + dx, y: 21, z: 3, rot: 0, colour: "charcoal" },
    { partId: "slope-2x2", x: 18 + dx, y: 21, z: 1, rot: 2, colour: "charcoal" },
  ]),
  { partId: "door-1x4x6", x: 18, y: 0, z: 5, rot: 0, colour: "white" },
];

// Windows are scenery-only trim on the street face: a glass pane in a frame.
const COURSE = 3 * PLATE;
const windows: { x: number; y: number; z: number; w: number; h: number }[] = [
  { x: -3, y: 2 * COURSE, z: 5, w: 2.4, h: 2.6 },
  { x: -8, y: 6 * COURSE, z: 5, w: 2.4, h: 2.4 },
  { x: -3.5, y: 6 * COURSE, z: 5, w: 2.4, h: 2.4 },
  { x: 24, y: 2 * COURSE, z: 5, w: 2.2, h: 2.6 },
];

function Window({ x, y, z, w, h }: (typeof windows)[number]) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, h / 2, 0.04]} material={plastic(TRIM)} castShadow>
        <boxGeometry args={[w + 0.3, h + 0.3, 0.08]} />
      </mesh>
      <mesh position={[0, h / 2, 0.09]}>
        <boxGeometry args={[w, h, 0.04]} />
        <meshStandardMaterial color={GLASS} roughness={0.08} />
      </mesh>
      <mesh position={[0, h / 2, 0.12]} material={plastic(TRIM)}>
        <boxGeometry args={[0.14, h, 0.04]} />
      </mesh>
    </group>
  );
}

/** Studs across a rectangle of the ground, instanced: one draw call per colour. */
function Studs({ x0, x1, z0, z1, colour, skip }: { x0: number; x1: number; z0: number; z1: number; colour: string; skip?: (x: number, z: number) => boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) if (!skip?.(x, z)) out.push([x, z]);
    return out;
  }, [x0, x1, z0, z1, skip]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    cells.forEach(([x, z], i) => ref.current!.setMatrixAt(i, m.makeTranslation(x + 0.5, 0.09, z + 0.5)));
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [cells]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} material={plastic(colour)} receiveShadow raycast={() => null}>
      <cylinderGeometry args={[0.3, 0.3, 0.18, 14]} />
    </instancedMesh>
  );
}

const occupiedByNeighbours = (x: number, z: number): boolean =>
  (x >= -11 && x < -1 && z >= 1 && z < 5) || (x >= 18 && x < 26 && z >= 1 && z < 5);

function Slab({ x0, x1, z0, z1, y0, y1, colour, raycast = false, userData }: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; colour: string; raycast?: boolean; userData?: Record<string, unknown> }) {
  return (
    <mesh
      position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}
      material={plastic(colour)}
      receiveShadow
      userData={userData}
      raycast={raycast ? undefined : () => null}
    >
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
    </mesh>
  );
}

export function Street() {
  const { w, d } = scene.bounds;
  return (
    <group>
      {/* the base: visibly finite, with a thick edge */}
      <Slab x0={BASE.x0} x1={BASE.x1} z0={BASE.z0} z1={BASE.z1} y0={-BASE.thickness} y1={-0.001} colour={BASE_EDGE} />
      <Slab x0={BASE.x0} x1={BASE.x1} z0={BASE.z0} z1={8} y0={-0.2} y1={0} colour={GROUND} />
      <Studs x0={BASE.x0} x1={0} z0={BASE.z0} z1={8} colour={GROUND} skip={occupiedByNeighbours} />
      <Studs x0={w} x1={BASE.x1} z0={BASE.z0} z1={8} colour={GROUND} skip={occupiedByNeighbours} />
      <Studs x0={0} x1={w} z0={BASE.z0} z1={0} colour={GROUND} />

      {/* the plot: the only surface that takes the player's parts */}
      <Slab x0={0} x1={w} z0={0} z1={d} y0={-0.2} y1={0.002} colour={PLOT} raycast userData={{ plot: true }} />
      <Studs x0={0} x1={w} z0={0} z1={d} colour={PLOT} />

      {/* path and kerb, smooth tiles */}
      <Slab x0={BASE.x0} x1={BASE.x1} z0={8} z1={11} y0={-0.2} y1={0.06} colour={PATH} />
      <Slab x0={BASE.x0} x1={BASE.x1} z0={11} z1={BASE.z1} y0={-0.2} y1={0.4} colour={KERB} />

      {/* low hedge behind, no second row of buildings */}
      {Array.from({ length: (BASE.x1 - BASE.x0) / 4 }, (_, i) => (
        <PartMesh key={i} placement={{ partId: "brick-2x4", x: BASE.x0 + i * 4, y: 0, z: -3, rot: 0, colour: "forest" }} inert />
      ))}

      {[...left, ...right].map((p, i) => (
        <PartMesh key={`n${i}`} placement={p} inert />
      ))}
      {windows.map((win, i) => (
        <Window key={i} {...win} />
      ))}
    </group>
  );
}
