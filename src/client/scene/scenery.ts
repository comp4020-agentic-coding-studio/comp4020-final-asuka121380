import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLATE } from "./geometry.ts";

// Fixed scenery, generated in the same brick language as the player's parts:
// courses of 1-stud-thick bricks with seams, openings left in the courses
// for doors and windows, slopes stepping up to a ridge. None of it is in the
// build, the kit or the rules, and none of it is pickable.
//
// Everything a building is made of is merged into one geometry per colour,
// so a whole house costs a handful of draw calls. Bricks here are plain boxes
// with a seam gap; studs are only drawn where nothing covers them.

const COURSE = 3 * PLATE;
const GAP = 0.025;

export class Batch {
  private byColour = new Map<string, THREE.BufferGeometry[]>();

  add(colour: string, g: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    const geom = g.index ? g.toNonIndexed() : g;
    if (m) geom.applyMatrix4(m);
    let list = this.byColour.get(colour);
    if (!list) this.byColour.set(colour, (list = []));
    list.push(geom);
  }

  /** A box with its base at y, centred on (x, z). */
  box(colour: string, w: number, h: number, d: number, x: number, y: number, z: number, m?: THREE.Matrix4): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.add(colour, g, m);
  }

  studs(colour: string, x0: number, x1: number, z0: number, z1: number, y: number, m?: THREE.Matrix4): void {
    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        const g = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10);
        g.translate(x + 0.5, y + 0.09, z + 0.5);
        this.add(colour, g, m);
      }
    }
  }

  merge(other: Batch): void {
    for (const [c, list] of other.byColour) for (const g of list) this.add(c, g);
  }

  build(): { colour: string; geometry: THREE.BufferGeometry }[] {
    return [...this.byColour].map(([colour, list]) => {
      const geometry = mergeGeometries(list.map((g) => (g.attributes.uv ? g : withUv(g))));
      if (!geometry) throw new Error("could not merge scenery");
      geometry.computeBoundingSphere();
      return { colour, geometry };
    });
  }
}

const withUv = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((g.attributes.position.count ?? 0) * 2), 2));
  return g;
};

// A slope's cross-section, extruded along x: high flat edge at the back (−z),
// falling to a short lip at the front (+z). Origin at its back-left-bottom.
function slopeRun(len: number, depth: number, height: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(depth, 0);
  s.lineTo(depth, 0.14);
  s.lineTo(1, height);
  s.lineTo(0, height);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // shape x → world z, extrusion → world −x
  g.translate(len, 0, 0);
  return g;
}

function ridgeRun(len: number, height: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(2, 0);
  s.lineTo(2, 0.14);
  s.lineTo(1, height);
  s.lineTo(0, 0.14);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(len, 0, 0);
  return g;
}

// ---- houses ----------------------------------------------------------------

export type Face = "front" | "back" | "left" | "right";

export interface Opening {
  face: Face;
  /** Position along the face, in studs from its left end seen from outside. */
  at: number;
  kind: "door" | "window";
  /** 0 for the ground floor, 1 for the first floor. */
  storey?: number;
  flowers?: boolean;
}

export interface HouseSpec {
  /** World position of the house's local origin, and a quarter turn (1 turns the local right face to the street). */
  x: number;
  z: number;
  turn?: 0 | 1;
  /** Local footprint: w along the ridge, d across it (even). */
  w: number;
  d: number;
  storeys: 1 | 2;
  wall: string;
  base: string;
  trim: string;
  roof: string;
  door: string;
  openings: Opening[];
  chimney?: boolean;
  canopy?: boolean;
}

// Each face as a frame: u runs left to right seen from outside, +z points out.
function faceFrame(face: Face, w: number, d: number): { len: number; m: THREE.Matrix4 } {
  const m = new THREE.Matrix4();
  switch (face) {
    case "front":
      return { len: w, m: m.makeTranslation(0, 0, d) };
    case "back":
      return { len: w, m: m.makeRotationY(Math.PI).setPosition(w, 0, 0) };
    case "left":
      return { len: d, m: m.makeRotationY(-Math.PI / 2).setPosition(0, 0, 0) };
    case "right":
      return { len: d, m: m.makeRotationY(Math.PI / 2).setPosition(w, 0, d) };
  }
}

