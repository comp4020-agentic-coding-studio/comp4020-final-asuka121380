import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { scene } from "../state/store.ts";
import { plastic } from "./PartMesh.tsx";
import { Batch, farHouse, fenceRun, hedge, house, lamp, spire, tree, type HouseSpec } from "./scenery.ts";

// The fixed world around the plot (ADR 0003): one residential street seen
// from all sides, under a sky, with ground, street and surroundings running
// well past where the camera can pan. Fog closes the distance. Nothing here
// is in the build, the kit or the rules, and none of it is pickable except
// the plot's surface, which only aims placements.
//
// Along z, towards the viewer at the street:
//   z −35..−24 the next street's backs
//   z −16..0   back gardens        z 0..8     houses and front gardens (plot x 0..16)
//   z 8..11    pavement             z 11..19.5 kerb and road
//   z 19.5..23 far pavement         z 23..     a low park, then distant houses

const SKY_TOP = "#8db5dc";
const HORIZON = "#f3e5cb";
const GRASS = "#9dba7c";
const PLOT = "#b9bcb9";
const PAVEMENT = "#e3ddd2";
const KERB = "#b8b4ad";
const ROAD = "#5d6064";
const GLASS = "#9fb7c6";
const LANTERN = "#ffd9a0";

const NEIGHBOURS: HouseSpec[] = [
  {
    // left: two storeys, ridge along the street
    x: -15, z: 0, w: 12, d: 6, storeys: 2, wall: "#e8d7b0", base: "#a9a49a", trim: "#f4f1ea", roof: "#7a3d33", door: "#3f6b4f",
    openings: [
      { face: "front", at: 2, kind: "door" },
      { face: "front", at: 6, kind: "window", flowers: true },
      { face: "front", at: 9, kind: "window", flowers: true },
      { face: "front", at: 2, kind: "window", storey: 1 },
      { face: "front", at: 6, kind: "window", storey: 1 },
      { face: "front", at: 9, kind: "window", storey: 1 },
      { face: "back", at: 3, kind: "window" },
      { face: "back", at: 7, kind: "door" },
      { face: "back", at: 3, kind: "window", storey: 1 },
      { face: "left", at: 2, kind: "window", storey: 1 },
      { face: "right", at: 2, kind: "window" },
    ],
    chimney: true,
    canopy: true,
  },
  {
    // right: one storey, gable to the street
    x: 21, z: 0, turn: 1, w: 6, d: 8, storeys: 1, wall: "#c9d6dc", base: "#a2a6a8", trim: "#f6f4ef", roof: "#3e4a57", door: "#2d3a46",
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
    x: -31, z: 0, w: 12, d: 6, storeys: 1, wall: "#e9c79f", base: "#a39a8c", trim: "#f4efe6", roof: "#9c5236", door: "#6b3b2c",
    openings: [
      { face: "front", at: 1, kind: "window", flowers: true },
      { face: "front", at: 5, kind: "door" },
      { face: "front", at: 9, kind: "window" },
      { face: "back", at: 5, kind: "window" },
    ],
    chimney: true,
  },
  {
    x: 31, z: 0, w: 12, d: 6, storeys: 2, wall: "#d9dfe4", base: "#9b9fa3", trim: "#ffffff", roof: "#47505c", door: "#24303c",
    openings: [
      { face: "front", at: 1, kind: "window" },
      { face: "front", at: 5, kind: "door" },
      { face: "front", at: 9, kind: "window", flowers: true },
      { face: "front", at: 3, kind: "window", storey: 1 },
      { face: "front", at: 7, kind: "window", storey: 1 },
      { face: "back", at: 5, kind: "window" },
    ],
    canopy: true,
  },
  {
    x: -47, z: 0, w: 12, d: 6, storeys: 2, wall: "#d8c3a5", base: "#9e978b", trim: "#f2ede4", roof: "#5c4636", door: "#4a5d3f",
    openings: [
      { face: "front", at: 5, kind: "door" },
      { face: "front", at: 1, kind: "window" },
      { face: "front", at: 9, kind: "window" },
      { face: "front", at: 5, kind: "window", storey: 1 },
    ],
  },
  {
    x: 47, z: 0, w: 12, d: 6, storeys: 1, wall: "#ecd9b8", base: "#a49d90", trim: "#fbf8f2", roof: "#8a3f30", door: "#33475b",
    openings: [
      { face: "front", at: 3, kind: "door" },
      { face: "front", at: 7, kind: "window", flowers: true },
    ],
    chimney: true,
  },
];

