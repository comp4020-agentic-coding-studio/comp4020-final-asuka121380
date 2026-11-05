import type { Rotation } from "./grid.ts";
import type { Placement } from "./rules.ts";
import type { SceneTemplate } from "./scene.ts";

// The Medieval Castle scene (ADR 0015). Its kit comes from the parts counted
// in the primary model's official instructions (LEGO Creator 31120, booklet 1),
// mapped to this game's catalogue; the counting, mapping and every
// substitution are recorded in doc/research/0002-medieval-castle-reference.md.
// The reference below is an adapted assembly of the same castle, built only
// from parts the kit holds and checked against the rules by the tests.

/** Required quantity per game part, from the research record's mapping table. */
export const CASTLE_REQUIRED: Readonly<Record<string, number>> = {
  "brick-1x1": 176,
  "brick-1x2": 151,
  "brick-1x4": 60,
  "round-brick-1x1": 73,
  "brick-2x2": 11,
  "brick-2x4": 5,
  "plate-1x2": 50,
  "plate-2x2": 6,
  "plate-2x4": 6,
  "plate-2x8": 8,
  "plate-6x6": 11,
  "round-1x1": 13,
  "slope-2x1": 26,
  "slope-2x2": 10,
  "ridge-2x2": 4,
  "inv-slope-2x2": 30,
  "arch-1x4": 16,
  "arch-1x8x2": 3,
  "door-1x4x6": 1,
  "window-1x2x2": 5,
};

/** allocated quantity = ceil(required quantity × 1.30), in whole pieces. */
export const allocate = (required: number): number => Math.ceil(Math.round(required * 130) / 100);

const kit = Object.fromEntries(Object.entries(CASTLE_REQUIRED).map(([id, n]) => [id, allocate(n)]));

const P = (partId: string, x: number, y: number, z: number, rot: Rotation, colour: string): Placement => ({ partId, x, y, z, rot, colour });

// Layout, in plot studs: the castle's front (the gate) faces +z, towards the
// default camera. Towers at the front corners, curtain walls round a small
// courtyard, and a roofed hall against the back wall.
const OX = 4;
const OZ = 3;
const STONE = "stone";
const DARK = "charcoal";
const TIMBER = "bark";
const ROOF = "navy";

type Axis = "x" | "z";

/** One course of a straight wall: greedy long bricks, staggered by `offset`. */
function run(axis: Axis, from: number, length: number, at: number, y: number, colour: string, offset = false): Placement[] {
  const out: Placement[] = [];
  let i = 0;
  const put = (id: string, n: number) => {
    const c = from + i;
    out.push(axis === "x" ? P(id, c, y, at, n === 1 ? 0 : 0, colour) : P(id, at, y, c, n === 1 ? 0 : 1, colour));
    i += n;
  };
  if (offset && length - i >= 2) put("brick-1x2", 2);
  while (length - i >= 4) put("brick-1x4", 4);
  while (length - i >= 2) put("brick-1x2", 2);
  while (length - i >= 1) put("brick-1x1", 1);
  return out;
}

