import * as THREE from "three";
import type { FixedPiece } from "../../../domain/scene.ts";
import { TREEHOUSE_SCENE } from "../../../domain/treehouse.ts";
import { PLATE } from "../../scene/geometry.ts";
import { Batch } from "../../scene/scenery.ts";

// The great tree's geometry (ADR 0016), shared by the editor's environment
// and the reference picture, so both draw the same tree from the same
// coordinates: the scene's fixed structure in src/domain/treehouse.ts.
//
// Inside the plot every bark or platform surface is exactly one of the
// rule boxes. All the bark's character (segments, ridges, shades, knots,
// the collars where branches join, moss at the foot) lies on or inside
// each box's faces, never outside them, so nothing looks like a ledge or a
// support where the rules have none, and nothing solid looks hollow.
// Above the plot's ceiling the tree carries on into the crown's limbs and
// the canopy, which are scenery only.

export const BARK = ["#5b3a26", "#4e321f", "#6a4630"];
const BARK_DEEP = "#3b2617";
const MOSS = "#5f7d3a";
export const DECK = "#9a6a42";
const DECK_LIGHT = "#a87850";
const DECK_EDGE = "#7a5032";
export const LEAVES = ["#4f8f3f", "#5d9c45", "#3f7a39", "#6aa64c"];
export const AUTUMN = ["#d9a23a", "#e0832f", "#c9692a", "#e6b84a"];

export const PIECES: readonly FixedPiece[] = TREEHOUSE_SCENE.fixed!.pieces;
const piece = (id: string) => PIECES.find((f) => f.id === id)!;

/** World box of a fixed piece. */
export function worldBox(f: FixedPiece): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  return { x0: f.x, x1: f.x + f.w, y0: f.y * PLATE, y1: (f.y + f.h) * PLATE, z0: f.z, z1: f.z + f.d };
}

/** A small seeded random source, so the tree looks the same everywhere. */
export function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

type Face = { axis: "x" | "z"; at: number; from: number; to: number; out: 1 | -1 };

function faces(w: ReturnType<typeof worldBox>): Face[] {
  return [
    { axis: "x", at: w.z1, from: w.x0, to: w.x1, out: 1 },
    { axis: "x", at: w.z0, from: w.x0, to: w.x1, out: -1 },
    { axis: "z", at: w.x0, from: w.z0, to: w.z1, out: -1 },
    { axis: "z", at: w.x1, from: w.z0, to: w.z1, out: 1 },
  ];
}

/** A flat patch lying on a face, a hair inside it: `u` along the face, `y` up. */
function patch(b: Batch, colour: string, f: Face, u: number, y: number, du: number, dy: number, depth = 0.05): void {
  const inset = f.at - f.out * (depth / 2 + 0.005);
  if (f.axis === "x") b.box(colour, du, dy, depth, u, y, inset);
  else b.box(colour, depth, dy, du, inset, y, u);
}

/**
 * One bark box: a solid core exactly inside the box, bevelled vertical
 * corners, and on each face bark plates in uneven segments and three
 * shades, with a darker foot (moss on the shady back), knots, and collars
 * where the branches meet the trunk.
 */
function barkBox(b: Batch, f: FixedPiece, r: () => number): void {
  const w = worldBox(f);
  const sx = w.x1 - w.x0;
  const sz = w.z1 - w.z0;
  const h = w.y1 - w.y0;
  const cx = (w.x0 + w.x1) / 2;
  const cz = (w.z0 + w.z1) / 2;
  const tone = f.kind === "root" ? BARK[1] : BARK[0];
  b.box(tone, sx - 0.06, h, sz - 0.06, cx, w.y0, cz);
  // bevelled corners: darker strips along each vertical edge, inside the box
  if (f.kind === "trunk") {
    for (const [x, z] of [[w.x0, w.z0], [w.x1, w.z0], [w.x0, w.z1], [w.x1, w.z1]]) {
      b.box(BARK_DEEP, 0.32, h, 0.32, x - Math.sign(x - cx) * 0.17, w.y0, z - Math.sign(z - cz) * 0.17);
    }
  }
  for (const face of faces(w)) {
    const length = face.to - face.from;
    if (f.kind === "branch" && face.axis === "z") continue; // the branch's end faces: just the core
    // bark plates: vertical strips of uneven width, each broken into segments
    let u = face.from + 0.2;
    while (u < face.to - 0.2) {
      const du = Math.min(0.35 + r() * 0.55, face.to - 0.2 - u);
      if (f.kind === "branch") {
        // a branch's bark runs along it: long horizontal plates
        const rows = Math.max(1, Math.round(h / 0.5));
        for (let k = 0; k < rows; k++) if (r() < 0.6) patch(b, BARK[(k + Math.floor(u)) % 3], face, u + du / 2, w.y0 + 0.08 + (k * (h - 0.16)) / rows, du, (h - 0.16) / rows - 0.06);
      } else {
        let y = w.y0 + r() * 0.4;
        while (y < w.y1 - 0.3) {
          const dy = Math.min(1.2 + r() * 2.6, w.y1 - 0.15 - y);
          if (r() < 0.75) patch(b, BARK[Math.floor(r() * 3)], face, u + du / 2, y, du - 0.08, dy - 0.1);
          y += dy;
        }
      }
      u += du + 0.06;
    }
    if (f.kind !== "trunk") continue;
    // a darker foot where the trunk meets the ground; moss on the back
    if (f.y === 0) patch(b, face.out === -1 && face.axis === "x" ? MOSS : BARK_DEEP, face, face.from + length / 2, w.y0, length - 0.4, 0.7, 0.07);
    // a few knots
    for (let k = 0; k < Math.round(length / 3); k++) {
      const ku = face.from + 0.8 + r() * (length - 1.6);
      const ky = w.y0 + 2 + r() * (h - 4);
      patch(b, BARK_DEEP, face, ku, ky, 0.5, 0.45, 0.09);
    }
  }
}