/** The house's footprint on the street, after its turn. */
function footprint(s: HouseSpec): { x0: number; x1: number; z1: number } {
  return s.turn === 1 ? { x0: s.x, x1: s.x + s.d, z1: s.z + s.w } : { x0: s.x, x1: s.x + s.w, z1: s.z + s.d };
}

/** The world x of the middle of the street-facing door. */
function doorX(s: HouseSpec): number {
  const street = s.turn === 1 ? "right" : "front";
  const door = s.openings.find((o) => o.kind === "door" && o.face === street);
  return door ? s.x + door.at + 1 : footprint(s).x0 + 1;
}

function streetBatch(): Batch {
  const b = new Batch();
  // pavement with tile joints, kerbs, road and its centre line
  b.box(PAVEMENT, 300, 0.3, 3, 0, 0, 9.5);
  for (let x = -150; x < 150; x += 2) b.box("#cfc8bb", 0.06, 0.02, 3, x, 0.3, 9.5);
  b.box(KERB, 300, 0.4, 0.5, 0, 0, 11.25);
  b.box(ROAD, 300, 0.08, 8, 0, 0, 15.5);
  for (let x = -150; x < 150; x += 5) b.box("#f1eee6", 2, 0.02, 0.18, x, 0.08, 15.5);
  b.box(KERB, 300, 0.4, 0.5, 0, 0, 19.75);
  b.box(PAVEMENT, 300, 0.3, 3, 0, 0, 21.5);
  for (let x = -150; x < 150; x += 2) b.box("#cfc8bb", 0.06, 0.02, 3, x, 0.3, 21.5);

  // the plot: a studded grey plate with a low stone edge on three sides
  const { w, d } = scene.bounds;
  b.box(PLOT, w, 0.12, d, w / 2, -0.12, d / 2);
  b.box("#d1ccc2", 0.3, 0.3, d + 0.3, -0.15, -0.05, d / 2 - 0.15);
  b.box("#d1ccc2", 0.3, 0.3, d + 0.3, w + 0.15, -0.05, d / 2 - 0.15);
  b.box("#d1ccc2", w + 0.6, 0.3, 0.3, w / 2, -0.05, -0.15);

  // neighbours, their front gardens and boundaries
  for (const s of NEIGHBOURS) {
    b.merge(house(s));
    const { x0, x1, z1 } = footprint(s);
    const gate = doorX(s);
    b.box("#d9d3c6", 2, 0.12, 8 - z1 + 1.5, gate, 0, z1 + (8 - z1) / 2);
    fenceRun(b, "#f2efe8", x0, gate - 1.5, 7.7);
    fenceRun(b, "#f2efe8", gate + 1.5, x1, 7.7);
    // a planter by the path and a low hedge along the far side of the garden
    b.box("#8a4b2f", 1, 0.8, 1, gate - 1.8, 0, z1 + 0.9);
    tree(b, gate - 1.8, z1 + 0.9, 0.32, "#5f9a55");
    hedge(b, x1 - 3, x1, z1 + 0.3, z1 + 1.3, 0.9);
    // back garden: a fence along the bottom, a tree in front of it
    fenceRun(b, "#c9b89c", x0, x1, -14);
    tree(b, (x0 + x1) / 2 + 2, -11, 1);
  }
  // low hedges on the plot's sides, nothing in front of it
  hedge(b, -2.5, -1, 0, 8, 0.9);
  hedge(b, w + 1, w + 2.5, 0, 8, 0.9);
  for (const x of [-17.5, 29.5, -49.5, 61]) lamp(b, x, 10.6);

  // the far side: a low park, kept low so it never blocks the view back
  hedge(b, -60, -6, 23.6, 24.4, 0.8);
  hedge(b, -2, 18, 23.6, 24.4, 0.8);
  hedge(b, 22, 80, 23.6, 24.4, 0.8);
  for (const x of [-40, -8, 26, 58]) b.box("#c96f5a", 6, 0.5, 2, x, 0, 30);
  for (let i = 0; i < 9; i++) tree(b, -60 + i * 16, 52 + (i % 3) * 5, 1.1);

  // behind: the backs of the next street's houses, past their own gardens,
  // so the view over the plot ends in a street rather than an empty field
  const walls = ["#e3d2b4", "#cfd8db", "#e8c9a6", "#d8ccb8"];
  const roofs = ["#7b4436", "#55606b", "#8d5a3f", "#4a5560"];
  for (let i = 0; i < 11; i++) {
    const x = -64 + i * 14;
    farHouse(b, x, -31, 10, 7, i % 3 === 1 ? 7.2 : 3.6 * 1.5, walls[i % 4], roofs[(i + 1) % 4], 0, true);
    fenceRun(b, "#c9b89c", x - 6, x + 6, -24);
    if (i % 2 === 0) tree(b, x + 4, -21, 0.9, "#55894d");
  }
  return b;
}