/** A 6×6 tower standing on its own 6×6 plate, `courses` bricks high, with a crenellated top. */
function tower(tx: number, tz: number, courses: number): Placement[] {
  const out: Placement[] = [P("plate-6x6", tx, 0, tz, 0, "sand")];
  const front = tz + 5;
  for (let k = 0; k < courses; k++) {
    const y = 1 + 3 * k;
    const even = k % 2 === 0;
    const corner = even ? "round-brick-1x1" : "brick-1x1";
    for (const [x, z] of [[tx, tz], [tx + 5, tz], [tx, front], [tx + 5, front]]) out.push(P(corner, x, y, z, 0, STONE));
    const top = k === courses - 1;
    const door = k < 2; // a doorway from the courtyard, under an arch
    const window = k === 3 || k === 4;
    // front and back rows (along x), between the corners
    for (const z of [tz, front]) {
      const isBack = z === tz;
      if (top) out.push(P("arch-1x4", tx + 1, y, z, 0, STONE));
      else if (isBack && door) out.push(P("brick-1x1", tx + 1, y, z, 0, STONE), P("brick-1x1", tx + 4, y, z, 0, STONE));
      else if (isBack && k === 2) out.push(P("arch-1x4", tx + 1, y, z, 0, STONE));
      else if (!isBack && window) {
        out.push(P("brick-1x1", tx + 1, y, z, 0, STONE), P("brick-1x1", tx + 4, y, z, 0, STONE));
        if (k === 3) out.push(P("window-1x2x2", tx + 2, y, z, 0, TIMBER));
      } else out.push(...run("x", tx + 1, 4, z, y, STONE, !even));
    }
    // the two sides (along z)
    for (const x of [tx, tx + 5]) {
      if (top) out.push(P("arch-1x4", x, y, tz + 1, 1, STONE));
      else out.push(...run("z", tz + 1, 4, x, y, k % 4 === 1 ? DARK : STONE, !even));
    }
  }
  const roof = 1 + 3 * courses;
  out.push(P("plate-6x6", tx, roof, tz, 0, DARK));
  const m = roof + 1;
  for (const [x, z] of [[tx, tz], [tx + 5, tz], [tx, front], [tx + 5, front]]) {
    out.push(P("round-brick-1x1", x, m, z, 0, STONE), P("round-brick-1x1", x, m + 3, z, 0, STONE), P("round-1x1", x, m + 6, z, 0, "bright-red"));
  }
  // one merlon in the middle of each side
  out.push(P("brick-1x2", tx + 2, m, tz, 0, STONE), P("brick-1x2", tx + 2, m, front, 0, STONE));
  out.push(P("brick-1x2", tx, m, tz + 2, 1, STONE), P("brick-1x2", tx + 5, m, tz + 2, 1, STONE));
  return out;
}

// The hall against the back wall: an 8×6 storey with the door facing the
// courtyard, a window in each side, and a 45° gable roof over it.
function hall(kx: number, kz: number): Placement[] {
  const out: Placement[] = [];
  const front = kz + 5;
  for (let k = 0; k < 6; k++) {
    const y = 3 * k;
    const even = k % 2 === 0;
    const window = k === 2 || k === 3;
    if (even) {
      out.push(...run("x", kx, 8, kz, y, STONE));
      out.push(...run("x", kx, 2, front, y, STONE), ...run("x", kx + 6, 2, front, y, STONE));
      for (const x of [kx, kx + 7]) {
        if (window) out.push(P("brick-1x1", x, y, kz + 1, 0, STONE), P("brick-1x1", x, y, kz + 4, 0, STONE));
        else out.push(...run("z", kz + 1, 4, x, y, STONE));
      }
    } else {
      out.push(...run("x", kx + 1, 6, kz, y, STONE, true));
      out.push(P("brick-1x1", kx + 1, y, front, 0, STONE), P("brick-1x1", kx + 6, y, front, 0, STONE));
      for (const x of [kx, kx + 7]) {
        if (window) out.push(P("brick-1x1", x, y, kz, 0, STONE), P("brick-1x1", x, y, kz + 1, 0, STONE), P("brick-1x1", x, y, kz + 4, 0, STONE), P("brick-1x1", x, y, front, 0, STONE));
        else out.push(...run("z", kz, 6, x, y, STONE, true));
      }
    }
    if (k === 2) out.push(P("window-1x2x2", kx, y, kz + 2, 1, TIMBER), P("window-1x2x2", kx + 7, y, kz + 2, 1, TIMBER));
  }
  out.push(P("door-1x4x6", kx + 2, 0, front, 0, TIMBER));
  // roof: three 2×8 plates over the walls, two 2×4 bricks under the ridge,
  // a course of 2×2 slopes front and back, then the ridge
  for (const z of [kz, kz + 2, kz + 4]) out.push(P("plate-2x8", kx, 18, z, 0, TIMBER));
  out.push(P("brick-2x4", kx, 19, kz + 2, 0, ROOF), P("brick-2x4", kx + 4, 19, kz + 2, 0, ROOF));
  for (let x = kx; x < kx + 8; x += 2) out.push(P("slope-2x2", x, 19, kz + 4, 0, ROOF), P("slope-2x2", x, 19, kz, 2, ROOF));
  for (let x = kx; x < kx + 8; x += 2) out.push(P("ridge-2x2", x, 22, kz + 2, 1, ROOF));
  return out;
}