/** Where a branch joins the trunk: a darker collar on the trunk's face, flush. */
function collars(b: Batch): void {
  const trunk = worldBox(piece("trunk-lower"));
  for (const id of ["branch-left", "branch-right"]) {
    const br = worldBox(piece(id));
    const x = br.x1 <= trunk.x0 + 0.01 ? trunk.x0 : trunk.x1;
    const face: Face = { axis: "z", at: x, from: trunk.z0, to: trunk.z1, out: x === trunk.x0 ? -1 : 1 };
    const zc = (br.z0 + br.z1) / 2;
    const hh = br.y1 - br.y0;
    patch(b, BARK_DEEP, face, zc, br.y0 - 0.5, br.z1 - br.z0 + 1.2, hh + 1, 0.06);
    patch(b, BARK[2], face, zc, br.y0 - 0.25, br.z1 - br.z0 + 0.6, hh + 0.5, 0.08);
  }
}

/** A platform: a timber deck with a darker rim and studs on top, exactly its box. */
function deck(b: Batch, f: FixedPiece): void {
  const w = worldBox(f);
  const cx = (w.x0 + w.x1) / 2;
  const cz = (w.z0 + w.z1) / 2;
  const sx = w.x1 - w.x0;
  const sz = w.z1 - w.z0;
  const h = w.y1 - w.y0;
  b.box(DECK_EDGE, sx, h * 0.5, sz, cx, w.y0, cz);
  for (let i = 0; i < sx; i++) b.box(i % 2 ? DECK : DECK_LIGHT, 0.96, h * 0.5 - 0.01, sz - 0.04, w.x0 + i + 0.5, w.y0 + h * 0.5, cz);
  b.studs(DECK, w.x0, w.x1, w.z0, w.z1, w.y1);
}

/** The trunk, roots, branches and platforms: exactly the rule boxes. */
export function treeBatch(): Batch {
  const b = new Batch();
  const r = rng(318);
  for (const f of PIECES) {
    if (f.kind === "deck") deck(b, f);
    else barkBox(b, f, r);
  }
  collars(b);
  return b;
}

/**
 * Above the plot's ceiling the trunk carries on and divides into the limbs
 * that hold the canopy. They are part of the crown, so "Hide leaves" hides
 * them with it: all that stays is the trunk and the platforms the rules use.
 */
export function crownLimbs(b: Batch): void {
  const stem = piece("trunk-stem");
  const top = (stem.y + stem.h) * PLATE;
  const sx = stem.x + stem.w / 2;
  const sz = stem.z + stem.d / 2;
  b.box(BARK[0], stem.w - 0.06, 3, stem.d - 0.06, sx, top, sz);
  const limb = (dx: number, dz: number, len: number, rise: number, thick: number, shade = 0) => {
    const g = new THREE.BoxGeometry(thick, len, thick);
    g.translate(0, len / 2, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(dz * rise, 0, -dx * rise)).setPosition(sx, top + 2, sz);
    b.add(BARK[shade], g, m);
  };
  limb(-1, 0, 12, 0.75, 2.2);
  limb(1, 0, 12, 0.7, 2.2, 2);
  limb(0, -1, 11, 0.6, 2, 1);
  limb(-0.6, -0.8, 10, 0.9, 1.6, 2);
  limb(0.7, -0.7, 10, 0.95, 1.6);
  limb(0, 0, 9, 0, 2.4, 1);
}

/** A rounded clump of leaves: a few overlapping low-poly blobs. */
export function clump(b: Batch, x: number, y: number, z: number, s: number, r: () => number, autumn: number): void {
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
 * down into the plot, at any height. `density` thins it for the reference
 * picture.
 */
export function canopyBatch(density = 1): Batch {
  const b = new Batch();
  const r = rng(21318);
  crownLimbs(b);
  const stem = piece("trunk-stem");
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
    if (r() < density) clump(b, x, y, z, 1.25, r, 0.22);
  }
  // the dome's skirt, hanging a little lower behind and to the sides of
  // the crown, joined to it; never in front of the trunk
  for (let i = 0; i < 18; i++) {
    const a = Math.PI + (i / 17) * Math.PI; // from the left, round the back, to the right
    const x = cx + Math.cos(a) * (15 + r() * 4);
    const z = cz + Math.sin(a) * (9 + r() * 3) - 1;
    if (r() < density) clump(b, x, top + 1 + r() * 3, z, 1.1, r, 0.3);
  }
  return b;
}