const GLASS = "#9fb7c6";
const SOIL = "#4b3427";
const LEAF = "#4f8f4a";
const BLOOMS = ["#ef8fae", "#f6f1e9", "#e5c14a"];

interface Hole {
  u0: number;
  u1: number;
  c0: number;
  c1: number;
}

function holeOf(o: Opening): Hole {
  if (o.kind === "door") return { u0: o.at, u1: o.at + 2, c0: 1, c1: 6 };
  const base = 1 + (o.storey ?? 0) * 6;
  return { u0: o.at, u1: o.at + 2, c0: base + 2, c1: base + 4 };
}

/** Bricks for one course of one face, around its openings. */
function course(b: Batch, colour: string, from: number, to: number, c: number, holes: Hole[], m: THREE.Matrix4): void {
  let u = from;
  let first = true;
  while (u < to) {
    const hole = holes.find((h) => c >= h.c0 && c < h.c1 && u >= h.u0 && u < h.u1);
    if (hole) {
      u = hole.u1;
      first = true;
      continue;
    }
    const nextHole = Math.min(to, ...holes.filter((h) => c >= h.c0 && c < h.c1 && h.u0 > u).map((h) => h.u0));
    const room = nextHole - u;
    const len = Math.min(room, first && c % 2 === 1 ? 2 : 4);
    b.box(colour, len - GAP, COURSE - GAP, 1 - GAP, u + len / 2, c * COURSE, -0.5, m);
    u += len;
    first = false;
  }
}

function doorDetail(b: Batch, s: HouseSpec, h: Hole, m: THREE.Matrix4): void {
  const y0 = h.c0 * COURSE;
  const hgt = (h.c1 - h.c0) * COURSE;
  const cx = (h.u0 + h.u1) / 2;
  const w = h.u1 - h.u0;
  // the door itself, set back into the opening, with a raised panel and knob
  b.box(s.door, w - 0.12, hgt - 0.06, 0.14, cx, y0, -0.62, m);
  b.box(s.door, w * 0.6, hgt * 0.3, 0.06, cx, y0 + hgt * 0.12, -0.52, m);
  b.box(GLASS, w * 0.55, hgt * 0.22, 0.04, cx, y0 + hgt * 0.62, -0.53, m);
  const knob = new THREE.SphereGeometry(0.12, 10, 8);
  knob.translate(cx + w / 2 - 0.35, y0 + hgt * 0.45, -0.48);
  b.add("#e8cf74", knob, m);
  // reveal: the opening's sides, so the wall reads as having depth
  b.box(s.trim, 0.16, hgt, 0.62, h.u0 + 0.08, y0, -0.31, m);
  b.box(s.trim, 0.16, hgt, 0.62, h.u1 - 0.08, y0, -0.31, m);
  // projecting frame and lintel
  b.box(s.trim, 0.22, hgt, 0.14, h.u0 - 0.06, y0, 0.05, m);
  b.box(s.trim, 0.22, hgt, 0.14, h.u1 + 0.06, y0, 0.05, m);
  b.box(s.trim, w + 0.9, PLATE, 0.3, cx, y0 + hgt, 0.08, m);
  // three steps up to the door from the ground
  for (let i = 0; i < 3; i++) b.box("#c9c3b6", w + 1.4 - i * 0.3, PLATE * (i + 1), 1.5 - i * 0.45, cx, 0, (1.5 - i * 0.45) / 2, m);
  if (s.canopy) {
    // a small roof over the door on two brackets
    const roof = slopeRun(w + 1.2, 1.2, 0.5);
    roof.translate(cx - (w + 1.2) / 2, y0 + hgt + 0.6, -0.1);
    b.add(s.roof, roof, m);
    b.box(s.trim, w + 1.2, 0.18, 1.2, cx, y0 + hgt + 0.42, 0.5, m);
  }
}

