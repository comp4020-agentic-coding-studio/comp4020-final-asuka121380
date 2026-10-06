import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PartDefinition } from "../../domain/catalog.ts";

// Appearance only. Each part type becomes a few merged geometries centred on
// its footprint (x, z) with its base at y = 0, so a renderer can position it
// at the centre of the rotated footprint and rotate it by r × 90°.
//
// Proportions follow real bricks: one stud pitch is 1 unit (8 mm), a plate is
// 0.4 (3.2 mm), a brick 1.2, and a stud is 0.6 across and about 0.18 tall.

export const STUD = 1;
export const PLATE = 0.4;
const STUD_R = 0.3;
const STUD_H = 0.18;
const GAP = 0.012; // visible seam between neighbouring parts
const LIP = 0.16; // the short vertical face at the foot of a slope

/** "main" takes the part's chosen colour; a hex string is a fixed colour. */
export type Role = "main" | string;

export interface PartGeometry {
  pieces: { role: Role; geometry: THREE.BufferGeometry; transparent?: boolean }[];
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, radius = 0.03): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2));
  g.translate(x, y + h / 2, z);
  return g;
}

function stud(x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 20);
  g.translate(x, y + STUD_H / 2, z);
  return g;
}

function cellCentre(def: Pick<PartDefinition, "w" | "d">, lx: number, lz: number): [number, number] {
  return [lx + 0.5 - def.w / 2, lz + 0.5 - def.d / 2];
}

function studsOnTop(def: PartDefinition, top: number): THREE.BufferGeometry[] {
  const cells =
    def.studs === "all"
      ? Array.from({ length: def.w * def.d }, (_, i) => ({ x: i % def.w, z: Math.floor(i / def.w) }))
      : def.studs;
  return cells.map((c) => {
    const [x, z] = cellCentre(def, c.x, c.z);
    return stud(x, top, z);
  });
}

const merge = (gs: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  // three's built-in shapes mix indexed and non-indexed geometry, and merging
  // needs them alike
  const merged = mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!merged) throw new Error("could not merge part geometry");
  return merged;
};

