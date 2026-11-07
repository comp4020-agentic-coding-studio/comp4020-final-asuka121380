import type { Rotation } from "./grid.ts";
import type { Placement } from "./rules.ts";
import type { FixedPiece, SceneTemplate } from "./scene.ts";

// Woodland Commons, the tree-house scene (ADR 0016). Its kit comes from the
// parts counted in the cabin, roof and stair bags of the official building
// instructions for LEGO Ideas Tree House 21318, mapped to this game's
// catalogue. The counting, the mapping and every substitution are recorded in
// doc/research/0003-tree-house-reference.md. The tree itself (base, trunk,
// branches, foliage) is not in the kit: it is the scene's fixed structure
// below, which the rules treat as already built.

/** Required quantity per game part, from the research record's mapping table. */
export const TREEHOUSE_REQUIRED: Readonly<Record<string, number>> = {
  "plate-1x2": 265,
  "plate-1x4": 160,
  "plate-2x2": 124,
  "brick-1x1": 107,
  "plate-1x1": 105,
  "plate-2x4": 70,
  "round-1x1": 39,
  "slope-2x2": 36,
  "brick-1x4": 34,
  "brick-1x2": 33,
  "round-brick-1x1": 27,
  "window-1x2x2": 20,
  "slope-2x1": 19,
  "plate-6x6": 12,
  "fence-1x4x1": 10,
  "brick-2x4": 9,
  "plate-2x8": 5,
  "arch-1x4": 4,
  "stairs-2x4": 4,
  "door-1x4x6": 3,
  flower: 3,
  "brick-2x2": 1,
};

/** allocated quantity = ceil(required quantity × 1.30), in whole pieces (the castle's rule, ADR 0015). */
const allocate = (required: number): number => Math.ceil(Math.round(required * 130) / 100);

const kit = Object.fromEntries(Object.entries(TREEHOUSE_REQUIRED).map(([id, n]) => [id, allocate(n)]));

// ---- the fixed tree -----------------------------------------------------------
//
// Plot 32 × 28 studs, 72 plates high. The trunk stands behind the working
// area (z 1–10 of 28), so the front of the plot stays open at every height.
// Three branch platforms are the starting supports, one per height zone
// above the ground: left at 12 plates, right at 24, and the crown deck on the
// trunk's top at 36. Only those three decks carry studs. The trunk, roots and
// branches are solid and studless: nothing rests on them and nothing passes
// through them. These coordinates are frozen for `treehouse-01`.

const F = (id: string, kind: FixedPiece["kind"], x: number, y: number, z: number, w: number, d: number, h: number): FixedPiece => ({
  id,
  kind,
  x,
  y,
  z,
  w,
  d,
  h,
  studs: kind === "deck",
});

export const TREE_PIECES: readonly FixedPiece[] = [
  // the trunk: a broad lower trunk up to the crown deck, and the stem that
  // carries on behind the crown cabin into the canopy
  F("trunk-lower", "trunk", 13, 0, 1, 6, 10, 35),
  F("trunk-stem", "trunk", 13, 35, 1, 6, 4, 37),
  // roots spreading on the ground
  F("root-left", "root", 11, 0, 5, 2, 4, 3),
  F("root-right", "root", 19, 0, 4, 2, 4, 3),
  F("root-front", "root", 14, 0, 11, 3, 1, 2),
  // the branches under the side platforms
  F("branch-left", "branch", 7, 8, 7, 6, 2, 3),
  F("branch-right", "branch", 19, 20, 7, 6, 2, 3),
  // the platforms: the only support surfaces
  F("deck-left", "deck", 1, 11, 4, 8, 8, 1),
  F("deck-right", "deck", 23, 23, 5, 8, 8, 1),
  F("deck-crown", "deck", 11, 35, 5, 10, 8, 1),
];