function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// Distant houses and trees in a ring well beyond the street: they set the
// scene at the horizon and fade into the fog.
function distanceBatch(): Batch {
  const b = new Batch();
  const r = rng(4020);
  const walls = ["#e7d6b8", "#d9c1a0", "#c9d2d6", "#e9cfb3", "#d6c9b6"];
  const roofs = ["#8d4a38", "#5b6470", "#7b4b3a", "#4f5a63"];
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const dist = 95 + r() * 90;
    const x = 8 + Math.cos(a) * dist;
    const z = 4 + Math.sin(a) * dist;
    if (Math.abs(z - 15) < 9) continue; // keep the road's line clear
    farHouse(b, x, z, 8 + r() * 6, 6 + r() * 3, 5 + r() * 5, walls[i % walls.length], roofs[i % roofs.length], Math.round(r() * 4) * (Math.PI / 2));
  }
  for (let i = 0; i < 120; i++) {
    const a = r() * Math.PI * 2;
    const dist = 60 + r() * 130;
    const x = 8 + Math.cos(a) * dist;
    const z = 4 + Math.sin(a) * dist;
    if (Math.abs(z - 15) < 9 || (z > -20 && z < 60 && Math.abs(x - 8) < 70)) continue;
    tree(b, x, z, 1.2 + r() * 0.8, i % 2 ? "#4b7d47" : "#5a8f4e");
  }
  spire(b, -64, -118);
  return b;
}

/** Studs on the ground near the plot, so the street stays in the brick idiom close up. */
function GroundStuds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => {
    const out: [number, number, string][] = [];
    for (let x = -20; x < 36; x++) {
      for (let z = -14; z < 8; z++) {
        const onPlot = x >= 0 && x < scene.bounds.w && z >= 0 && z < scene.bounds.d;
        const nearHouse = NEIGHBOURS.some((s) => {
          const f = footprint(s);
          return x >= f.x0 - 1 && x < f.x1 + 1 && z >= s.z - 1 && z < 8;
        });
        if (!nearHouse) out.push([x, z, onPlot ? PLOT : GRASS]);
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    cells.forEach(([x, z, colour], i) => {
      ref.current!.setMatrixAt(i, m.makeTranslation(x + 0.5, 0.09, z + 0.5));
      ref.current!.setColorAt(i, c.set(colour));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [cells]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} receiveShadow raycast={() => null}>
      <cylinderGeometry args={[0.3, 0.3, 0.18, 12]} />
      <meshStandardMaterial roughness={0.6} />
    </instancedMesh>
  );
}

function Sky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(SKY_TOP) }, horizon: { value: new THREE.Color(HORIZON) } },
        vertexShader: "varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main() { float h = clamp(normalize(vPos).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }",
      }),
    [],
  );
  return (
    <mesh material={material} raycast={() => null} renderOrder={-1}>
      <sphereGeometry args={[700, 32, 16]} />
    </mesh>
  );
}

const glass = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.12, metalness: 0.25 });
const lantern = new THREE.MeshStandardMaterial({ color: LANTERN, emissive: "#ffc670", emissiveIntensity: 0.6 });

function Batched({ batch, shadows = true }: { batch: () => Batch; shadows?: boolean }) {
  const meshes = useMemo(() => batch().build(), [batch]);
  return (
    <>
      {meshes.map(({ colour, geometry }) => (
        <mesh
          key={colour}
          geometry={geometry}
          material={colour === GLASS ? glass : colour === LANTERN ? lantern : plastic(colour)}
          castShadow={shadows}
          receiveShadow
          raycast={() => null}
        />
      ))}
    </>
  );
}

export function Street() {
  const { w, d } = scene.bounds;
  return (
    <group>
      <color attach="background" args={[HORIZON]} />
      <fog attach="fog" args={[HORIZON, 70, 300]} />
      <hemisphereLight args={["#fff2dc", "#8f9a76", 1.05]} />
      <Sky />
      {/* the ground runs out under the fog, not off an edge */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.06} receiveShadow raycast={() => null} material={plastic(GRASS)}>
        <circleGeometry args={[650, 48]} />
      </mesh>
      <Batched batch={streetBatch} />
      <Batched batch={distanceBatch} shadows={false} />
      <GroundStuds />
      {/* the plot's top face at y = 0: invisible, but it aims placements */}
      <mesh rotation-x={-Math.PI / 2} position={[w / 2, 0, d / 2]} userData={{ plot: true }}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}