// A slope's cross-section in (z, y), extruded along x: flat top along the back
// stud row, falling to a short lip at the front.
function slope(def: PartDefinition): THREE.BufferGeometry {
  const h = def.h * PLATE - GAP;
  const d = def.d - GAP;
  const w = def.w - GAP;
  const back = -d / 2;
  const s = new THREE.Shape();
  s.moveTo(back, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(d / 2, LIP);
  s.lineTo(back + 1, h);
  s.lineTo(back, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // shape x → world z, extrusion → world −x
  g.translate(w / 2, 0, 0);
  return g;
}

// Ridge along z, falling towards −x and +x.
function ridge(def: PartDefinition): THREE.BufferGeometry {
  const h = def.h * PLATE - GAP;
  const w = def.w - GAP;
  const d = def.d - GAP;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, LIP);
  s.lineTo(0, h);
  s.lineTo(-w / 2, LIP);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

const FRAME = "#f2f1ec";
const GLASS = "#cfe6f2";
const BRASS = "#f0d77a";
const LEAVES = "#4caf5c";
const CENTRE = "#f7f3df";

function door(def: PartDefinition): PartGeometry {
  const H = def.h * PLATE;
  const W = def.w - GAP;
  const post = 0.32;
  const head = 0.4;
  const frame = merge([
    box(post, H - GAP, 0.9, -W / 2 + post / 2, 0, 0),
    box(post, H - GAP, 0.9, W / 2 - post / 2, 0, 0),
    box(W, head, 0.9, 0, H - head - GAP, 0),
    box(W - 2 * post, 0.12, 0.9, 0, 0, 0),
    ...studsOnTop(def, H - GAP),
  ]);
  const leafW = W - 2 * post - 0.06;
  const leafH = H - head - 0.16;
  const z = 0.18;
  const leaf: THREE.BufferGeometry[] = [box(leafW, leafH, 0.16, 0, 0.12, z, 0.02)];
  // raised lower panel
  leaf.push(box(leafW * 0.68, leafH * 0.32, 0.06, 0, 0.12 + leafH * 0.1, z + 0.1, 0.02));
  // window: four panes in the upper half, mullions are the leaf showing through
  const glass: THREE.BufferGeometry[] = [];
  const paneW = leafW * 0.3;
  const paneH = leafH * 0.17;
  for (const sx of [-1, 1]) {
    for (const sy of [0, 1]) {
      glass.push(box(paneW, paneH, 0.05, sx * (paneW / 2 + 0.05), 0.12 + leafH * 0.55 + sy * (paneH + 0.1), z + 0.07, 0.01));
    }
  }
  const knob = new THREE.SphereGeometry(0.14, 16, 12);
  knob.translate(leafW / 2 - 0.35, 0.12 + leafH * 0.45, z + 0.16);
  return {
    pieces: [
      { role: FRAME, geometry: frame },
      { role: "main", geometry: merge(leaf) },
      { role: GLASS, geometry: merge(glass) },
      { role: BRASS, geometry: knob },
    ],
  };
}

function flower(): PartGeometry {
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 16);
    const a = (i / 3) * Math.PI * 2 + 0.4;
    leaf.scale(1, 1, 0.6);
    leaf.rotateY(-a);
    leaf.translate(Math.cos(a) * 0.36, 0.06, Math.sin(a) * 0.36);
    leaves.push(leaf);
  }
  const stem = new THREE.CylinderGeometry(0.12, 0.12, 0.62, 12);
  stem.translate(0, 0.31, 0);
  leaves.push(stem);
  const petals: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.CylinderGeometry(0.17, 0.17, 0.26, 14);
    const a = (i / 6) * Math.PI * 2;
    p.translate(Math.cos(a) * 0.24, 0.62 + 0.13, Math.sin(a) * 0.24);
    petals.push(p);
  }
  const centre = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 16);
  centre.translate(0, 0.62 + 0.17, 0);
  return {
    pieces: [
      { role: LEAVES, geometry: merge(leaves) },
      { role: "main", geometry: merge(petals) },
      { role: CENTRE, geometry: centre },
    ],
  };
}

function build(def: PartDefinition): PartGeometry {
  const H = def.h * PLATE;
  switch (def.geometry) {
    case "brick":
    case "plate":
      return { pieces: [{ role: "main", geometry: merge([box(def.w - GAP, H - GAP, def.d - GAP, 0, 0, 0), ...studsOnTop(def, H - GAP)]) }] };
    case "slope45":
      return { pieces: [{ role: "main", geometry: merge([slope(def), ...studsOnTop(def, H - GAP)]) }] };
    case "slope45-double":
      return { pieces: [{ role: "main", geometry: ridge(def) }] };
    case "round-plate": {
      const body = new THREE.CylinderGeometry(0.48, 0.48, H - GAP, 24);
      body.translate(0, (H - GAP) / 2, 0);
      return { pieces: [{ role: "main", geometry: merge([body, ...studsOnTop(def, H - GAP)]) }] };
    }
    case "door":
      return door(def);
    case "flower":
      return flower();
  }
}

const cache = new Map<string, PartGeometry>();

export function partGeometry(def: PartDefinition): PartGeometry {
  let g = cache.get(def.id);
  if (!g) {
    g = build(def);
    cache.set(def.id, g);
  }
  return g;
}

const outlines = new Map<string, THREE.BufferGeometry>();

/** The collision box's edges, for ghost outlines and selection highlights. */
export function outlineGeometry(def: PartDefinition): THREE.BufferGeometry {
  let g = outlines.get(def.id);
  if (!g) {
    const b = new THREE.BoxGeometry(def.w, def.h * PLATE, def.d);
    b.translate(0, (def.h * PLATE) / 2, 0);
    g = new THREE.EdgesGeometry(b);
    outlines.set(def.id, g);
  }
  return g;
}