function windowDetail(b: Batch, s: HouseSpec, o: Opening, h: Hole, m: THREE.Matrix4): void {
  const y0 = h.c0 * COURSE;
  const hgt = (h.c1 - h.c0) * COURSE;
  const cx = (h.u0 + h.u1) / 2;
  const w = h.u1 - h.u0;
  b.box(GLASS, w - 0.1, hgt - 0.1, 0.06, cx, y0 + 0.05, -0.55, m);
  // glazing bars
  b.box(s.trim, 0.1, hgt, 0.08, cx, y0, -0.49, m);
  b.box(s.trim, w, 0.1, 0.08, cx, y0 + hgt / 2 - 0.05, -0.49, m);
  // reveal, frame, lintel, sill
  b.box(s.trim, 0.14, hgt, 0.55, h.u0 + 0.07, y0, -0.28, m);
  b.box(s.trim, 0.14, hgt, 0.55, h.u1 - 0.07, y0, -0.28, m);
  b.box(s.trim, w + 0.5, PLATE, 0.24, cx, y0 + hgt, 0.06, m);
  b.box(s.trim, w + 0.6, 0.2, 0.5, cx, y0 - 0.2, 0.1, m);
  if (o.flowers) {
    b.box("#8a4b2f", w + 0.2, 0.5, 0.5, cx, y0 - 0.72, 0.3, m);
    b.box(SOIL, w, 0.06, 0.36, cx, y0 - 0.24, 0.3, m);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.SphereGeometry(0.2, 8, 6);
      leaf.translate(cx - w / 2 + 0.25 + i * ((w - 0.5) / 4), y0 - 0.12, 0.3);
      b.add(LEAF, leaf, m);
      const bloom = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8);
      bloom.translate(cx - w / 2 + 0.3 + i * ((w - 0.5) / 4), y0 + 0.08, 0.32 + (i % 2) * 0.06);
      b.add(BLOOMS[i % 3], bloom, m);
    }
  }
}

/** A house with walls 1 stud thick, real openings, a stepped roof and a ridge. */
export function house(s: HouseSpec): Batch {
  const b = new Batch();
  const courses = 1 + s.storeys * 6;
  const faces: Face[] = ["front", "back", "left", "right"];
  for (const face of faces) {
    const { len, m } = faceFrame(face, s.w, s.d);
    const mine = s.openings.filter((o) => o.face === face);
    const holes = mine.map(holeOf);
    const long = face === "front" || face === "back";
    for (let c = 0; c < courses; c++) {
      // corners alternate between the long and short walls, course by course
      const full = (c % 2 === 0) === long;
      course(b, c === 0 ? s.base : s.wall, full ? 0 : 1, full ? len : len - 1, c, holes, m);
    }
    // a string course of trim between storeys
    if (s.storeys === 2) b.box(s.trim, len + 0.2, PLATE * 0.6, 0.2, len / 2, 7 * COURSE - 0.1, 0.06, m);
    mine.forEach((o, i) => (o.kind === "door" ? doorDetail(b, s, holes[i], m) : windowDetail(b, s, o, holes[i], m)));
  }

  // roof: an eave plate, then slopes stepping in from front and back to a ridge
  const top = courses * COURSE;
  const over = 0.5;
  b.box(s.trim, s.w + 2 * over, PLATE, s.d + 0.6, s.w / 2, top, s.d / 2);
  const len = s.w + 2 * over;
  let k = 0;
  for (; s.d - 2 - k - (k + 2) >= 0; k++) {
    const y = top + PLATE + k * COURSE;
    const front = slopeRun(len, 2, COURSE);
    front.translate(-over, y, s.d - 2 - k + 0.3);
    b.add(s.roof, front);
    const back = slopeRun(len, 2, COURSE);
    back.rotateY(Math.PI);
    back.translate(s.w + over, y, k + 2 - 0.3);
    b.add(s.roof, back);
    // gable ends between the two rows
    const gap = s.d - 2 - k - (k + 2);
    if (gap > 0) {
      for (const x of [0.5, s.w - 0.5]) b.box(s.wall, 1 - GAP, COURSE - GAP, gap, x, y, k + 2 + gap / 2);
    }
  }
  const ridge = ridgeRun(len, COURSE);
  ridge.translate(-over, top + PLATE + k * COURSE, s.d / 2 - 1);
  b.add(s.roof, ridge);
  if (s.chimney) {
    const cx = s.w - 2.5;
    b.box("#9a5a44", 2, top + PLATE + (k + 1.6) * COURSE - top, 2, cx, top, s.d / 2 - 1.5);
    b.box("#5f5a55", 2.3, PLATE, 2.3, cx, top + PLATE + (k + 1.6) * COURSE, s.d / 2 - 1.5);
  }

  // turn and place the whole house
  const m = new THREE.Matrix4();
  if (s.turn === 1) m.makeRotationY(-Math.PI / 2).setPosition(s.x + s.d, 0, s.z);
  else m.makeTranslation(s.x, 0, s.z);
  const placed = new Batch();
  for (const { colour, geometry } of b.build()) placed.add(colour, geometry, m);
  return placed;
}