// ---- the reference assembly ---------------------------------------------------
//
// An adapted assembly of the official build: three timber cabins, one on each
// platform, with a door onto a porch, windows, a wall-top band and a blue
// 45° gable roof (the official octagonal roofs, substituted as a whole);
// stairs from the ground to the two side platforms and from the right porch
// up to the crown deck; porch railings; and a little picnic spot on the
// ground. Built only from the kit, and checked against the rules by the
// tests, in this order.

const P = (partId: string, x: number, y: number, z: number, rot: Rotation, colour: string): Placement => ({ partId, x, y, z, rot, colour });

const LOG = "nougat";
const DARK = "bark";
const BAND = "charcoal";
const ROOF = "navy";
const TRIM = "sand";

type Axis = "x" | "z";

/** One course of bricks along a wall: long pieces first, 1×1s to finish. */
function bricks(axis: Axis, from: number, length: number, at: number, y: number, colour: string, offset = false): Placement[] {
  const out: Placement[] = [];
  let i = 0;
  const put = (id: string, n: number, c = colour) => {
    const v = from + i;
    out.push(axis === "x" ? P(id, v, y, at, 0, c) : P(id, at, y, v, n === 1 ? 0 : 1, c));
    i += n;
  };
  if (offset && length - i >= 3) put("brick-1x1", 1);
  while (length - i >= 4) put("brick-1x4", 4);
  while (length - i >= 2) put("brick-1x2", 2);
  while (length - i >= 1) put(i % 2 ? "round-brick-1x1" : "brick-1x1", 1, i % 2 ? DARK : colour);
  return out;
}

/** One layer of plates along a wall. */
function plates(axis: Axis, from: number, length: number, at: number, y: number, colour: string, offset = false): Placement[] {
  const out: Placement[] = [];
  let i = 0;
  const put = (id: string, n: number) => {
    const v = from + i;
    out.push(axis === "x" ? P(id, v, y, at, 0, colour) : P(id, at, y, v, n === 1 ? 0 : 1, colour));
    i += n;
  };
  if (offset && length - i >= 3) put("plate-1x1", 1);
  while (length - i >= 4) put("plate-1x4", 4);
  while (length - i >= 2) put("plate-1x2", 2);
  while (length - i >= 1) put("plate-1x1", 1);
  return out;
}

/**
 * A cabin 8 wide and 6 deep standing on a platform at height `base`, its
 * door in the middle of the front wall (facing +z). Walls are 18 plates
 * high, alternating a course of log bricks with three layers of plates, as
 * the official walls alternate logs with stacked plates; a window in each
 * side wall and in the back wall; a dark band on the wall top; and a 45°
 * gable roof whose ridge runs front to back.
 */