const WALL = 4; // courses of curtain wall under the wall-walk

// Curtain walls: four courses, then a wall-walk of inverted slopes resting on
// the wall's top and widening into the courtyard, with merlons on the outer
// row. The front wall carries the gate: a 1×8×2 arch on two pillars.
function walls(): Placement[] {
  const out: Placement[] = [];
  const left = OX;
  const right = OX + 23;
  const back = OZ;
  const front = OZ + 17;
  for (let k = 0; k < WALL; k++) {
    const y = 3 * k;
    const even = k % 2 === 0;
    // side walls run from the back corner to the towers (z back..back+11)
    if (even) {
      out.push(...run("z", back, 12, left, y, STONE), ...run("z", back, 12, right, y, STONE));
      out.push(...run("x", left + 1, 7, back, y, STONE), ...run("x", right - 7, 7, back, y, STONE, true));
    } else {
      out.push(...run("z", back + 1, 11, left, y, STONE, true), ...run("z", back + 1, 11, right, y, STONE, true));
      out.push(...run("x", left, 8, back, y, STONE, true), ...run("x", right - 7, 8, back, y, STONE));
    }
    // the gate's pillars: three cells each side for two courses, then two
    if (k < 2) out.push(...run("x", OX + 6, 3, front, y, STONE, !even), ...run("x", OX + 15, 3, front, y, STONE, even));
    else out.push(...run("x", OX + 6, 2, front, y, STONE), ...run("x", OX + 16, 2, front, y, STONE));
  }
  out.push(P("arch-1x8x2", OX + 8, 6, front, 0, STONE));
  const walk = 3 * WALL;
  // wall-walk: inverted slopes rest on the wall and widen inwards
  for (let x = OX + 6; x < OX + 18; x += 2) out.push(P("inv-slope-2x2", x, walk, front - 1, 2, DARK));
  for (let z = back + 2; z < back + 12; z += 2) out.push(P("inv-slope-2x2", left, walk, z, 1, DARK), P("inv-slope-2x2", right - 1, walk, z, 3, DARK));
  for (const x of [left + 2, left + 4, left + 6, right - 7, right - 5, right - 3]) out.push(P("inv-slope-2x2", x, walk, back, 0, DARK));
  const m = walk + 3;
  // merlons on the outer row, a timber walk on the inner row
  for (let x = OX + 6; x < OX + 18; x += 2) out.push(P("brick-1x1", x, m, front, 0, STONE), P("plate-1x2", x, m, front - 1, 0, TIMBER));
  for (let z = back + 2; z < back + 12; z += 2) {
    out.push(P("brick-1x1", left, m, z + 1, 0, STONE), P("plate-1x2", left + 1, m, z, 1, TIMBER));
    out.push(P("brick-1x1", right, m, z + 1, 0, STONE), P("plate-1x2", right - 1, m, z, 1, TIMBER));
  }
  for (const x of [left + 2, left + 4, left + 6, right - 7, right - 5, right - 3]) out.push(P("brick-1x1", x, m, back, 0, STONE), P("plate-1x2", x, m, back + 1, 0, TIMBER));
  return out;
}

const reference: Placement[] = [
  ...walls(),
  ...tower(OX, OZ + 12, 8),
  ...tower(OX + 18, OZ + 12, 8),
  ...hall(OX + 8, OZ),
  // the courtyard's paving in front of the hall
  P("plate-6x6", OX + 6, 0, OZ + 8, 0, "sand"),
  P("plate-6x6", OX + 12, 0, OZ + 8, 0, "sand"),
];

export const CASTLE_SCENE: SceneTemplate = {
  id: "castle-01",
  version: 1,
  bounds: { w: 32, d: 26, h: 48 },
  reference,
  kit,
  additions: {},
  maxPlayers: 4,
};