// ---- small street furniture --------------------------------------------------

/** A low fence of posts and rails along x, from x0 to x1 at depth z. */
export function fenceRun(b: Batch, colour: string, x0: number, x1: number, z: number): void {
  for (let x = x0; x <= x1; x += 2) b.box(colour, 0.36, 1.3, 0.36, x, 0, z);
  b.box(colour, x1 - x0, 0.16, 0.16, (x0 + x1) / 2, 0.45, z);
  b.box(colour, x1 - x0, 0.16, 0.16, (x0 + x1) / 2, 1.0, z);
}

/** A low clipped hedge of brick-built blocks. */
export function hedge(b: Batch, x0: number, x1: number, z0: number, z1: number, h = 1.2): void {
  b.box("#3f6e3f", x1 - x0, h, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2);
  b.studs("#3f6e3f", x0, x1, z0, z1, h);
}

/** A brick-built tree: a trunk of round bricks and a stepped canopy. */
export function tree(b: Batch, x: number, z: number, scale = 1, canopy = "#47804a"): void {
  const t = new THREE.CylinderGeometry(0.35 * scale, 0.42 * scale, 2.6 * scale, 10);
  t.translate(x, 1.3 * scale, z);
  b.add("#6a4a33", t);
  const tiers = [3.4, 2.6, 1.6];
  tiers.forEach((w, i) => b.box(i === 1 ? "#5a9a52" : canopy, w * scale, 1.2 * scale, w * scale, x, (2.4 + i * 1.2) * scale, z));
}

/** A street lamp: a dark post of round bricks and a warm lantern. */
export function lamp(b: Batch, x: number, z: number): void {
  b.box("#3b3d40", 0.7, 0.4, 0.7, x, 0, z);
  const post = new THREE.CylinderGeometry(0.14, 0.18, 4.2, 10);
  post.translate(x, 2.5, z);
  b.add("#3b3d40", post);
  b.box("#3b3d40", 0.8, 0.14, 0.8, x, 4.6, z);
  b.box("#ffd9a0", 0.56, 0.7, 0.56, x, 4.74, z);
  b.box("#3b3d40", 0.9, 0.18, 0.9, x, 5.44, z);
}

/** A distant house: a simple box and pitched roof, enough to read at range; windows for the middle distance. */
export function farHouse(b: Batch, x: number, z: number, w: number, d: number, h: number, wall: string, roof: string, rotY: number, windows = false): void {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  b.box(wall, w, h, d, 0, 0, 0, m);
  if (windows) {
    const storeys = Math.max(1, Math.floor(h / 3.6));
    for (let s = 0; s < storeys; s++) {
      for (let wx = -w / 2 + 1.5; wx <= w / 2 - 1.2; wx += 2.6) {
        for (const side of [-1, 1]) b.box("#4d5963", 1.1, 1.4, 0.12, wx + 0.55, 1.2 + s * 3.6, side * (d / 2 + 0.02), m);
      }
    }
  }
  const s = new THREE.Shape();
  s.moveTo(-d / 2 - 0.3, 0);
  s.lineTo(d / 2 + 0.3, 0);
  s.lineTo(0, d * 0.45);
  s.closePath();
  const r = new THREE.ExtrudeGeometry(s, { depth: w + 0.6, bevelEnabled: false });
  r.rotateY(-Math.PI / 2);
  r.translate((w + 0.6) / 2, h, 0);
  b.add(roof, r, m);
}

export function spire(b: Batch, x: number, z: number): void {
  b.box("#d8cdb8", 5, 12, 5, x, 0, z);
  const cone = new THREE.ConeGeometry(3, 9, 4);
  cone.rotateY(Math.PI / 4);
  cone.translate(x, 16.5, z);
  b.add("#5b6b73", cone);
}