function cabin(cx: number, cz: number, base: number): Placement[] {
  const out: Placement[] = [];
  const back = cz;
  const front = cz + 5;
  const left = cx;
  const right = cx + 7;
  // the door first, standing on the platform
  out.push(P("door-1x4x6", cx + 2, base, front, 0, DARK));
  for (let k = 0; k < 6; k++) {
    const y0 = base + 3 * k;
    const windowCourse = k === 2 || k === 3;
    const offset = k % 4 >= 2;
    if (k % 2 === 0) {
      // a course of log bricks
      out.push(...(windowCourse ? [...bricks("x", left, 3, back, y0, LOG), ...bricks("x", left + 5, 3, back, y0, LOG)] : bricks("x", left, 8, back, y0, LOG, offset)));
      out.push(...bricks("x", left, 2, front, y0, LOG), ...bricks("x", right - 1, 2, front, y0, LOG));
      for (const x of [left, right]) {
        out.push(...(windowCourse ? [...bricks("z", back + 1, 1, x, y0, LOG), ...bricks("z", back + 4, 1, x, y0, LOG)] : bricks("z", back + 1, 4, x, y0, LOG)));
      }
    } else {
      // three layers of plates
      for (let j = 0; j < 3; j++) {
        const y = y0 + j;
        const colour = j === 1 ? DARK : LOG;
        const o = (j + k) % 2 === 1;
        out.push(...(windowCourse ? [...plates("x", left, 3, back, y, colour), ...plates("x", left + 5, 3, back, y, colour)] : plates("x", left, 8, back, y, colour, o)));
        out.push(...plates("x", left, 2, front, y, colour), ...plates("x", right - 1, 2, front, y, colour));
        for (const x of [left, right]) {
          out.push(...(windowCourse ? [...plates("z", back + 1, 1, x, y, colour), ...plates("z", back + 4, 1, x, y, colour)] : plates("z", back + 1, 4, x, y, colour, o)));
        }
      }
    }
    if (k === 2) {
      // windows 1×2×2 fill the gaps left in courses 2 and 3
      out.push(P("window-1x2x2", left + 3, y0, back, 0, DARK));
      out.push(P("window-1x2x2", left, y0, back + 2, 1, DARK), P("window-1x2x2", right, y0, back + 2, 1, DARK));
    }
  }
  const top = base + 18;
  // the wall-top band, over the door too
  out.push(...plates("x", left, 8, back, top, BAND), ...plates("x", left, 8, front, top, BAND));
  for (const x of [left, right]) out.push(...plates("z", back + 1, 4, x, top, BAND));
  // the roof: three 2×8 plates front to back and a row of 2×2 plates,
  // three 2×4 bricks under the ridge, then two courses of 45° slopes
  const deck = top + 1;
  for (const x of [left, left + 2, left + 4, left + 6]) {
    out.push(P("plate-2x4", x, deck, back, 1, ROOF), P("plate-2x2", x, deck, back + 4, 0, ROOF));
  }
  out.push(P("brick-2x4", left + 2, deck + 1, back, 1, ROOF), P("brick-2x4", left + 4, deck + 1, back, 1, ROOF));
  out.push(P("brick-2x4", left + 2, deck + 1, back + 4, 0, ROOF));
  for (const z of [back, back + 2, back + 4]) {
    out.push(P("slope-2x2", left, deck + 1, z, 3, ROOF), P("slope-2x2", right - 1, deck + 1, z, 1, ROOF));
    out.push(P("slope-2x2", left + 2, deck + 4, z, 3, ROOF), P("slope-2x2", left + 4, deck + 4, z, 1, ROOF));
  }
  return out;
}

const reference: Placement[] = [
  // left cabin on the left platform (top 12), stairs up from the ground
  ...cabin(1, 4, 12),
  P("fence-1x4x1", 5, 12, 11, 0, DARK),
  P("stairs-2x4", 3, 0, 12, 0, DARK),
  // right cabin on the right platform (top 24), two flights from the ground
  ...cabin(23, 5, 24),
  P("fence-1x4x1", 27, 24, 12, 0, DARK),
  P("stairs-2x4", 25, 0, 16, 0, DARK),
  P("stairs-2x4", 25, 12, 13, 0, DARK),
  // a flight from the right porch up to the crown deck (rising towards −x)
  P("stairs-2x4", 21, 24, 11, 1, DARK),
  // the crown cabin (top 36)
  ...cabin(12, 5, 36),
  P("fence-1x4x1", 11, 36, 12, 0, DARK),
  // a picnic spot on the ground in front of the trunk
  P("plate-6x6", 12, 0, 18, 0, "leaf"),
  P("brick-1x2", 14, 1, 20, 0, DARK),
  P("plate-2x4", 13, 4, 20, 0, TRIM),
  P("round-brick-1x1", 12, 1, 20, 0, DARK),
  P("round-brick-1x1", 17, 1, 21, 0, DARK),
  P("flower", 12, 1, 23, 0, "orange"),
  P("flower", 17, 1, 18, 0, "bright-red"),
  P("flower", 9, 0, 14, 0, "butter"),
];

export const TREEHOUSE_SCENE: SceneTemplate = {
  id: "treehouse-01",
  version: 1,
  bounds: { w: 32, d: 28, h: 72 },
  reference,
  kit,
  additions: {},
  maxPlayers: 6,
  fixed: { version: 1, pieces: TREE_PIECES },
};
